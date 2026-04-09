function Sk({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-muted ${className}`} />
}

/**
 * Skeleton for mobile card list views (tickets, catalog, promotions).
 * Renders N placeholder cards matching the typical card layout.
 */
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border-default bg-bg-surface p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Sk className="h-4 w-3/4" />
              <Sk className="h-3 w-1/2" />
            </div>
            <Sk className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
