function Sk({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-muted ${className}`} />
}

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

export function AgentSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden py-2">
        <div className="flex justify-center py-3">
          <Sk className="h-5 w-20 rounded-full" />
        </div>

        <SkMessage align="left" width="w-3/5" />
        <SkMessage align="left" width="w-2/5" />
        <SkMessage align="right" width="w-1/2" />
        <SkMessage align="left" width="w-3/5" />
        <SkMessage align="right" width="w-2/5" />

        <div className="flex justify-center py-3">
          <Sk className="h-5 w-16 rounded-full" />
        </div>

        <SkMessage align="left" width="w-1/2" />
        <SkMessage align="right" width="w-2/5" />
        <SkMessage align="left" width="w-1/3" />
      </div>

      <div className="flex-shrink-0 border-t border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <Sk className="h-10 flex-1 rounded-2xl" />
          <Sk className="h-9 w-9 flex-shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  )
}
