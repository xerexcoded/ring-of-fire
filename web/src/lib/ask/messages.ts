import type { AskUIMessage } from "@/lib/ask/types";

export class InvalidAskRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAskRequest";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeAskRequest(body: unknown): AskUIMessage[] {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    throw new InvalidAskRequest("The request must contain a messages array.");
  }
  if (body.messages.length > 60) {
    throw new InvalidAskRequest("The conversation contains too many messages.");
  }

  const sanitized = body.messages.map((message, index) => {
    if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) {
      throw new InvalidAskRequest(`Message ${index + 1} has an invalid role.`);
    }
    if (!Array.isArray(message.parts) || message.parts.length === 0) {
      throw new InvalidAskRequest(`Message ${index + 1} must contain text.`);
    }
    if (message.parts.some((part) => !isRecord(part) || part.type !== "text" || typeof part.text !== "string")) {
      throw new InvalidAskRequest("Attachments, tool results, UI specifications, and non-text parts are not accepted from the browser.");
    }
    const text = message.parts
      .map((part) => (part as { text: string }).text)
      .join("\n")
      .trim();
    if (!text || text.length > 2_000) {
      throw new InvalidAskRequest("Each message must contain between 1 and 2,000 characters.");
    }
    return {
      id: typeof message.id === "string" && message.id.length <= 160 ? message.id : `history-${index}`,
      role: message.role,
      parts: [{ type: "text" as const, text }],
    } satisfies AskUIMessage;
  });

  const retained = sanitized.slice(-12);
  if (retained.at(-1)?.role !== "user") {
    throw new InvalidAskRequest("The final retained message must be from the user.");
  }
  return retained;
}
