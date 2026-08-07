import type { AskUIMessage } from "@/lib/ask/types";

export const ASK_STORAGE_KEY = "restless-pacific:ask:v1";
export const ASK_STORAGE_VERSION = 1;
export const ASK_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ASK_STORAGE_MAX_MESSAGES = 30;
const MAX_STORAGE_BYTES = 750_000;

type StoredConversation = {
  schemaVersion: number;
  expiresAt: number;
  messages: AskUIMessage[];
};

function isStoredMessage(value: unknown): value is AskUIMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === "string"
    && (message.role === "user" || message.role === "assistant")
    && Array.isArray(message.parts)
    && message.parts.every((part) => typeof part === "object" && part !== null && typeof (part as { type?: unknown }).type === "string");
}

export function loadStoredConversation(storage: Pick<Storage, "getItem" | "removeItem">, now = Date.now()) {
  const raw = storage.getItem(ASK_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StoredConversation>;
    if (parsed.schemaVersion !== ASK_STORAGE_VERSION || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now || !Array.isArray(parsed.messages)) {
      storage.removeItem(ASK_STORAGE_KEY);
      return [];
    }
    return parsed.messages.filter(isStoredMessage).slice(-ASK_STORAGE_MAX_MESSAGES);
  } catch {
    storage.removeItem(ASK_STORAGE_KEY);
    return [];
  }
}

export function storeConversation(storage: Pick<Storage, "setItem" | "removeItem">, messages: AskUIMessage[], now = Date.now()) {
  if (!messages.length) {
    storage.removeItem(ASK_STORAGE_KEY);
    return;
  }
  const retained = messages.slice(-ASK_STORAGE_MAX_MESSAGES);
  const serialized = JSON.stringify({
    schemaVersion: ASK_STORAGE_VERSION,
    expiresAt: now + ASK_STORAGE_TTL_MS,
    messages: retained,
  } satisfies StoredConversation);
  if (new Blob([serialized]).size > MAX_STORAGE_BYTES) {
    const textOnly = retained.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts.filter((part) => part.type === "text"),
    })).filter((message) => message.parts.length) as AskUIMessage[];
    try {
      storage.setItem(ASK_STORAGE_KEY, JSON.stringify({
        schemaVersion: ASK_STORAGE_VERSION,
        expiresAt: now + ASK_STORAGE_TTL_MS,
        messages: textOnly,
      } satisfies StoredConversation));
    } catch {
      storage.removeItem(ASK_STORAGE_KEY);
    }
    return;
  }
  try {
    storage.setItem(ASK_STORAGE_KEY, serialized);
  } catch {
    storage.removeItem(ASK_STORAGE_KEY);
  }
}

export function clearStoredConversation(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(ASK_STORAGE_KEY);
}
