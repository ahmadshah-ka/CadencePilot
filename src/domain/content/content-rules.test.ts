import { describe, it, expect } from "vitest";
import policy from "@/config/content-policy.json";
import {
  contentSchemas,
  isSafeExternalUrl,
  isActualPublication,
  requiredStages,
} from "./content-rules";
const requestId = "00000000-0000-4000-8000-000000000001",
  schemas = contentSchemas(policy, ["youtube"]);
describe("manual content contracts", () => {
  it("keeps post production free of recording and video steps ordered", () => {
    expect(requiredStages("post")).toEqual(["edit", "ready"]);
    expect(requiredStages("video")).toEqual(["record", "edit", "ready"]);
    expect(requiredStages("short")).toEqual(requiredStages("video"));
  });
  it.each(["", "https://example.test/a", "http://example.test"])(
    "accepts reference %s without fetching",
    (url) => expect(isSafeExternalUrl(url)).toBe(true),
  );
  it.each([
    "javascript:alert(1)",
    "file:///private",
    "https://user:secret@example.test",
    "bad",
    "https://example.test/a b",
  ])("rejects unsafe reference %s", (url) => expect(isSafeExternalUrl(url)).toBe(false));
  it("rejects malformed content, invalid IDs and unknown format", () => {
    const create = { requestId, title: "Title", format: "video", parentId: null, seriesId: null };
    expect(schemas.create.parse(create)).toEqual(create);
    for (const patch of [
      { title: "" },
      { title: "x".repeat(policy.titleMaxLength + 1) },
      { requestId: "bad" },
      { format: "fake" },
      { parentId: "other" },
      { surprise: true },
    ])
      expect(schemas.create.safeParse({ ...create, ...patch }).success).toBe(false);
    expect(
      schemas.edit.safeParse({
        expectedRevision: 1,
        title: "Post",
        sourceUrl: "",
        sourceTranscript: "text",
        notes: "separate",
      }).success,
    ).toBe(true);
    expect(
      schemas.edit.safeParse({
        expectedRevision: 1,
        title: "Post",
        sourceUrl: "",
        sourceTranscript: "x".repeat(policy.transcriptMaxLength + 1),
        notes: "",
      }).success,
    ).toBe(false);
  });
  it("only accepts supported platforms and actual non-future publication timestamps", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(isActualPublication(null, now)).toBe(true);
    expect(isActualPublication("2026-10-15T12:00:00Z", now)).toBe(true);
    expect(isActualPublication("2026-10-16T12:00:00Z", now)).toBe(false);
    expect(isActualPublication("bad", now)).toBe(false);
    expect(
      schemas.publication.safeParse({
        expectedRevision: 0,
        platform: "fake",
        publishedAt: null,
        url: "",
      }).success,
    ).toBe(false);
    expect(
      schemas.publication.safeParse({
        expectedRevision: 0,
        platform: "youtube",
        publishedAt: "2026-10-14T20:00:00+01:00",
        url: "",
      }).success,
    ).toBe(true);
  });
});
