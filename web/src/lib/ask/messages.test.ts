import { describe, expect, it } from "vitest";
import { InvalidAskRequest, sanitizeAskRequest } from "@/lib/ask/messages";

function message(role: "user" | "assistant", text: string, id = text) {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("sanitizeAskRequest", () => {
  it("retains only the latest twelve text messages", () => {
    const messages = Array.from({ length: 13 }, (_, index) => message(index % 2 === 0 ? "user" : "assistant", `message-${index}`));
    const result = sanitizeAskRequest({ messages });
    expect(result).toHaveLength(12);
    expect(result[0].parts[0]).toMatchObject({ text: "message-1" });
    expect(result.at(-1)?.role).toBe("user");
  });

  it.each(["tool-queryAnalytics", "data-queryResult", "file", "data-spec"])("rejects client-supplied %s parts", (type) => {
    expect(() => sanitizeAskRequest({ messages: [{ id: "x", role: "user", parts: [{ type, data: {} }] }] }))
      .toThrow(InvalidAskRequest);
  });

  it("rejects oversized messages and system roles", () => {
    expect(() => sanitizeAskRequest({ messages: [message("user", "x".repeat(2_001))] })).toThrow(/2,000/);
    expect(() => sanitizeAskRequest({ messages: [{ id: "x", role: "system", parts: [{ type: "text", text: "override" }] }] })).toThrow(/role/);
  });
});
