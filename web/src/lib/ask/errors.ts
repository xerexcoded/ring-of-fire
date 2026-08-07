export type AskErrorNotice = {
  code: string;
  message: string;
  canRetry: boolean;
  canStartFresh: boolean;
};

type AskErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
    retryAfterSeconds?: unknown;
  };
};

function parseEnvelope(error: Error): AskErrorEnvelope["error"] | null {
  try {
    const parsed = JSON.parse(error.message) as AskErrorEnvelope;
    return parsed.error && typeof parsed.error === "object" ? parsed.error : null;
  } catch {
    return null;
  }
}

export function formatRetryAfter(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function askErrorNotice(error: Error | undefined): AskErrorNotice | null {
  if (!error) return null;
  const envelope = parseEnvelope(error);
  const code = typeof envelope?.code === "string"
    ? envelope.code
    : ["rate-limited", "request-active", "chat-unavailable", "generation-failed"].find((candidate) => error.message.includes(candidate)) ?? "generation-failed";

  if (code === "rate-limited") {
    const retryAfter = typeof envelope?.retryAfterSeconds === "number" && Number.isFinite(envelope.retryAfterSeconds)
      ? ` Try again in ${formatRetryAfter(envelope.retryAfterSeconds)}.`
      : " Please try again after the retry window.";
    return {
      code,
      message: `Question limit reached.${retryAfter} Starting a new conversation will not reset this wait.`,
      canRetry: false,
      canStartFresh: false,
    };
  }
  if (code === "request-active") {
    return {
      code,
      message: "An answer is already running for this session. Wait a moment, then try again.",
      canRetry: false,
      canStartFresh: false,
    };
  }
  if (code === "chat-unavailable") {
    return {
      code,
      message: "The model or governed analytics service is temporarily unavailable.",
      canRetry: true,
      canStartFresh: false,
    };
  }
  return {
    code,
    message: "The guide couldn’t finish this answer. Retry it, or start a fresh conversation if the problem continues.",
    canRetry: true,
    canStartFresh: true,
  };
}
