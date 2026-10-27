/**
 * @file ContextTimelineChart.test.tsx
 * @description Verifies the session overview's context-window chart: one marker
 * per compaction on the curve, a readable before → after list with the share
 * of context freed, and no output at all when the timeline is empty.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextTimelineChart } from "../ContextTimelineChart";
import type { ContextTimeline } from "../../lib/types";

const timeline: ContextTimeline = {
  points: [
    { turn: 1, timestamp: "2026-10-24T10:00:00.000Z", context_tokens: 20000 },
    { turn: 2, timestamp: "2026-10-24T10:10:00.000Z", context_tokens: 691105 },
    { turn: 3, timestamp: "2026-10-24T10:30:00.000Z", context_tokens: 42000 },
    { turn: 4, timestamp: "2026-10-24T10:40:00.000Z", context_tokens: 150000 },
  ],
  compactions: [
    {
      uuid: "b1",
      timestamp: "2026-10-24T10:24:55.376Z",
      trigger: "auto",
      pre_tokens: 691105,
      post_tokens: 42000,
      duration_ms: 82343,
      replaced_messages: 312,
      after_turn: 2,
    },
    {
      uuid: "b2",
      timestamp: "2026-10-24T10:45:00.000Z",
      trigger: "manual",
      pre_tokens: 150000,
      post_tokens: null,
      duration_ms: null,
      replaced_messages: 4,
      after_turn: 4,
    },
  ],
};

describe("ContextTimelineChart", () => {
  it("draws one marker per compaction", () => {
    render(<ContextTimelineChart timeline={timeline} />);
    expect(screen.getAllByTestId("compaction-marker")).toHaveLength(2);
  });

  it("lists compactions with before, after and saved tokens", () => {
    render(<ContextTimelineChart timeline={timeline} />);
    expect(screen.getByText("691.1K → 42.0K")).toBeInTheDocument();
    expect(screen.getByText("−94%")).toBeInTheDocument();
    expect(screen.getByText("312 messages replaced")).toBeInTheDocument();
    expect(screen.getByText("automatic")).toBeInTheDocument();
    expect(screen.getByText("manual (/compact)")).toBeInTheDocument();
    expect(screen.getByText(/150.0K → not resumed yet/)).toBeInTheDocument();
  });

  it("shows the peak and the latest context size", () => {
    render(<ContextTimelineChart timeline={timeline} />);
    expect(screen.getByText("Peak 691.1K")).toBeInTheDocument();
    expect(screen.getByText("Now 150.0K")).toBeInTheDocument();
  });

  it("renders nothing for an empty timeline", () => {
    const { container } = render(
      <ContextTimelineChart timeline={{ points: [], compactions: [] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
