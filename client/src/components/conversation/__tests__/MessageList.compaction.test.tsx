/**
 * @file MessageList.compaction.test.tsx
 * @description Verifies the conversation view renders a compaction boundary as
 * a seam carrying its trigger, pre-compaction size and duration, and shows the
 * compaction summary collapsed instead of as a message typed by the user.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MessageList } from "../MessageList";
import type { TranscriptMessage } from "../../../lib/types";

const boundary: TranscriptMessage = {
  type: "session_event",
  event_kind: "compaction",
  trigger: "auto",
  pre_tokens: 691105,
  duration_ms: 82343,
  timestamp: "2026-10-24T10:24:55.376Z",
  content: [],
};

const summary: TranscriptMessage = {
  type: "user",
  sender: "system",
  compact_summary: true,
  timestamp: "2026-10-24T10:24:56.000Z",
  content: [{ type: "text", text: "This session is being continued from a previous conversation" }],
};

describe("MessageList — compactions", () => {
  it("renders compaction marker with trigger and pre-tokens", () => {
    render(<MessageList messages={[boundary]} loading={false} />);
    expect(screen.getByText("Context compacted")).toBeInTheDocument();
    expect(screen.getByText(/691.1K tokens summarized/)).toBeInTheDocument();
    expect(screen.getByText("automatic")).toBeInTheDocument();
    expect(screen.getByText(/1m 22s/)).toBeInTheDocument();
  });

  it("compact summary is collapsed and not shown as a user bubble", () => {
    render(<MessageList messages={[boundary, summary]} loading={false} />);
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.queryByText(/being continued/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Summary that replaced the history/ }));
    expect(screen.getByText(/being continued/)).toBeInTheDocument();
  });
});
