/**
 * @file useContextTimeline.ts
 * @description Loads a session's context-window timeline (GET
 * /api/sessions/:id/context-timeline) and reloads it whenever `refreshKey`
 * changes — the session overview passes its live event count so the curve
 * follows an active session. Keeps the last good timeline on a failed reload.
 */

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ContextTimeline } from "../lib/types";

export function useContextTimeline(
  sessionId: string,
  enabled: boolean,
  refreshKey: number
): ContextTimeline | null {
  const [timeline, setTimeline] = useState<ContextTimeline | null>(null);

  useEffect(() => {
    setTimeline(null);
  }, [sessionId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.sessions
      .contextTimeline(sessionId)
      .then((loaded) => {
        if (!cancelled) setTimeline(loaded);
      })
      .catch((err: unknown) => {
        console.warn(`[context-timeline] reload failed for ${sessionId}:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled, refreshKey]);

  return timeline;
}
