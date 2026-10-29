/**
 * @file Small monospace tag naming the ticket a Cyrus-launched session works on,
 * read from its working directory. Renders nothing outside a Cyrus worktree.
 */

import { useTranslation } from "react-i18next";
import { ticketFromCwd } from "../lib/cyrusTicket";

export function TicketTag({ cwd }: { cwd: string | null | undefined }) {
  const { t } = useTranslation();
  const ticket = ticketFromCwd(cwd);
  if (!ticket) return null;
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded border border-accent/30 bg-accent/10 px-1.5 font-mono text-[10px] font-semibold leading-4 text-accent"
      title={t("ticketTag.title")}
    >
      {ticket}
    </span>
  );
}
