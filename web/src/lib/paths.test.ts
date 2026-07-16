import { describe, expect, it } from "vitest";
import { withBasePath } from "@/lib/paths";

describe("withBasePath", () => {
  it("keeps public paths absolute when no base path is configured", () => {
    expect(withBasePath("restless-pacific-mark.svg")).toBe("/restless-pacific-mark.svg");
  });
});
