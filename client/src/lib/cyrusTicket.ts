/**
 * @file Recognizes the ticket a Cyrus-launched session works on, read from its
 * working directory (`~/.cyrus/worktrees/<TICKET>`, e.g. `PER-17`). Purely
 * path-based: the dashboard never calls the ticketing tool.
 */

const CYRUS_WORKTREE_TICKET =
  /(?:^|[\\/])\.cyrus[\\/]worktrees[\\/]([A-Z][A-Z0-9]*-\d+)(?:[\\/]|$)/;

/** Ticket identifier of a session running in a Cyrus worktree, or null. */
export function ticketFromCwd(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  return CYRUS_WORKTREE_TICKET.exec(cwd)?.[1] ?? null;
}
