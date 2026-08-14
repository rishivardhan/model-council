import type { TraceEvent } from "@/lib/useTrace";

export interface TimelineRow {
  key: string;
  label: string;
  model: string | null;
  startTs: number;
  endTs: number;
  kind: "global" | "model" | "arbiter";
}

/** Builds waterfall rows from raw trace events: one row per model dispatch
 * window (model_dispatched -> model_completed/model_failed), one row for the
 * arbiter (arbiter_invoked -> arbiter_completed/failed). Exported standalone
 * so it can be unit tested against real captured trace data without
 * mounting the DetailsPanel component. */
export function buildTimeline(
  events: TraceEvent[],
  shortLabelFn: (model: string) => string
): { rows: TimelineRow[]; minTs: number; maxTs: number } {
  if (events.length === 0) return { rows: [], minTs: 0, maxTs: 1 };

  const byStage = (stage: string) => events.filter((e) => e.stage === stage);

  const rows: TimelineRow[] = [];

  const requestReceived = byStage("request_received")[0];
  const runComplete = byStage("run_complete")[0];

  const modelDispatched = byStage("model_dispatched");
  const modelCompleted = byStage("model_completed");
  const modelFailed = byStage("model_failed");

  for (const dispatch of modelDispatched) {
    const model = dispatch.model!;
    const done = modelCompleted.find((e) => e.model === model);
    const failed = modelFailed.find((e) => e.model === model);
    const end = done ?? failed;
    rows.push({
      key: `model-${model}`,
      label: shortLabelFn(model),
      model,
      startTs: dispatch.ts,
      endTs: end ? end.ts : dispatch.ts,
      kind: "model",
    });
  }

  const arbiterInvoked = byStage("arbiter_invoked")[0];
  const arbiterCompleted = byStage("arbiter_completed")[0];
  const arbiterFailed = byStage("arbiter_failed")[0];
  if (arbiterInvoked) {
    const end = arbiterCompleted ?? arbiterFailed;
    rows.push({
      key: "arbiter",
      label: "Arbiter (phi3.5)",
      model: null,
      startTs: arbiterInvoked.ts,
      endTs: end ? end.ts : arbiterInvoked.ts,
      kind: "arbiter",
    });
  }

  const allTs = events.map((e) => e.ts);
  let minTs = Math.min(...allTs);
  let maxTs = Math.max(...allTs);
  if (requestReceived) minTs = Math.min(minTs, requestReceived.ts);
  if (runComplete) maxTs = Math.max(maxTs, runComplete.ts);
  if (minTs === maxTs) maxTs = minTs + 1;

  return { rows, minTs, maxTs };
}
