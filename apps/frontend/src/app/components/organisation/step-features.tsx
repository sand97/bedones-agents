import { Checkbox } from 'antd'
import { FEATURE_CATEGORIES, type FeatureType } from './onboarding-config'

/* ─── Step: Features ─── */

export function StepFeatures({
  selectedFeatures,
  onToggle,
}: {
  selectedFeatures: Record<FeatureType, Set<string>>
  onToggle: (feature: FeatureType, platformId: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="m-0 mb-1 text-lg font-semibold text-text-primary">Choix des plateformes</h3>
        <p className="m-0 text-sm text-text-secondary">
          Comment souhaitez-vous voir l&apos;IA intervenir à votre place ?
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {FEATURE_CATEGORIES.map((category) => {
          const CategoryIcon = category.icon

          return (
            <div key={category.id} className="rounded-xl border border-border-default bg-white p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-subtle">
                  <CategoryIcon size={20} strokeWidth={1} className="text-text-secondary" />
                </div>
                <div>
                  <h4 className="m-0 mb-0.5 text-sm font-semibold text-text-primary">
                    {category.label}
                  </h4>
                  <p className="m-0 text-xs text-text-secondary">{category.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:pl-13">
                {category.platforms.map((platform) => (
                  <Checkbox
                    key={platform.id}
                    checked={selectedFeatures[category.id].has(platform.id)}
                    onChange={() => onToggle(category.id, platform.id)}
                  >
                    <span className="text-sm">{platform.label}</span>
                  </Checkbox>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
