import type { Ticket } from './mock-data'
import { TICKET_STATUS_CONFIG } from './mock-data'

interface TicketCardProps {
  ticket: Ticket
  onClick: (ticket: Ticket) => void
}

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const statusConfig = TICKET_STATUS_CONFIG[ticket.status]

  return (
    <button type="button" onClick={() => onClick(ticket)} className="flex flex-col w-full px-4 py-3 border-none border-b border-b-border-subtle rounded-none bg-bg-surface cursor-pointer transition-[background] duration-150 text-left hover:bg-bg-subtle">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {ticket.title}
        </span>
        <span
          className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ background: statusConfig.color }}
        >
          {statusConfig.label}
        </span>
      </div>
      <div className="mt-0.5 truncate text-sm font-normal text-text-muted">
        {ticket.description}
      </div>
    </button>
  )
}
