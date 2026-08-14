import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline";
import type { TraceEvent } from "./useTrace";

function ev(partial: Partial<TraceEvent> & { stage: string; ts: number }): TraceEvent {
  return { seq: 0, ...partial } as TraceEvent;
}

describe("buildTimeline", () => {
  it("returns empty rows for no events", () => {
    const { rows } = buildTimeline([], (m) => m);
    expect(rows).toEqual([]);
  });

  it("builds one row per model spanning dispatch to completion", () => {
    const events: TraceEvent[] = [
      ev({ stage: "request_received", ts: 1000 }),
      ev({ stage: "model_dispatched", model: "a", ts: 1010 }),
      ev({ stage: "model_dispatched", model: "b", ts: 1012 }),
      ev({ stage: "model_completed", model: "a", ts: 1500 }),
      ev({ stage: "model_completed", model: "b", ts: 1800 }),
      ev({ stage: "arbiter_invoked", ts: 1810 }),
      ev({ stage: "arbiter_completed", ts: 2200 }),
      ev({ stage: "run_complete", ts: 2210 }),
    ];

    const { rows, minTs, maxTs } = buildTimeline(events, (m) => m.toUpperCase());

    expect(minTs).toBe(1000);
    expect(maxTs).toBe(2210);

    const rowA = rows.find((r) => r.key === "model-a")!;
    expect(rowA.startTs).toBe(1010);
    expect(rowA.endTs).toBe(1500);
    expect(rowA.label).toBe("A");

    const rowB = rows.find((r) => r.key === "model-b")!;
    expect(rowB.startTs).toBe(1012);
    expect(rowB.endTs).toBe(1800);

    const arbiterRow = rows.find((r) => r.key === "arbiter")!;
    expect(arbiterRow.startTs).toBe(1810);
    expect(arbiterRow.endTs).toBe(2200);
  });

  it("uses the dispatch timestamp as the end when a model never completes or fails", () => {
    const events: TraceEvent[] = [ev({ stage: "model_dispatched", model: "a", ts: 500 })];
    const { rows } = buildTimeline(events, (m) => m);
    expect(rows[0].startTs).toBe(500);
    expect(rows[0].endTs).toBe(500);
  });

  it("uses model_failed as the end time when a model errors", () => {
    const events: TraceEvent[] = [
      ev({ stage: "model_dispatched", model: "a", ts: 500 }),
      ev({ stage: "model_failed", model: "a", ts: 900 }),
    ];
    const { rows } = buildTimeline(events, (m) => m);
    expect(rows[0].endTs).toBe(900);
  });
});
