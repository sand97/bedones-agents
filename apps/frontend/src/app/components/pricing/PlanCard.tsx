import { ArrowRightOutlined } from '@ant-design/icons'
import MoreDownIcon from '@app/assets/MoreDown.svg?react'
import { Button } from 'antd'

import {
  formatDisplayPrice,
  getDisplayedMonthlyPrice,
  getPlanCreditsSummary,
  getDurationCtaLabel,
  getPlanLabel,
  getTotalPrice,
  type BillingDuration,
  type BillingPlanKey,
  type PlanConfig,
} from './constants'

function renderPlanFooter(config: PlanConfig, duration: BillingDuration) {
  const creditSummary = getPlanCreditsSummary(config, duration)

  if (!config.overagePrice) {
    return (
      <p className="m-0 text-[0px] leading-none tracking-[0.02em]">
        <span className="text-[18px] font-bold text-text-primary">{creditSummary.amount}</span>
        <span className="ml-1 text-[16px] font-normal text-text-secondary">
          {creditSummary.suffix}
        </span>
      </p>
    )
  }

  return (
    <div className="space-y-0.5 text-[16px] leading-[1.8] tracking-[0.02em] text-text-secondary">
      <p className="m-0">
        <span className="text-[18px] font-bold text-text-primary">{creditSummary.amount}</span>
        <span className="ml-1">{creditSummary.suffix}</span>
      </p>
      <p className="m-0">
        Puis <span className="font-bold text-text-primary">{config.overagePrice}</span>{' '}
        {config.overageSuffix}
      </p>
    </div>
  )
}

type PlanCardProps = {
  planKey: BillingPlanKey
  config: PlanConfig
  isCurrent: boolean
  duration: BillingDuration
  onUpgrade: (planKey: BillingPlanKey) => void
  isFirst: boolean
  isLast: boolean
}

export function PlanCard({
  planKey,
  config,
  isCurrent,
  duration,
  onUpgrade,
  isFirst,
  isLast,
}: PlanCardProps) {
  const planLabel = getPlanLabel(planKey)
  const displayPrice = formatDisplayPrice(
    getDisplayedMonthlyPrice(config.monthlyPrice, duration),
    1,
  )
  const totalPrice = formatDisplayPrice(getTotalPrice(config.monthlyPrice, duration))
  const radiusClass = isFirst
    ? 'md:rounded-l-panel md:rounded-r-none'
    : isLast
      ? 'md:rounded-r-panel md:rounded-l-none'
      : 'md:rounded-none'

  return (
    <article
      className={`relative min-w-0 rounded-panel border border-border-field-muted bg-bg-surface p-4 shadow-none md:flex md:flex-1 md:flex-col md:p-4 ${radiusClass}`}
    >
      {config.accentLabel ? (
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-text-primary px-4 py-1.5 text-xs font-semibold text-white">
          {config.accentLabel}
        </span>
      ) : null}

      <div className="flex h-full flex-col gap-5">
        <div className="flex h-[200px] flex-col justify-between rounded-card bg-surface-accent px-5 pb-4 pt-5">
          <p className="m-0 text-base font-bold leading-4 tracking-[0.02em] text-text-primary">
            {planLabel.toUpperCase()}
          </p>

          <div className="text-black">
            <span className="text-[38px] font-semibold leading-none tracking-[-0.04em] text-text-primary">
              {displayPrice}
            </span>
            <span className="ml-2 text-[18px] font-normal text-text-secondary">par mois</span>
          </div>
        </div>

        <div className="md:sticky md:top-16 md:z-20 md:-mx-4 md:-mb-5 md:bg-bg-surface md:px-4 md:pb-5">
          <div className="pointer-events-none absolute inset-x-0 bottom-full hidden h-4 bg-bg-surface md:block" />
          <div>
            {isCurrent ? (
              <Button className="w-full" type={'primary'} size={'large'} disabled>
                Votre forfait actuel
              </Button>
            ) : config.ctaLabel ? (
              <Button
                className="w-full"
                type={'primary'}
                size={'large'}
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                onClick={() => onUpgrade(planKey)}
              >
                {`Passer ${getDurationCtaLabel(duration)} mois en ${planLabel} pour ${totalPrice}`}
              </Button>
            ) : (
              <div className="h-[46px]" />
            )}
          </div>

          {config.includedLabel ? (
            <div className="mt-5 flex items-center gap-2 px-2 text-base font-normal leading-6 tracking-[0.02em] text-text-primary">
              <span>{config.includedLabel}</span>
              <MoreDownIcon className="h-3.5 w-3.5 text-text-secondary" />
            </div>
          ) : (
            <div className="mt-5 h-[24px]" />
          )}
        </div>

        <div className="space-y-4">
          {config.features.map((group) => (
            <section key={group.title}>
              <p className="mb-2 px-2 text-base font-normal leading-6 tracking-[0.02em] text-text-secondary">
                {group.title}
              </p>

              <div className="space-y-4">
                {group.items.map((feature) => (
                  <div
                    key={feature.label}
                    className="rounded-card border border-border-field-muted bg-surface p-4"
                  >
                    <div className="flex flex-col items-start gap-2">
                      <span className="flex items-center gap-2">
                        <span className="text-text-primary">{feature.icon}</span>
                        <p className="text-base font-medium leading-4 tracking-[0.02em] text-text-primary">
                          {feature.label}
                        </p>
                      </span>
                      <p className="m-0 text-sm leading-[1.75] text-text-secondary">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-auto px-2 pt-6">{renderPlanFooter(config, duration)}</div>
      </div>
    </article>
  )
}
