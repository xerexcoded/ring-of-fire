import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AskServerConfig } from "@/lib/ask/config";

export const ASK_SESSION_COOKIE = "rp_ai_session";
const DAY_MS = 24 * 60 * 60 * 1000;

type Counter = { startedAt: number; count: number };
type RateState = { window: Counter; day: Counter };

const rateStates = new Map<string, RateState>();
const activeSessions = new Set<string>();
let claimCount = 0;

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(header: string | null) {
  const cookies = new Map<string, string>();
  for (const item of (header ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    cookies.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()));
  }
  return cookies;
}

function validSignedSession(value: string | undefined, secret: string) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = signature(id, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  return id;
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function resetCounter(counter: Counter, now: number, duration: number) {
  if (now - counter.startedAt >= duration) return { startedAt: now, count: 0 };
  return counter;
}

function cookiePath() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/$/, "");
  return basePath || "/";
}

export type AnonymousRequestClaim = {
  sessionHash: string;
  setCookie?: string;
  release: () => void;
};

export class AskRateLimitError extends Error {
  constructor(
    public readonly code: "rate-limited" | "request-active",
    public readonly retryAfterSeconds: number,
  ) {
    super(code);
    this.name = "AskRateLimitError";
  }
}

export function claimAnonymousRequest(request: Request, config: AskServerConfig, now = Date.now()): AnonymousRequestClaim {
  if (!config.sessionSecret) throw new Error("AI session secret is unavailable");
  const existing = validSignedSession(
    parseCookies(request.headers.get("cookie")).get(ASK_SESSION_COOKIE),
    config.sessionSecret,
  );
  const sessionId = existing ?? randomBytes(24).toString("base64url");
  const signedSession = `${sessionId}.${signature(sessionId, config.sessionSecret)}`;
  const sessionHash = createHmac("sha256", config.sessionSecret)
    .update(`${sessionId}:${clientIp(request)}`)
    .digest("hex");

  claimCount += 1;
  if (claimCount % 100 === 0) {
    for (const [key, state] of rateStates) {
      if (!activeSessions.has(key) && now - state.day.startedAt >= DAY_MS) rateStates.delete(key);
    }
  }

  if (activeSessions.has(sessionHash)) throw new AskRateLimitError("request-active", 2);

  const previous = rateStates.get(sessionHash) ?? {
    window: { startedAt: now, count: 0 },
    day: { startedAt: now, count: 0 },
  };
  const window = resetCounter(previous.window, now, config.windowMs);
  const day = resetCounter(previous.day, now, DAY_MS);
  if (window.count >= config.windowLimit) {
    throw new AskRateLimitError("rate-limited", Math.max(1, Math.ceil((config.windowMs - (now - window.startedAt)) / 1000)));
  }
  if (day.count >= config.dailyLimit) {
    throw new AskRateLimitError("rate-limited", Math.max(1, Math.ceil((DAY_MS - (now - day.startedAt)) / 1000)));
  }

  rateStates.set(sessionHash, {
    window: { ...window, count: window.count + 1 },
    day: { ...day, count: day.count + 1 },
  });
  activeSessions.add(sessionHash);
  let released = false;

  return {
    sessionHash,
    setCookie: existing ? undefined : [
      `${ASK_SESSION_COOKIE}=${encodeURIComponent(signedSession)}`,
      `Path=${cookiePath()}`,
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=604800",
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ].filter(Boolean).join("; "),
    release: () => {
      if (released) return;
      released = true;
      activeSessions.delete(sessionHash);
    },
  };
}

export function resetAskRateLimitsForTests() {
  rateStates.clear();
  activeSessions.clear();
  claimCount = 0;
}
