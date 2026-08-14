// Extracts fenced ```code``` blocks from a raw model response so the UI can
// render them distinctly and offer keyboard-driven copy.

export interface ExtractedCodeBlock {
  language: string | null;
  code: string;
  index: number;
}

const FENCE_RE = /```([\w-]*)\n([\s\S]*?)```/g;

export function extractCodeBlocks(text: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(text)) !== null) {
    blocks.push({ language: match[1] || null, code: match[2], index });
    index += 1;
  }
  return blocks;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
