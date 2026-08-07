import { describe, expect, it } from "vitest";
import {
  ASK_STORAGE_KEY,
  ASK_STORAGE_MAX_MESSAGES,
  ASK_STORAGE_TTL_MS,
  clearStoredConversation,
  loadStoredConversation,
  storeConversation,
} from "@/lib/ask/storage";
import type { AskUIMessage } from "@/lib/ask/types";

function messages(count: number): AskUIMessage[] {
  return Array.from({ length: count }, (_, index) => ({ id: String(index), role: index % 2 ? "assistant" : "user", parts: [{ type: "text", text: `message ${index}` }] }));
}

describe("Ask browser storage", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
  }

  it("keeps thirty display messages and expires them after seven days", () => {
    const storage = memoryStorage();
    storeConversation(storage, messages(35), 1_000);
    expect(loadStoredConversation(storage, 1_001)).toHaveLength(ASK_STORAGE_MAX_MESSAGES);
    expect(loadStoredConversation(storage, 1_000 + ASK_STORAGE_TTL_MS + 1)).toEqual([]);
    expect(storage.getItem(ASK_STORAGE_KEY)).toBeNull();
  });

  it("clears immediately", () => {
    const storage = memoryStorage();
    storeConversation(storage, messages(2));
    clearStoredConversation(storage);
    expect(storage.getItem(ASK_STORAGE_KEY)).toBeNull();
  });
});
