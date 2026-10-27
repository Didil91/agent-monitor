/**
 * @file DiagnosticTable.tsx
 * @description Atypical-sessions panel of the Analytics page: a one-line
 * verdict, the threshold of each metric (the higher of the user's P90 and a
 * fixed floor), the sessions above them with one chip per exceeded metric
 * graded by how far past the threshold it went, and what the diagnostic
 * cannot measure. Presentational only; data comes from useSessionDiagnostic.
 */

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Info } from "lucide-react";
import { fmt, fmtCost, formatDateTime, formatMs, getCurrentLocale } from "../lib/format";
import type { DiagnosticFlag, DiagnosticMetric, SessionDiagnostic } from "../lib/types";

const METRIC_ORDER: DiagnosticMetric[] = [
  "cost",
  "tokens",
  "duration_min",
  "compactions",
  "tool_calls",
];

export function formatDiagnosticValue(metric: DiagnosticMetric, value: number): string {
  if (metric === "cost") return fmtCost(value);
  if (metric === "tokens") return fmt(value);
  if (metric === "duration_min") return formatMs(value * 60_000);
  return String(Math.round(value));
}

export function formatRatio(ratio: number): string {
  const formatted = new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 1 }).format(
    ratio
  );
  return `×${formatted}`;
}

/** Chip tone by how far past the threshold: the further, the louder. */
function ratioTone(ratio: number): string {
  if (ratio >= 5) return "border-rose-400/40 bg-rose-400/10 text-rose-300";
  if (ratio >= 2) return "border-amber-400/40 bg-amber-400/10 text-amber-300";
  return "border-sky-400/30 bg-sky-400/10 text-sky-300";
}

export function DiagnosticFlagChip({ flag }: { flag: DiagnosticFlag }) {
  const { t } = useTranslation("analytics");
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-0.5 text-xs ${ratioTone(flag.ratio)}`}
      title={t("diagnostic.versus", {
        value: formatDiagnosticValue(flag.metric, flag.value),
        threshold: formatDiagnosticValue(flag.metric, flag.threshold),
      })}
    >
      <span>{t(`diagnostic.metric.${flag.metric}`)}</span>
      <span className="font-mono font-semibold tabular-nums">{formatRatio(flag.ratio)}</span>
      {flag.kind === "estimated" && (
        <span className="text-[11px] italic">{t("diagnostic.estimated")}</span>
      )}
    </span>
  );
}

export function DiagnosticTable({ diagnostic }: { diagnostic: SessionDiagnostic }) {
  const { t } = useTranslation("analytics");
  const flagged = diagnostic.sessions.length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-base font-medium text-gray-200">
          {t("diagnostic.summary", { count: flagged, days: diagnostic.period_days })}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {t("diagnostic.sample", { count: diagnostic.sample_size })}.{" "}
          {t("diagnostic.thresholdHint")}
        </p>
      </div>

      <ThresholdStrip thresholds={diagnostic.thresholds} />

      {flagged === 0 ? (
        <p className="rounded-lg border border-dashed border-surface-3 py-8 text-center text-sm text-gray-500">
          {t("diagnostic.empty")}
        </p>
      ) : (
        <FlaggedSessions sessions={diagnostic.sessions} />
      )}

      {diagnostic.limits.length > 0 && <LimitsList limits={diagnostic.limits} />}
    </div>
  );
}

/** Shown on a session's overview when the diagnostic flags that session. */
export function SessionDiagnosticNotice({
  flags,
  days,
}: {
  flags: DiagnosticFlag[];
  days: number;
}) {
  const { t } = useTranslation("analytics");
  return (
    <section className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3.5 py-3">
      <h3 className="text-xs font-semibold text-amber-300">{t("diagnostic.sessionBoxTitle")}</h3>
      <p className="mt-0.5 text-xs text-gray-400">{t("diagnostic.sessionBoxBody", { days })}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {flags.map((flag) => (
          <li key={flag.metric} className="flex items-center gap-1.5">
            <DiagnosticFlagChip flag={flag} />
            <span className="font-mono text-[11px] tabular-nums text-gray-400">
              {t("diagnostic.versus", {
                value: formatDiagnosticValue(flag.metric, flag.value),
                threshold: formatDiagnosticValue(flag.metric, flag.threshold),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ThresholdStrip({ thresholds }: { thresholds: SessionDiagnostic["thresholds"] }) {
  const { t } = useTranslation("analytics");
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-surface-3 bg-surface-3 sm:grid-cols-3 lg:grid-cols-5">
      {METRIC_ORDER.map((metric) => {
        const threshold = thresholds[metric];
        if (!threshold) return null;
        return (
          <div key={metric} className="bg-surface-2 px-3 py-2.5">
            <dt className="text-xs text-gray-400">{t(`diagnostic.metric.${metric}`)}</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-gray-200">
              {formatDiagnosticValue(metric, threshold.threshold)}
            </dd>
            <dd className="mt-0.5 text-[11px] tabular-nums text-gray-400">
              {threshold.p90 != null
                ? t("diagnostic.p90", { value: formatDiagnosticValue(metric, threshold.p90) })
                : t("diagnostic.noP90")}
            </dd>
            <dd className="text-[11px] tabular-nums text-gray-500">
              {t("diagnostic.floor", {
                value: formatDiagnosticValue(metric, threshold.guardrail),
              })}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function FlaggedSessions({ sessions }: { sessions: SessionDiagnostic["sessions"] }) {
  const { t } = useTranslation("analytics");
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-3">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-surface-2 text-xs text-gray-400">
          <tr>
            <th className="px-3 py-2 font-medium">{t("diagnostic.colSession")}</th>
            <th className="px-3 py-2 font-medium">{t("diagnostic.colStarted")}</th>
            <th className="px-3 py-2 font-medium">{t("diagnostic.colAbove")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-3">
          {sessions.map((session) => (
            <tr key={session.id} className="align-top hover:bg-surface-2/60">
              <td className="max-w-[18rem] px-3 py-2.5">
                <Link
                  to={`/sessions/${session.id}`}
                  className="block truncate font-medium text-gray-200 hover:text-accent"
                >
                  {session.name || session.id}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-gray-400">
                {formatDateTime(session.started_at)}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {session.flags.map((flag) => (
                    <DiagnosticFlagChip key={flag.metric} flag={flag} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LimitsList({ limits }: { limits: string[] }) {
  const { t } = useTranslation("analytics");
  return (
    <div className="flex gap-2 text-xs text-gray-400">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div>
        <span className="font-medium text-gray-300">{t("diagnostic.limitsTitle")} </span>
        <ul className="inline">
          {limits.map((limit) => (
            <li key={limit} className="inline after:content-['_'] last:after:content-none">
              {t(`diagnostic.limit.${limit}`, { defaultValue: limit })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
