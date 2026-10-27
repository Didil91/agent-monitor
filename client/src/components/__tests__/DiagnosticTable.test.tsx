/**
 * @file DiagnosticTable.test.tsx
 * @description Verifies the atypical-sessions panel: one chip per exceeded
 * metric with its ratio, cost marked as estimated, thresholds explained, the
 * list of unmeasured signals, and a plain empty state.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DiagnosticTable } from "../DiagnosticTable";
import type { SessionDiagnostic } from "../../lib/types";

const thresholds: SessionDiagnostic["thresholds"] = {
  cost: { p90: 38.14, guardrail: 1, threshold: 38.14 },
  tokens: { p90: 92_000_000, guardrail: 2_000_000, threshold: 92_000_000 },
  duration_min: { p90: 1700, guardrail: 30, threshold: 1700 },
  compactions: { p90: 0, guardrail: 2, threshold: 2 },
  tool_calls: { p90: 108, guardrail: 200, threshold: 200 },
};

const diagnostic: SessionDiagnostic = {
  period_days: 30,
  sample_size: 175,
  thresholds,
  sessions: [
    {
      id: "s-1",
      name: "Inscription et connexion",
      started_at: "2026-10-09T14:07:00.000Z",
      provider: "claude",
      flags: [
        { metric: "cost", value: 477.7, threshold: 38.14, ratio: 12.53, kind: "estimated" },
        { metric: "compactions", value: 8, threshold: 2, ratio: 4, kind: "measured" },
      ],
    },
  ],
  limits: ["tool_errors_not_captured", "cost_estimated"],
};

function renderTable(value: SessionDiagnostic) {
  return render(
    <MemoryRouter>
      <DiagnosticTable diagnostic={value} />
    </MemoryRouter>
  );
}

describe("DiagnosticTable", () => {
  it("lists flagged sessions with one chip per exceeded metric", () => {
    renderTable(diagnostic);
    expect(screen.getByRole("link", { name: "Inscription et connexion" })).toHaveAttribute(
      "href",
      "/sessions/s-1"
    );
    expect(screen.getByText("×12.5")).toBeInTheDocument();
    expect(screen.getByText("×4")).toBeInTheDocument();
  });

  it("marks cost as estimated", () => {
    renderTable(diagnostic);
    expect(screen.getAllByText("estimated").length).toBeGreaterThan(0);
  });

  it("explains each threshold", () => {
    renderTable(diagnostic);
    expect(screen.getByText("$38.14")).toBeInTheDocument();
    expect(screen.getByText(/1 session above your usual range over 30 days/)).toBeInTheDocument();
  });

  it("shows the limits list", () => {
    renderTable(diagnostic);
    expect(screen.getByText("Tool errors aren't recorded by the hooks.")).toBeInTheDocument();
  });

  it("formats ratios with the current locale", async () => {
    const { default: i18n } = await import("../../i18n");
    await i18n.changeLanguage("fr");
    renderTable(diagnostic);
    expect(screen.getByText("×12,5")).toBeInTheDocument();
    await i18n.changeLanguage("en");
  });

  it("never shows a flagged ratio as a flat ×1", () => {
    renderTable({
      ...diagnostic,
      sessions: [
        {
          ...diagnostic.sessions[0]!,
          flags: [{ metric: "tokens", value: 101, threshold: 100, ratio: 1.01, kind: "measured" }],
        },
      ],
    });
    expect(screen.getByText("×1.01")).toBeInTheDocument();
  });

  it("empty state when nothing is flagged", () => {
    renderTable({ ...diagnostic, sessions: [] });
    expect(screen.getByText("No session stands out over this period.")).toBeInTheDocument();
  });
});
