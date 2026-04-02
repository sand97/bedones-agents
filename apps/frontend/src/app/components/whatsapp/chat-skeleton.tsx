function Sk({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-muted ${className}`} />
}

/* ── Left panel: conversation list ── */

export function ConversationListSkeleton() {
  const items = [1, 2, 3, 4, 5, 6]

  return (
    <div className="flex flex-col">
      {/* Search bar placeholder */}
      <div className="border-b border-border-subtle px-4 py-3">
        <Sk className="h-9 w-full rounded-full" />
      </div>

      {items.map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Sk className="h-11 w-11 flex-shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <Sk className="h-3.5 w-24 rounded" />
              <Sk className="h-3 w-10 rounded" />
            </div>
            <Sk className="h-3 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Right panel: chat window ── */

function SkMessage({
  align = 'left',
  width = 'w-3/5',
}: {
  align?: 'left' | 'right'
  width?: string
}) {
  return (
    <div className={`flex px-4 py-0.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <Sk className={`h-10 ${width} rounded-2xl`} />
    </div>
  )
}

export function ChatWindowSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
        <Sk className="h-9 w-9 flex-shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Sk className="h-3.5 w-28 rounded" />
          <Sk className="h-3 w-20 rounded" />
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-hidden bg-bg-page py-2">
        <div className="flex justify-center py-3">
          <Sk className="h-5 w-20 rounded-full" />
        </div>

        <SkMessage align="left" width="w-2/5" />
        <SkMessage align="right" width="w-3/5" />
        <SkMessage align="left" width="w-1/2" />
        <SkMessage align="right" width="w-2/5" />
        <SkMessage align="left" width="w-3/5" />

        <div className="flex justify-center py-3">
          <Sk className="h-5 w-16 rounded-full" />
        </div>

        <SkMessage align="right" width="w-1/2" />
        <SkMessage align="left" width="w-2/5" />
        <SkMessage align="left" width="w-1/3" />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <Sk className="h-9 w-9 flex-shrink-0 rounded-full" />
          <Sk className="h-10 flex-1 rounded-2xl" />
          <Sk className="h-9 w-9 flex-shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  )
}
