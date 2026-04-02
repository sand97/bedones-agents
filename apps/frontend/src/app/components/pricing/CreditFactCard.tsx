import type { CreditFact } from './constants'

type CreditFactCardProps = {
  fact: CreditFact
}

export function CreditFactCard({ fact }: CreditFactCardProps) {
  return (
    <article className="rounded-panel border-none bg-surface-accent p-6 shadow-none">
      <div className="flex flex-col gap-5 text-left">
        <div className="flex min-h-[196px] items-center justify-center">{fact.illustration}</div>

        <div className="space-y-3">
          <p className="m-0 text-[20px] font-medium leading-6 tracking-[0.02em] text-text-primary">
            {fact.title}
          </p>
          <p className="m-0 text-sm leading-[1.75] text-text-secondary">{fact.description}</p>
        </div>
      </div>
    </article>
  )
}
