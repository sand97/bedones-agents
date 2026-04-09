/**
 * ⚠️ PROTECTED FILE — DO NOT MODIFY unless you have received an EXPLICIT order to do so.
 * If you do modify this file, you MUST NOT remove or alter any existing fields, props,
 * form items, or mock data imports. Only ADD to this file, never delete or replace.
 * Any agent that removes functionality from this modal will break the ticket creation flow.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Select, AutoComplete, InputNumber, Space } from 'antd'
import { Input } from 'antd'
import { Plus, Trash2, ShoppingBag } from 'lucide-react'
import { ArticleListItem } from '@app/components/catalog/article-list-item'
import { SocialIconInline } from '@app/components/shared/social-badge'
import { formatPrice } from '@app/lib/format'
// TODO(mock): Remplacer MOCK_CONVERSATIONS, MOCK_PROMOTIONS par des appels API réels
import {
  MOCK_CONVERSATIONS,
  MOCK_PROMOTIONS,
  SOCIAL_NETWORK_CONFIG,
  type SocialNetwork,
  type CatalogArticle,
} from '@app/components/whatsapp/mock-data'

export interface SelectedArticle {
  article: CatalogArticle
  quantity: number
}

interface CreateTicketModalProps {
  open: boolean
  onClose: () => void
  onOpenArticlePicker: () => void
  selectedArticles: SelectedArticle[]
  setSelectedArticles: React.Dispatch<React.SetStateAction<SelectedArticle[]>>
}

const SOCIAL_PLATFORMS = (Object.keys(SOCIAL_NETWORK_CONFIG) as SocialNetwork[]).map((key) => ({
  value: key,
  label: (
    <span className="flex items-center gap-2">
      <SocialIconInline network={key} />
      {SOCIAL_NETWORK_CONFIG[key].label}
    </span>
  ),
}))

const CONTACT_OPTIONS = MOCK_CONVERSATIONS.map((c) => ({
  value: c.contact.name,
  label: `${c.contact.name} — ${c.contact.phone}`,
}))

const CHARGE_REASON_OPTIONS = [
  { value: 'Emballage cadeau' },
  { value: 'Frais de manutention' },
  { value: 'Assurance' },
  { value: 'Frais de douane' },
  { value: 'Supplément express' },
]

const PROMO_OPTIONS = MOCK_PROMOTIONS.map((p) => ({
  value: p.id,
  label: p.name,
}))

interface ChargeLine {
  id: string
  reason: string
  amount: number
  isDefault?: boolean
}

export function CreateTicketModal({
  open,
  onClose,
  onOpenArticlePicker,
  selectedArticles,
  setSelectedArticles,
}: CreateTicketModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [charges, setCharges] = useState<ChargeLine[]>([
    { id: 'charge-default', reason: 'Frais de transport', amount: 0, isDefault: true },
  ])
  const [selectedPromoIds, setSelectedPromoIds] = useState<string[]>([])

  const selectedPlatform = Form.useWatch('platform', form)

  const selectedPromos = useMemo(
    () => MOCK_PROMOTIONS.filter((p) => selectedPromoIds.includes(p.id)),
    [selectedPromoIds],
  )

  const removeArticle = (articleId: string) => {
    setSelectedArticles((prev) => prev.filter((sa) => sa.article.id !== articleId))
  }

  const updateArticleQty = (articleId: string, qty: number) => {
    if (qty < 1) return removeArticle(articleId)
    setSelectedArticles((prev) =>
      prev.map((sa) => (sa.article.id === articleId ? { ...sa, quantity: qty } : sa)),
    )
  }

  const addCharge = () => {
    setCharges((prev) => [...prev, { id: `charge-${Date.now()}`, reason: '', amount: 0 }])
  }

  const removeCharge = (id: string) => {
    setCharges((prev) => prev.filter((c) => c.id !== id))
  }

  const updateCharge = (id: string, field: 'reason' | 'amount', value: string | number) => {
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  const getDiscountedPrice = (price: number) => {
    let discounted = price
    for (const promo of selectedPromos) {
      if (promo.value <= 0) continue
      if (promo.type === 'percent') {
        discounted -= discounted * (promo.value / 100)
      } else {
        discounted -= promo.value
      }
    }
    return Math.max(0, Math.round(discounted))
  }

  const getPromoTooltip = (price: number) => {
    const lines: string[] = [`Prix original : ${formatPrice(price, 'FCFA')}`]
    let current = price
    for (const promo of selectedPromos) {
      if (promo.value <= 0) continue
      if (promo.type === 'percent') {
        const discount = Math.round(current * (promo.value / 100))
        current -= discount
        lines.push(`${promo.name} (-${promo.value}%) : -${formatPrice(discount, 'FCFA')}`)
      } else {
        current -= promo.value
        lines.push(`${promo.name} (-${formatPrice(promo.value, 'FCFA')})`)
      }
    }
    return lines.join('\n')
  }

  const hasActivePromos = selectedPromos.length > 0

  const subtotal = selectedArticles.reduce((sum, sa) => sum + sa.article.price * sa.quantity, 0)
  const subtotalDiscounted = selectedArticles.reduce(
    (sum, sa) => sum + getDiscountedPrice(sa.article.price) * sa.quantity,
    0,
  )
  const chargesTotal = charges.reduce((sum, c) => sum + (c.amount || 0), 0)
  const grandTotal = subtotalDiscounted + chargesTotal

  const handleSubmit = () => {
    form.validateFields().then(() => {
      resetForm()
      onClose()
    })
  }

  const resetForm = () => {
    form.resetFields()
    setSelectedArticles([])
    setCharges([{ id: 'charge-default', reason: 'Frais de transport', amount: 0, isDefault: true }])
    setSelectedPromoIds([])
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal
      title={t('tickets.create')}
      open={open}
      onCancel={handleClose}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-between gap-2">
          {grandTotal ? (
            <span className="flex justify-between text-sm font-semibold text-text-primary">
              Total {formatPrice(grandTotal, 'FCFA')}
            </span>
          ) : (
            <span></span>
          )}
          <div className="space-x-2">
            <Button onClick={handleClose}>Annuler</Button>
            <Button type="primary" onClick={handleSubmit}>
              Créer le ticket
            </Button>
          </div>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} className="pt-2">
        <Form.Item
          label="Titre"
          name="title"
          rules={[{ required: true, message: 'Le titre est requis' }]}
        >
          <Input placeholder="Ex: Commande Robe Wax — Taille M" />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder="Description optionnelle..."
          />
        </Form.Item>

        <Form.Item label="Contact" required className="mb-4">
          <Space.Compact block className="create-ticket-contact-compact">
            <Form.Item name="platform" noStyle rules={[{ required: true, message: 'Requis' }]}>
              <Select
                placeholder="Plateforme"
                options={SOCIAL_PLATFORMS}
                className="create-ticket-platform-select"
              />
            </Form.Item>
            <Form.Item name="contact" noStyle rules={[{ required: true, message: 'Requis' }]}>
              <AutoComplete
                options={CONTACT_OPTIONS}
                placeholder="Rechercher un contact"
                disabled={!selectedPlatform}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                className="create-ticket-contact-input"
              />
            </Form.Item>
          </Space.Compact>
        </Form.Item>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">Articles</span>
            {selectedArticles.length > 0 && (
              <Button onClick={onOpenArticlePicker} icon={<Plus size={16} />}>
                Ajouter
              </Button>
            )}
          </div>

          {selectedArticles.length === 0 ? (
            <div className="create-ticket-empty-section">
              <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
              <div className="text-sm font-medium text-text-primary">Aucun article</div>
              <div className="text-xs text-text-muted">
                Ajoutez des articles du catalogue à ce ticket
              </div>
              <Button onClick={onOpenArticlePicker} icon={<Plus size={16} />} className="mt-2">
                Ajouter des articles
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedArticles.map(({ article, quantity }) => {
                const original = article.price * quantity
                const discounted = getDiscountedPrice(article.price) * quantity
                return (
                  <ArticleListItem
                    key={article.id}
                    id={article.id}
                    title={article.name}
                    description={article.description}
                    imageUrl={article.imageUrl}
                    unitPrice={article.price}
                    quantity={quantity}
                    currency={article.currency}
                    discountedTotal={
                      hasActivePromos && discounted < original ? discounted : undefined
                    }
                    discountTooltip={
                      hasActivePromos ? getPromoTooltip(article.price * quantity) : undefined
                    }
                    onQuantityChange={(_id, qty) => updateArticleQty(article.id, qty)}
                  />
                )
              })}
            </div>
          )}
        </div>

        <Form.Item label="Promotions" className="mb-4">
          <Select
            mode="multiple"
            placeholder="Rechercher et sélectionner des promotions"
            value={selectedPromoIds}
            onChange={setSelectedPromoIds}
            filterOption={(input, option) =>
              (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
            }
            options={PROMO_OPTIONS}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">Charges additionnelles</span>
            <Button onClick={addCharge} icon={<Plus size={16} />}>
              Ajouter
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {charges.map((charge) => (
              <div key={charge.id} className="create-ticket-charge-row">
                <AutoComplete
                  options={CHARGE_REASON_OPTIONS}
                  placeholder="Raison"
                  value={charge.reason}
                  onChange={(v) => updateCharge(charge.id, 'reason', v)}
                  filterOption={(input, option) =>
                    (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  disabled={charge.isDefault}
                  className="create-ticket-charge-reason"
                />
                <InputNumber
                  min={0}
                  value={charge.amount}
                  onChange={(v) => updateCharge(charge.id, 'amount', v ?? 0)}
                  placeholder="Montant"
                  suffix="FCFA"
                  className={`create-ticket-charge-amount ${charge.isDefault ? 'create-ticket-charge-amount--last' : ''}`}
                />
                {!charge.isDefault && (
                  <button
                    type="button"
                    className="create-ticket-charge-delete-btn"
                    onClick={() => removeCharge(charge.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {selectedArticles.length > 0 && (
          <div className="rounded-control border border-border-subtle p-3">
            <div className="flex justify-between text-sm text-text-secondary">
              <span>Sous-total articles</span>
              <span>
                {hasActivePromos && subtotalDiscounted < subtotal ? (
                  <>
                    <span className="font-semibold text-text-primary">
                      {formatPrice(subtotalDiscounted, 'FCFA')}
                    </span>
                    <span className="ml-2 text-xs text-text-muted line-through">
                      {formatPrice(subtotal, 'FCFA')}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold text-text-primary">
                    {formatPrice(subtotal, 'FCFA')}
                  </span>
                )}
              </span>
            </div>
            {chargesTotal > 0 && (
              <div className="mt-4 flex justify-between text-sm text-text-secondary">
                <span>Charges</span>
                <span>{formatPrice(chargesTotal, 'FCFA')}</span>
              </div>
            )}
          </div>
        )}
      </Form>
    </Modal>
  )
}
