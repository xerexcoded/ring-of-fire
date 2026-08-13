import { randomUUID } from "node:crypto";
import { pipeJsonRender } from "@json-render/core";
import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
} from "ai";
import { createAskAgent, type AskRunSummary } from "@/lib/ask/agent";
import { getAskServerConfig } from "@/lib/ask/config";
import { InvalidAskRequest, sanitizeAskRequest } from "@/lib/ask/messages";
import { AskRateLimitError, claimAnonymousRequest } from "@/lib/ask/rate-limit";
import type { AskUIMessage, NormalizedResult, SourceReceipt } from "@/lib/ask/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const ASK_TOTAL_TIMEOUT_MS = 42_000;
const ASK_TOOL_TIMEOUT_MS = 13_000;
const ASK_FIRST_CHUNK_TIMEOUT_MS = 16_000;
const ASK_CLAIM_FAILSAFE_MS = ASK_TOTAL_TIMEOUT_MS + 5_000;
type AskFinalStatus =
  | "running"
  | "completed"
  | "aborted"
  | "timed-out"
  | "incomplete"
  | "provider-rate-limited"
  | "metabase-offline"
  | "atlas-offline"
  | "model-offline"
  | "invalid-upstream-response"
  | "generation-failed";

function jsonError(status: number, code: string, message: string, headers?: HeadersInit, details?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...details } }, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function requestOriginAllowed(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const allowed = new Set([
    url.origin,
    host ? `${protocol}://${host}` : "",
    process.env.NEXT_PUBLIC_SITE_URL ?? "",
    ...(process.env.AI_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()),
  ].filter(Boolean));
  return allowed.has(origin);
}

function hasStatusCode(error: unknown, statusCode: number, depth = 0): boolean {
  if (depth > 3 || typeof error !== "object" || error === null) return false;
  const candidate = error as { statusCode?: unknown; status?: unknown; cause?: unknown };
  return candidate.statusCode === statusCode || candidate.status === statusCode
    || hasStatusCode(candidate.cause, statusCode, depth + 1);
}

export function normalizedError(error: unknown): Exclude<AskFinalStatus, "running" | "completed"> {
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (hasStatusCode(error, 429) || /(?:rate[ -]?limit|too many requests|\b429\b)/i.test(`${code} ${message}`)) {
    return "provider-rate-limited";
  }
  if (candidate.name === "TimeoutError" || /(?:timed? ?out|timeout)/i.test(message)) return "timed-out";
  if (candidate.name === "AbortError") return "aborted";
  if (["metabase-offline", "atlas-offline", "model-offline", "invalid-upstream-response"].includes(code)) {
    return code as Exclude<AskFinalStatus, "running" | "completed">;
  }
  return "generation-failed";
}

function streamErrorMessage(code: AskFinalStatus) {
  const messages: Partial<Record<AskFinalStatus, string>> = {
    "provider-rate-limited": "The model provider is busy right now. Please retry shortly.",
    "timed-out": "The guide took too long to complete this answer. Please retry with a shorter question.",
    incomplete: "The answer stream ended before the guide could finish. Please retry.",
    "generation-failed": "The geology guide could not complete this answer. Please retry.",
  };
  return JSON.stringify({ error: { code, message: messages[code] ?? messages["generation-failed"] } });
}

export function withTerminalFailure(
  stream: ReadableStream<InferUIMessageChunk<AskUIMessage>>,
  requestSignal: AbortSignal,
  onFailure: (status: "timed-out" | "incomplete") => void,
) {
  let sawTerminalFinish = false;
  let sawError = false;
  let sawAbort = false;
  return stream.pipeThrough(new TransformStream<InferUIMessageChunk<AskUIMessage>, InferUIMessageChunk<AskUIMessage>>({
    transform(chunk, controller) {
      if (chunk.type === "finish" && chunk.finishReason != null && chunk.finishReason !== "error") sawTerminalFinish = true;
      if (chunk.type === "error") sawError = true;
      if (chunk.type === "abort") sawAbort = true;
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (sawTerminalFinish || sawError || requestSignal.aborted) return;
      const status = sawAbort ? "timed-out" : "incomplete";
      onFailure(status);
      controller.enqueue({ type: "error", errorText: streamErrorMessage(status) });
    },
  }));
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const config = getAskServerConfig();
  if (!requestOriginAllowed(request)) return jsonError(403, "origin-not-allowed", "This origin cannot use Ask the Pacific.");
  if (!config.available) return jsonError(503, "chat-unavailable", "Ask the Pacific is temporarily unavailable.");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 128_000) return jsonError(413, "request-too-large", "The chat request is too large.");

  let messages: AskUIMessage[];
  try {
    messages = sanitizeAskRequest(await request.json());
  } catch (error) {
    return jsonError(400, "invalid-request", error instanceof InvalidAskRequest ? error.message : "The request body is malformed.");
  }

  let claim: ReturnType<typeof claimAnonymousRequest>;
  try {
    claim = claimAnonymousRequest(request, config);
  } catch (error) {
    if (error instanceof AskRateLimitError) {
      return jsonError(error.code === "request-active" ? 409 : 429, error.code, error.code === "request-active"
        ? "Another answer is already active for this session."
        : "Ask the Pacific has reached this session's rate limit.", { "Retry-After": String(error.retryAfterSeconds) }, { retryAfterSeconds: error.retryAfterSeconds });
    }
    return jsonError(503, "chat-unavailable", "Ask the Pacific is temporarily unavailable.");
  }

  const toolNames: string[] = [];
  const rowCounts: number[] = [];
  const emittedSources = new Set<string>();
  let runSummary: AskRunSummary = {};
  let finalStatus: AskFinalStatus = "running";
  const releaseTimer = setTimeout(claim.release, ASK_CLAIM_FAILSAFE_MS);
  releaseTimer.unref?.();
  request.signal.addEventListener("abort", () => {
    finalStatus = "aborted";
    claim.release();
  }, { once: true });

  const stream = createUIMessageStream<AskUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const emitReceipt = (source: SourceReceipt) => {
        if (emittedSources.has(source.id)) return;
        emittedSources.add(source.id);
        writer.write({ type: "data-sourceReceipt", id: source.id, data: source });
      };
      const emitResult = (result: NormalizedResult) => {
        writer.write({ type: "data-queryResult", id: result.resultId, data: result });
        result.sources.forEach(emitReceipt);
      };
      const agent = createAskAgent({
        config,
        signal: request.signal,
        emitResult,
        emitReceipt,
        onToolExecuted: (name, rowCount) => {
          toolNames.push(name);
          if (rowCount !== undefined) rowCounts.push(rowCount);
        },
        onEnd: (summary) => { runSummary = summary; },
      });
      const agentStream = await createAgentUIStream({
        agent,
        uiMessages: messages,
        abortSignal: request.signal,
        timeout: {
          totalMs: ASK_TOTAL_TIMEOUT_MS,
          toolMs: ASK_TOOL_TIMEOUT_MS,
          firstChunkMs: ASK_FIRST_CHUNK_TIMEOUT_MS,
        },
        sendReasoning: false,
        sendSources: false,
        messageMetadata: () => ({ requestId, modelId: config.modelId }),
        onError: (error) => {
          finalStatus = normalizedError(error);
          return streamErrorMessage(finalStatus);
        },
      });
      const typedAgentStream = agentStream as unknown as ReadableStream<InferUIMessageChunk<AskUIMessage>>;
      writer.merge(pipeJsonRender(withTerminalFailure(typedAgentStream, request.signal, (status) => {
        finalStatus = status;
      })) as ReadableStream<InferUIMessageChunk<AskUIMessage>>);
    },
    onError: (error) => {
      finalStatus = normalizedError(error);
      return streamErrorMessage(finalStatus);
    },
    onEnd: ({ isAborted, finishReason }) => {
      if (finalStatus === "running") {
        const hasTerminalFinish = finishReason != null && finishReason !== "error";
        finalStatus = isAborted
          ? request.signal.aborted ? "aborted" : "timed-out"
          : hasTerminalFinish ? "completed" : "incomplete";
      }
      clearTimeout(releaseTimer);
      claim.release();
      console.info(JSON.stringify({
        event: "ask_pacific_request",
        requestId,
        sessionHash: claim.sessionHash.slice(0, 16),
        modelId: config.modelId,
        latencyMs: Date.now() - startedAt,
        inputTokens: runSummary.inputTokens,
        outputTokens: runSummary.outputTokens,
        totalTokens: runSummary.totalTokens,
        toolNames,
        rowCounts,
        status: finalStatus,
        finishReason: runSummary.finishReason ?? finishReason,
        fallbackModelId: config.fallbackModelId,
      }));
    },
  });

  const headers: Record<string, string> = {
    "Cache-Control": "no-store, no-transform",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
  };
  if (claim.setCookie) headers["Set-Cookie"] = claim.setCookie;
  return createUIMessageStreamResponse({ stream, headers });
}
