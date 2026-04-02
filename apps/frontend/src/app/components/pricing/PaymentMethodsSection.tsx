import { PAYMENT_METHODS } from './constants'

export function PaymentMethodsSection() {
  return (
    <section className="border-t border-border-field-muted pt-6">
      <div className="flex flex-col items-center justify-center gap-5 text-center">
        <p className="m-0 text-[length:var(--font-size-eyebrow)] font-semibold uppercase tracking-[0.24em] text-text-soft">
          Paiements acceptes
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          {PAYMENT_METHODS.map((method) => (
            <div
              key={method.alt}
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-none bg-bg-surface shadow-card"
            >
              <img src={method.src} alt={method.alt} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
