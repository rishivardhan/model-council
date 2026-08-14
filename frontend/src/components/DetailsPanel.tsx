"use client";

import { useMemo, useState } from "react";
import type { TraceEvent } from "@/lib/useTrace";
import { identityFor, shortLabel } from "@/lib/modelIdentity";
import { buildTimeline } from "@/lib/timeline";
import styles from "./DetailsPanel.module.css";

interface Props {
  events: TraceEvent[];
  models: string[];
}

export function DetailsPanel({ events, models }: Props) {
  const [payloadsOpen, setPayloadsOpen] = useState<Record<string, boolean>>({});
  const { rows, minTs, maxTs } = useMemo(() => buildTimeline(events, shortLabel), [events]);
  const span = Math.max(1, maxTs - minTs);

  if (events.length === 0) {
    return (
      <div className={styles.empty} data-testid="details-empty">
        No trace data yet - run a prompt to see the execution timeline.
      </div>
    );
  }

  function togglePayload(key: string) {
    setPayloadsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className={styles.panel} data-testid="details-panel">
      <h3 className={styles.heading}>Execution timeline</h3>
      <div className={styles.timeline} data-testid="timeline">
        {rows.map((row) => {
          const leftPct = ((row.startTs - minTs) / span) * 100;
          const widthPct = Math.max(0.5, ((row.endTs - row.startTs) / span) * 100);
          const color = row.model ? identityFor(row.model, models).color : "#8b8b91";
          return (
            <div key={row.key} className={styles.timelineRow} data-testid={`timeline-row-${row.key}`}>
              <span className={styles.rowLabel}>{row.label}</span>
              <div className={styles.rowTrack}>
                <div
                  className={styles.rowBar}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background: color,
                  }}
                  data-testid={`timeline-bar-${row.key}`}
                  title={`${row.label}: ${(row.endTs - row.startTs).toFixed(0)}ms`}
                />
              </div>
              <span className={styles.rowDuration}>{(row.endTs - row.startTs).toFixed(0)}ms</span>
            </div>
          );
        })}
      </div>

      <h3 className={styles.heading}>Raw payloads</h3>
      <div className={styles.payloads}>
        {events
          .filter((e) => e.detail && Object.keys(e.detail).length > 0)
          .map((e) => {
            const key = `${e.seq}`;
            const isOpen = !!payloadsOpen[key];
            return (
              <div key={key} className={styles.payloadItem}>
                <button
                  type="button"
                  className={styles.payloadToggle}
                  onClick={() => togglePayload(key)}
                  data-testid={`payload-toggle-${key}`}
                >
                  {isOpen ? "▾" : "▸"} {e.stage}
                  {e.model ? ` · ${shortLabel(e.model)}` : ""}
                </button>
                {isOpen && (
                  <pre className={styles.payloadBody} data-testid={`payload-body-${key}`}>
                    {JSON.stringify(e.detail, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
