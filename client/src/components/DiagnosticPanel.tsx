/**
 * @file DiagnosticPanel.tsx
 * @description "Atypical sessions" tab of the Analytics page: a period picker
 * (7 / 30 / 90 days) over the session diagnostic, with loading and error
 * states, rendering DiagnosticTable once data arrives.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessionDiagnostic } from "../hooks/useSessionDiagnostic";
import { DiagnosticTable } from "./DiagnosticTable";
import { Skeleton } from "./Skeleton";

const PERIODS = [7, 30, 90] as const;

export function DiagnosticPanel() {
  const { t } = useTranslation("analytics");
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { diagnostic, loading, failed } = useSessionDiagnostic(days);

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-300">{t("tabs.sessionDiagnostic")}</h3>
        <div
          role="radiogroup"
          aria-label={t("diagnostic.period")}
          className="flex gap-1 rounded-lg bg-surface-2 p-1"
        >
          {PERIODS.map((period) => (
            <button
              key={period}
              role="radio"
              aria-checked={days === period}
              onClick={() => setDays(period)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                days === period ? "bg-surface-4 text-gray-200" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t("diagnostic.days", { count: period })}
            </button>
          ))}
        </div>
      </div>

      {failed && !diagnostic ? (
        <p className="text-sm text-rose-300">{t("diagnostic.loadError")}</p>
      ) : !diagnostic ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <DiagnosticTable diagnostic={diagnostic} />
        </div>
      )}
    </div>
  );
}
