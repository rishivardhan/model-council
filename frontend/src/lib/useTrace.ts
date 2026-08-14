"use client";

import { useCallback, useRef, useState } from "react";
import type { TraceData } from "@/lib/councilStream";

export interface TraceEvent extends TraceData {
  /** order of arrival, for stable sort/keying */
  seq: number;
}

/** Collects Loop 3 structured trace events for the Details panel.
 *
 * Kept as its own hook/state slice (not merged into useCouncilRun's column
 * state) so that trace bookkeeping never re-renders the hot streaming
 * columns, and so the Details panel can be mounted/unmounted independently
 * without touching the main streaming state machine. This is also what
 * keeps "details tab open vs closed" from having any effect on main-stream
 * rendering: the panel subscribes to this hook's state, the streaming
 * columns don't. */
export function useTrace() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const seqRef = useRef(0);

  const record = useCallback((data: TraceData) => {
    seqRef.current += 1;
    setEvents((prev) => [...prev, { ...data, seq: seqRef.current }]);
  }, []);

  const reset = useCallback(() => {
    seqRef.current = 0;
    setEvents([]);
  }, []);

  return { events, record, reset };
}
