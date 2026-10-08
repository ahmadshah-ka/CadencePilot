import { describe, expect, it } from "vitest";
import { isPlainObject, jsonByteSize, normalizeDisplayName } from "./brand-rules";

describe("normalizeDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeDisplayName("  Codex   Foundry \n", 80)).toBe("Codex Foundry");
  });

  it("rejects empty and over-long names, counting characters not bytes", () => {
    expect(normalizeDisplayName("   ", 80)).toBeNull();
    expect(normalizeDisplayName("a".repeat(81), 80)).toBeNull();
    expect(normalizeDisplayName("é".repeat(80), 80)).not.toBeNull();
    expect(normalizeDisplayName("😀".repeat(80), 80)).not.toBeNull();
  });
});

describe("jsonByteSize / isPlainObject", () => {
  it("measures UTF-8 bytes", () => {
    expect(jsonByteSize({ a: "é" })).toBe(new TextEncoder().encode('{"a":"é"}').length);
  });

  it("accepts only plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    for (const v of [null, [], "x", 1, new Date(), new Map()]) expect(isPlainObject(v)).toBe(false);
  });
});
