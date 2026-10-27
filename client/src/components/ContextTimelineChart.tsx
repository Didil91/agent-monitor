/**
 * @file ContextTimelineChart.tsx
 * @description Session overview panel for a Claude session's context window:
 * a d3-scaled SVG curve of the context size at each assistant turn, numbered
 * amber markers where a compaction cut it, a hover readout per turn, and below
 * the curve one row per compaction (size before → after, share freed, trigger,
 * messages replaced). Presentational only; data comes from useContextTimeline.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Gauge } from "lucide-react";
import { fmt, formatTime } from "../lib/format";
import type { ContextCompaction, ContextTimeline, ContextTimelinePoint } from "../lib/types";

const HEIGHT = 168;
const MARGIN = { top: 18, right: 12, bottom: 20, left: 44 };
const FALLBACK_WIDTH = 720;

/** Track an element's width so the SVG keeps real pixel text sizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ContextTimelineChart({ timeline }: { timeline: ContextTimeline }) {
  const { t } = useTranslation("sessions");
  const { points, compactions } = timeline;
  if (points.length === 0 && compactions.length === 0) return null;

  const peak = points.reduce((max, point) => Math.max(max, point.context_tokens), 0);
  const latest = points.length > 0 ? points[points.length - 1]!.context_tokens : null;

  return (
    <section className="rounded-lg border border-surface-3 bg-surface-2/60 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-300">
          <Gauge className="h-3.5 w-3.5 text-sky-400" />
          {t("contextTitle")}
        </h3>
        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <span className="text-gray-400">{t("contextPeak", { tokens: fmt(peak) })}</span>
          {latest != null && (
            <span className="text-sky-300">{t("contextLatest", { tokens: fmt(latest) })}</span>
          )}
        </div>
      </div>
      {points.length > 0 && <ContextCurve points={points} compactions={compactions} />}
      {compactions.length > 0 && <CompactionList compactions={compactions} />}
    </section>
  );
}

function ContextCurve({
  points,
  compactions,
}: {
  points: ContextTimelinePoint[];
  compactions: ContextCompaction[];
}) {
  const { t } = useTranslation("sessions");
  const [ref, width] = useWidth();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = `context-grad-${useId().replace(/:/g, "")}`;
  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const chart = useMemo(() => {
    const lastTurn = Math.max(points.length, 2);
    const x = d3.scaleLinear().domain([1, lastTurn]).range([0, innerW]);
    const peak = d3.max(points, (p) => p.context_tokens) ?? 0;
    const y = d3
      .scaleLinear()
      .domain([0, peak || 1])
      .nice(4)
      .range([innerH, 0]);
    const line = d3
      .line<ContextTimelinePoint>()
      .x((p) => x(p.turn))
      .y((p) => y(p.context_tokens))
      .curve(d3.curveMonotoneX);
    const area = d3
      .area<ContextTimelinePoint>()
      .x((p) => x(p.turn))
      .y0(innerH)
      .y1((p) => y(p.context_tokens))
      .curve(d3.curveMonotoneX);
    return {
      x,
      y,
      linePath: line(points) ?? "",
      areaPath: area(points) ?? "",
      yTicks: y.ticks(4),
    };
  }, [points, innerW, innerH]);

  const hovered = hoveredIndex != null ? points[hoveredIndex] : undefined;

  function trackPointer(event: React.MouseEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const turn = chart.x.invert(event.clientX - bounds.left);
    const index = Math.min(points.length - 1, Math.max(0, Math.round(turn) - 1));
    setHoveredIndex(index);
  }

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={t("contextChartLabel")}
        className="block overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1" className="text-sky-400">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {chart.yTicks.map((tick) => (
            <g key={tick} transform={`translate(0,${chart.y(tick)})`}>
              <line x2={innerW} className="stroke-surface-3" strokeWidth={1} />
              <text x={-8} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[10px]">
                {fmt(tick)}
              </text>
            </g>
          ))}

          <path d={chart.areaPath} fill={`url(#${gradientId})`} />
          <path
            d={chart.linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="text-sky-400"
            strokeLinejoin="round"
          />
          {points.length === 1 && (
            <circle
              data-testid="context-single-point"
              cx={chart.x(1)}
              cy={chart.y(points[0]!.context_tokens)}
              r={3.5}
              fill="currentColor"
              className="text-sky-400"
            />
          )}

          {compactions.map((compaction, index) => {
            const markerX = chart.x(
              Math.max(1, Math.min(compaction.after_turn + 0.5, points.length))
            );
            return (
              <g
                key={compaction.uuid ?? index}
                data-testid="compaction-marker"
                transform={`translate(${markerX},0)`}
                className="text-amber-400"
              >
                <title>{t("contextCompactionMarker", { n: index + 1 })}</title>
                <line
                  y1={0}
                  y2={innerH}
                  stroke="currentColor"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                />
                <circle
                  cy={-8}
                  r={7}
                  className="fill-surface-2"
                  stroke="currentColor"
                  strokeWidth={1.25}
                />
                <text
                  y={-8}
                  dy="0.33em"
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-[9px] font-semibold"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}

          {hovered && (
            <g transform={`translate(${chart.x(hovered.turn)},${chart.y(hovered.context_tokens)})`}>
              <line
                y2={innerH - chart.y(hovered.context_tokens)}
                stroke="currentColor"
                className="text-sky-400 opacity-40"
                strokeWidth={1}
              />
              <circle
                r={3.5}
                fill="currentColor"
                className="stroke-surface-1 text-sky-400"
                strokeWidth={1.5}
              />
            </g>
          )}

          <rect
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={trackPointer}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        </g>
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-surface-3 bg-surface-1/95 px-2 py-1 font-mono text-[10px] text-gray-200 shadow-lg"
          style={{
            left: Math.min(
              Math.max(MARGIN.left + chart.x(hovered.turn), 70),
              Math.max(70, width - 70)
            ),
          }}
        >
          {t("contextHover", { turn: hovered.turn, tokens: fmt(hovered.context_tokens) })}
          {hovered.timestamp && (
            <span className="ml-1.5 text-gray-500">{formatTime(hovered.timestamp)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function CompactionList({ compactions }: { compactions: ContextCompaction[] }) {
  const { t } = useTranslation("sessions");
  return (
    <ol className="mt-3 divide-y divide-surface-3/60 border-t border-surface-3/60">
      {compactions.map((compaction, index) => (
        <li
          key={compaction.uuid ?? index}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs tabular-nums"
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-400/15 text-[11px] font-semibold text-amber-200">
            {index + 1}
          </span>
          {compaction.timestamp && (
            <span className="font-mono text-gray-400">{formatTime(compaction.timestamp)}</span>
          )}
          <span className="font-mono text-gray-200">
            {compactionSizes(compaction, t("contextNotResumed"))}
          </span>
          <FreedShare compaction={compaction} />
          {compaction.trigger && (
            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[11px] text-amber-200">
              {compaction.trigger === "auto"
                ? t("compactionTriggerAuto")
                : t("compactionTriggerManual")}
            </span>
          )}
          <span className="text-gray-400 sm:ml-auto">
            {t("contextReplaced", { count: compaction.replaced_messages })}
          </span>
        </li>
      ))}
    </ol>
  );
}

function compactionSizes(compaction: ContextCompaction, notResumedLabel: string): string {
  const before = compaction.pre_tokens != null ? fmt(compaction.pre_tokens) : "?";
  const after = compaction.post_tokens != null ? fmt(compaction.post_tokens) : notResumedLabel;
  return `${before} → ${after}`;
}

function FreedShare({ compaction }: { compaction: ContextCompaction }) {
  if (!compaction.pre_tokens || compaction.post_tokens == null) return null;
  const freed = 1 - compaction.post_tokens / compaction.pre_tokens;
  if (freed <= 0) return null;
  return (
    <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200">
      −{Math.round(freed * 100)}%
    </span>
  );
}
