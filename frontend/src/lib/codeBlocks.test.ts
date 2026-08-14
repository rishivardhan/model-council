import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "./codeBlocks";

describe("extractCodeBlocks", () => {
  it("extracts a single fenced block with language", () => {
    const text = "Here you go:\n```python\nprint('hi')\n```\nDone.";
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe("python");
    expect(blocks[0].code).toBe("print('hi')\n");
  });

  it("extracts multiple blocks in order", () => {
    const text = "```js\na()\n```\ntext\n```ts\nb()\n```";
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].code).toBe("a()\n");
    expect(blocks[1].code).toBe("b()\n");
  });

  it("returns empty array when there are no code blocks", () => {
    expect(extractCodeBlocks("just plain text")).toEqual([]);
  });
});
