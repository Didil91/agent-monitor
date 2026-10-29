/**
 * @file Tests for ticketFromCwd - recognizes the ticket identifier of a session
 * launched by Cyrus from its working directory (`.cyrus/worktrees/<TICKET>`).
 */

import { describe, it, expect } from "vitest";
import { ticketFromCwd } from "../cyrusTicket";

describe("ticketFromCwd", () => {
  it("reads the ticket from a Windows Cyrus worktree", () => {
    expect(ticketFromCwd("C:\\Users\\Adil\\.cyrus\\worktrees\\PER-18")).toBe("PER-18");
  });

  it("reads the ticket from a POSIX Cyrus worktree subfolder", () => {
    expect(ticketFromCwd("/home/x/.cyrus/worktrees/PER-17/server")).toBe("PER-17");
  });

  it("ignores a trailing separator", () => {
    expect(ticketFromCwd("/home/x/.cyrus/worktrees/ENG-123/")).toBe("ENG-123");
  });

  it("returns null outside a Cyrus worktree", () => {
    expect(ticketFromCwd("/home/x/projets/agent-monitor")).toBeNull();
    expect(ticketFromCwd("/home/x/worktrees/PER-17")).toBeNull();
  });

  it("returns null when the folder is not a ticket identifier", () => {
    expect(ticketFromCwd("/home/x/.cyrus/worktrees/notes")).toBeNull();
    expect(ticketFromCwd("/home/x/.cyrus/worktrees/per-17")).toBeNull();
  });

  it("returns null for an empty cwd", () => {
    expect(ticketFromCwd(null)).toBeNull();
    expect(ticketFromCwd(undefined)).toBeNull();
    expect(ticketFromCwd("")).toBeNull();
  });
});
