// Stable per-model color identity, assigned by position so it's
// deterministic across a run regardless of which models are in play.

export interface ModelIdentity {
  color: string; // accent color, used sparingly (border/label), not fills
  short: string; // compact label for tight UI
}

const PALETTE: ModelIdentity[] = [
  { color: "#5B8DEF", short: "A" }, // blue
  { color: "#E0A253", short: "B" }, // amber
  { color: "#7FBF7F", short: "C" }, // green
  { color: "#C77DFF", short: "D" }, // violet (spare, for >3 models)
];

export function identityFor(model: string, allModels: string[]): ModelIdentity {
  const idx = Math.max(0, allModels.indexOf(model));
  return PALETTE[idx % PALETTE.length];
}

export function shortLabel(model: string): string {
  // e.g. "qwen2.5-coder:1.5b" -> "qwen2.5-coder 1.5b"
  return model.replace(":", " ");
}
