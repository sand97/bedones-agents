import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Checkbox, Input, Select, Spin, Tag } from 'antd'
import { Trash2 } from 'lucide-react'
import { TemplateSelectField } from '@app/components/loyalty/template-select-field'
import type { LoyaltyTemplate } from '@app/lib/api/loyalty-api'
import {
  ALL_LANGUAGES_VALUE,
  MAX_MPM_PRODUCTS,
  TemplateEmptyLike,
  templateHasMpmButton,
  type TemplateBlock,
} from './campaign-shared'

export function CampaignTemplateBlockCard({
  block,
  index,
  blocksCount,
  usedLanguages,
  languageOptions,
  contactTags,
  socialAccountId,
  defaultFooter,
  catalogsLoading,
  mpmCatalogsEmpty,
  setBlocks,
  onTemplateChange,
  onOpenMpmPicker,
}: {
  block: TemplateBlock
  index: number
  blocksCount: number
  usedLanguages: Set<string>
  languageOptions: Array<{ value: string; label: string }>
  contactTags: Array<{ value: string; label: string }>
  socialAccountId: string
  defaultFooter?: string
  catalogsLoading: boolean
  mpmCatalogsEmpty: boolean
  setBlocks: Dispatch<SetStateAction<TemplateBlock[]>>
  onTemplateChange: (template: LoyaltyTemplate) => void
  onOpenMpmPicker: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-border-subtle p-4">
      <div className="mb-5">
        <Select
          mode="multiple"
          className="w-full"
          placeholder={t('loyalty.campaign_contact_languages')}
          value={block.allLanguages ? [ALL_LANGUAGES_VALUE] : block.languageCodes}
          options={[
            ...(blocksCount === 1
              ? [
                  {
                    value: ALL_LANGUAGES_VALUE,
                    label: t('loyalty.campaign_all_languages'),
                  },
                ]
              : []),
            ...languageOptions.map((option) => ({
              value: option.value,
              label: option.label,
              disabled:
                !block.allLanguages &&
                usedLanguages.has(option.value) &&
                !block.languageCodes.includes(option.value),
            })),
          ]}
          optionRender={(option) => {
            const value = String(option.value)
            const checked =
              value === ALL_LANGUAGES_VALUE
                ? block.allLanguages
                : block.languageCodes.includes(value)
            return (
              <div className="flex items-center gap-2">
                <Checkbox checked={checked} />
                <span>{option.label}</span>
              </div>
            )
          }}
          onChange={(languageCodes) =>
            setBlocks((prev) =>
              prev.map((item) => {
                if (item.id !== block.id) return item
                if (languageCodes.includes(ALL_LANGUAGES_VALUE)) {
                  return { ...item, allLanguages: true, languageCodes: [] }
                }
                return { ...item, allLanguages: false, languageCodes }
              }),
            )
          }
        />
      </div>
      <TemplateSelectField
        socialAccountId={socialAccountId}
        defaultFooter={defaultFooter}
        value={block.template}
        onChange={(template) => onTemplateChange(template)}
      />
      {templateHasMpmButton(block.template) && (
        <div className="mt-3">
          {catalogsLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-border-subtle py-6">
              <Spin />
            </div>
          ) : mpmCatalogsEmpty ? (
            <Alert type="warning" showIcon message={t('loyalty.campaign_mpm_catalog_required')} />
          ) : (
            <TemplateEmptyLike
              title={
                block.mpmProducts.length === 0
                  ? t('loyalty.campaign_no_products')
                  : t('loyalty.campaign_products_selected', {
                      count: block.mpmProducts.length,
                    })
              }
              description={t('loyalty.campaign_mpm_products_hint', {
                max: MAX_MPM_PRODUCTS,
              })}
              buttonLabel={t('loyalty.campaign_product_select')}
              onClick={onOpenMpmPicker}
            />
          )}
        </div>
      )}
      {block.template?.variables.map((variable) => (
        <div key={variable} className="mt-3">
          <div className="mb-1 text-xs font-medium text-text-primary">
            {t('loyalty.campaign_variable', { variable })}
          </div>
          <Input
            value={block.variableValues[variable] ?? ''}
            onChange={(event) =>
              setBlocks((prev) =>
                prev.map((item) =>
                  item.id === block.id
                    ? {
                        ...item,
                        variableValues: {
                          ...item.variableValues,
                          [variable]: event.target.value,
                        },
                      }
                    : item,
                ),
              )
            }
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {contactTags.map((tag) => (
              <Tag
                key={tag.value}
                bordered={false}
                color="processing"
                className="cursor-pointer"
                onClick={() =>
                  setBlocks((prev) =>
                    prev.map((item) =>
                      item.id === block.id
                        ? {
                            ...item,
                            variableValues: {
                              ...item.variableValues,
                              [variable]: `[${tag.value}]`,
                            },
                          }
                        : item,
                    ),
                  )
                }
              >
                {tag.label}
              </Tag>
            ))}
          </div>
        </div>
      ))}
      {index > 0 && (
        <Button
          danger
          size="small"
          className="mt-3"
          icon={<Trash2 size={14} />}
          onClick={() => setBlocks((prev) => prev.filter((item) => item.id !== block.id))}
        >
          {t('loyalty.campaign_delete_language_block')}
        </Button>
      )}
    </div>
  )
}
