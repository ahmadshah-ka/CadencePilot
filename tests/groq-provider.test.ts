import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createGroqProvider, retryAfterMs } from "@/infrastructure/ai/groq-provider";
import type { AiRequest } from "@/application/ports/ai-provider";
const settings = {
  baseUrl: "https://provider.example/v1",
  apiKey: "SECRET_TEST_KEY",
  model: "configured-model",
  capabilities: { streaming: true, structured: true, tools: true, contextTokens: 10000 },
  maxResponseBytes: 10000,
  temperature: 0.3,
};
const request = (): AiRequest => ({
  messages: [{ role: "user", content: "PRIVATE" }],
  tools: [],
  stream: false,
  maxOutputTokens: 100,
  signal: new AbortController().signal,
});
const completion = {
  choices: [{ finish_reason: "stop", message: { content: '{"status":"ok"}' } }],
  usage: { prompt_tokens: 12, completion_tokens: 6 },
};
function fake(response: Response) {
  return vi.fn<typeof fetch>(async () => response);
}
describe("Groq HTTP contract", () => {
  it("uses configured endpoint/model, redirect denial and server-only auth", async () => {
    const transport = fake(Response.json(completion));
    const p = createGroqProvider(settings, transport);
    const result = await p.generate(request());
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 6 });
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe("https://provider.example/v1/chat/completions");
    expect(options!.redirect).toBe("error");
    expect(JSON.parse(String(options!.body))).toMatchObject({
      model: "configured-model",
      max_completion_tokens: 100,
    });
  });
  it("sends separate structured and tool phases and parses proposals", async () => {
    const transport = fake(
      Response.json({
        ...completion,
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call",
                  type: "function",
                  function: { name: "lookup", arguments: '{"query":"topic"}' },
                },
              ],
            },
          },
        ],
      }),
    );
    const p = createGroqProvider(settings, transport);
    expect(
      (
        await p.generate({
          ...request(),
          tools: [
            {
              name: "lookup",
              description: "lookup",
              parameters: { type: "object" },
              validate: z.object({}),
            },
          ],
        })
      ).toolCalls[0]!.arguments,
    ).toEqual({ query: "topic" });
    const t = fake(Response.json(completion));
    await createGroqProvider(settings, t).generate({
      ...request(),
      output: { name: "check", schema: { type: "object" }, validate: z.object({}) },
    });
    expect(JSON.parse(String(t.mock.calls[0]![1]!.body))).toHaveProperty(
      "response_format.json_schema.strict",
      true,
    );
  });
  it.each([429, 401, 500])("normalizes HTTP %s without exposing bodies", async (status) => {
    const p = createGroqProvider(
      settings,
      fake(new Response("SECRET private body", { status, headers: { "retry-after": "2" } })),
    );
    try {
      await p.generate(request());
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain("SECRET");
      expect(e).toMatchObject({
        charged: status < 500 ? "zero" : "unknown",
        kind: status === 429 ? "rate_limit" : status === 401 ? "rejected" : "unavailable",
      });
    }
  });
  it.each(["bad-json", "wrong-shape", "refusal", "bad-tool-json", "too-big", "empty-body"])(
    "rejects unusable responses: %s",
    async (kind) => {
      let response: Response = Response.json({ bad: true });
      if (kind === "bad-json") response = new Response("not json");
      if (kind === "refusal")
        response = Response.json({
          ...completion,
          choices: [{ finish_reason: "stop", message: { refusal: "no" } }],
        });
      if (kind === "bad-tool-json")
        response = Response.json({
          ...completion,
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                tool_calls: [
                  { id: "x", type: "function", function: { name: "x", arguments: "{" } },
                ],
              },
            },
          ],
        });
      if (kind === "too-big") response = new Response("x".repeat(settings.maxResponseBytes + 1));
      if (kind === "empty-body") response = new Response(null);
      await expect(
        createGroqProvider(settings, fake(response)).generate(request()),
      ).rejects.toMatchObject({ kind: "invalid_output", charged: "unknown" });
    },
  );
  it("does not leak network errors and rejects credential-bearing endpoints", async () => {
    await expect(
      createGroqProvider(
        settings,
        vi.fn(async () => {
          throw new Error("SECRET");
        }),
      ).generate(request()),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(() =>
      createGroqProvider({ ...settings, baseUrl: "https://user:secret@provider.example" }),
    ).toThrow();
  });
  it("parses chunk-split UTF8 SSE, tools, finish marker and final usage without exposing reasoning", async () => {
    const events = [
      { choices: [{ delta: { content: "hé" }, finish_reason: null }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: "c", function: { name: "look", arguments: '{"q":' } }],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { name: "up", arguments: '"x"}' } }] },
            finish_reason: "tool_calls",
          },
        ],
      },
      { choices: [], x_groq: { usage: { prompt_tokens: 12, completion_tokens: 6 } } },
    ];
    const wire =
      events.map((x) => `data: ${JSON.stringify(x)}\r\n\r\n`).join("") + "data: [DONE]\n\n";
    const bytes = new TextEncoder().encode(wire);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    });
    const receive = vi.fn(async () => {}),
      got = await createGroqProvider(settings, fake(new Response(body))).generate(
        { ...request(), stream: true },
        receive,
      );
    expect(got.text).toBe("hé");
    expect(receive).toHaveBeenCalledWith("hé");
    expect(got.toolCalls).toEqual([{ id: "c", name: "lookup", arguments: { q: "x" } }]);
    expect(got.usage).toEqual({ inputTokens: 12, outputTokens: 6 });
  });
  it.each(["disconnect", "malformed", "after-done"])("rejects incomplete SSE: %s", async (kind) => {
    const chunk = 'data: {"choices":[{"delta":{"content":"a"},"finish_reason":"stop"}]}\n\n';
    const wire =
      kind === "disconnect"
        ? chunk
        : kind === "malformed"
          ? "data: broken\n\n"
          : chunk + "data: [DONE]\n\ndata: {}\n\n";
    await expect(
      createGroqProvider(settings, fake(new Response(wire))).generate({
        ...request(),
        stream: true,
      }),
    ).rejects.toMatchObject({ charged: "unknown" });
  });
  it("parses retry hints deterministically", () => {
    expect(retryAfterMs("2", 0)).toBe(2000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:03 GMT", 0)).toBe(3000);
    expect(retryAfterMs("invalid", 0)).toBeNull();
    expect(retryAfterMs(null, 0)).toBeNull();
  });
});
