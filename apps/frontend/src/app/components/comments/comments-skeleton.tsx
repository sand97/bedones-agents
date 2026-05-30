/* ── Reusable skeleton block ── */

function Sk({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-muted ${className}`} />
}

/* ── Left panel: post list ── */

export function PostListSkeleton() {
  const widths = ['w-full', 'w-4/5', 'w-full', 'w-3/4', 'w-full', 'w-5/6']

  return (
    <div className="flex flex-col">
      {/* Filter buttons */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Sk className="h-7 w-10 rounded-full" />
        <Sk className="h-7 w-16 rounded-full" />
      </div>

      {/* Post items */}
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Sk className="h-11 w-11 flex-shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Sk className={`h-3.5 rounded ${w}`} />
            <Sk className="h-3 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Right panel: comment thread ── */

function SkThread({
  textWidth = 'w-3/4',
  hasReplies = false,
  replyCount = 1,
}: {
  textWidth?: string
  hasReplies?: boolean
  replyCount?: number
}) {
  const replyWidths = ['w-2/3', 'w-1/2', 'w-3/4']

  return (
    <div className="px-4 py-3">
      {/* Root comment */}
      <div className="flex gap-3">
        <Sk className="h-8 w-8 flex-shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Sk className="h-3 w-20 rounded" />
          <Sk className={`h-3.5 rounded ${textWidth}`} />
          <Sk className="h-2.5 w-8 rounded" />
        </div>
      </div>

      {/* Replies */}
      {hasReplies && (
        <div className="thread-replies">
          {Array.from({ length: replyCount }).map((_, i) => (
            <div
              key={i}
              className={`thread-reply ${i === replyCount - 1 ? 'thread-reply--last' : ''}`}
            >
              <div className="flex gap-3">
                <Sk className="h-6 w-6 flex-shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Sk className={`h-3 rounded ${replyWidths[i % replyWidths.length]}`} />
                  <Sk className="h-2.5 w-7 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions: Répondre + Options */}
      <div className="mt-2 ml-10 flex items-center gap-3">
        <Sk className="h-3 w-14 rounded" />
        <Sk className="h-3 w-14 rounded" />
      </div>
    </div>
  )
}

export function CommentThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Post preview header */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-2">
        <Sk className="h-9 w-9 flex-shrink-0 rounded-lg" />
        <Sk className="h-3.5 flex-1 rounded" />
        <Sk className="h-7 w-7 flex-shrink-0 rounded-lg" />
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-hidden">
        {/* Date label */}
        <div className="flex justify-center py-3">
          <Sk className="h-5 w-20 rounded-full" />
        </div>

        <SkThread textWidth="w-3/4" hasReplies replyCount={2} />
        <SkThread textWidth="w-full" />
        <SkThread textWidth="w-2/3" hasReplies replyCount={1} />

        {/* Second date group */}
        <div className="flex justify-center py-3">
          <Sk className="h-5 w-16 rounded-full" />
        </div>

        <SkThread textWidth="w-4/5" />
        <SkThread textWidth="w-3/5" hasReplies replyCount={1} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-border-subtle px-4 pt-3 pb-6">
        <Sk className="h-10 w-full rounded-lg" />
      </div>
    </div>
  )
}
