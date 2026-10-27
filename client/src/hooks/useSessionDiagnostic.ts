/**
 * @file useSessionDiagnostic.ts
 * @description Loads the session diagnostic (GET /api/analytics/diagnostic)
 * for a period in days, reloading when the period or the global data scope
 * changes. Exposes the result, a loading flag and a load error so callers
 * can render each state; a failed reload keeps the last good result.
 */

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useDataScope } from "../lib/dataScope";
import type { SessionDiagnostic } from "../lib/types";

export interface SessionDiagnosticState {
  diagnostic: SessionDiagnostic | null;
  loading: boolean;
  failed: boolean;
}

export function useSessionDiagnostic(days: number, enabled = true): SessionDiagnosticState {
  const [scope] = useDataScope();
  const [state, setState] = useState<SessionDiagnosticState>({
    diagnostic: null,
    loading: enabled,
    failed: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, failed: false }));
    api.analytics
      .diagnostic(days)
      .then((diagnostic) => {
        if (!cancelled) setState({ diagnostic, loading: false, failed: false });
      })
      .catch((err: unknown) => {
        console.warn(`[diagnostic] load failed for ${days} days:`, err);
        if (!cancelled) setState((previous) => ({ ...previous, loading: false, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [days, enabled, scope]);

  return state;
}
