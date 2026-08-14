import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "./councilStream";

describe("parseSSEChunk", () => {
  it("parses frames separated by \\n\\n (unix line endings)", () => {
    const buffer = 'event: run_start\ndata: {"a":1}\n\nevent: token\ndata: {"b":2}\n\n';
    const { frames, rest } = parseSSEChunk(buffer);
    expect(frames).toEqual([
      { event: "run_start", data: '{"a":1}' },
      { event: "token", data: '{"b":2}' },
    ]);
    expect(rest).toBe("");
  });

  it("parses frames separated by \\r\\n\\r\\n (sse-starlette's actual wire format)", () => {
    const buffer =
      'event: run_start\r\ndata: {"a":1}\r\n\r\nevent: token\r\ndata: {"b":2}\r\n\r\n';
    const { frames, rest } = parseSSEChunk(buffer);
    expect(frames).toEqual([
      { event: "run_start", data: '{"a":1}' },
      { event: "token", data: '{"b":2}' },
    ]);
    expect(rest).toBe("");
  });

  it("keeps an incomplete trailing frame in `rest` for the next chunk", () => {
    const buffer = 'event: token\r\ndata: {"a":1}\r\n\r\nevent: token\r\ndata: {"b":2}';
    const { frames, rest } = parseSSEChunk(buffer);
    expect(frames).toEqual([{ event: "token", data: '{"a":1}' }]);
    expect(rest).toContain('{"b":2}');
  });

  it("defaults to 'message' event type when no event: line is present", () => {
    const buffer = 'data: {"a":1}\r\n\r\n';
    const { frames } = parseSSEChunk(buffer);
    expect(frames[0].event).toBe("message");
  });
});
