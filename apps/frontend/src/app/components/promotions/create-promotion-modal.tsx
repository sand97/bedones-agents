import { useState, useEffect } from 'react'
import { Button, Modal, Form, Input, InputNumber, Select, DatePicker, Switch, Popover } from 'antd'
import { ShoppingBag, Plus, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import {
  MOCK_CATALOG_ARTICLES,
  type PromotionEligibility,
  type PromotionFull,
} from '@app/components/whatsapp/mock-data'

dayjs.locale('fr')

const { RangePicker } = DatePicker

interface PromotionModalProps {
  open: boolean
  onClose: () => void
  /** When provided, modal opens in edit mode */
  editingPromo?: PromotionFull | null
  onOpenProductPicker: () => void
  selectedProductIds: string[]
  setSelectedProductIds: React.Dispatch<React.SetStateAction<string[]>>
}

const TYPE_OPTIONS = [
  { value: 'percent', label: 'Pourcentage (%)' },
  { value: 'fixed', label: 'Montant fixe (FCFA)' },
]

const ELIGIBILITY_OPTIONS = [
  { value: 'all', label: 'Tous les produits' },
  { value: 'specific', label: 'Produits spécifiques' },
]

export function PromotionModal({
  open,
  onClose,
  editingPromo,
  onOpenProductPicker,
  selectedProductIds,
  setSelectedProductIds,
}: PromotionModalProps) {
  const [form] = Form.useForm()
  const [eligibility, setEligibility] = useState<PromotionEligibility>('all')

  const isEditing = !!editingPromo
  const promoType = Form.useWatch('type', form)

  const selectedArticles = MOCK_CATALOG_ARTICLES.filter((a) => selectedProductIds.includes(a.id))

  useEffect(() => {
    if (open && editingPromo) {
      form.setFieldsValue({
        name: editingPromo.name,
        code: editingPromo.code,
        type: editingPromo.type,
        value: editingPromo.value,
        period: [dayjs(editingPromo.startDate), dayjs(editingPromo.endDate)],
        eligibility: editingPromo.eligibility,
        stackable: editingPromo.stackable,
      })
      setEligibility(editingPromo.eligibility)
      setSelectedProductIds(editingPromo.eligibleProductIds)
    }
  }, [open, editingPromo, form, setSelectedProductIds])

  const handleSubmit = () => {
    form.validateFields().then(() => {
      resetForm()
      onClose()
    })
  }

  const resetForm = () => {
    form.resetFields()
    setEligibility('all')
    setSelectedProductIds([])
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const removeProduct = (id: string) => {
    setSelectedProductIds((prev) => prev.filter((pid) => pid !== id))
  }

  return (
    <Modal
      title={isEditing ? 'Modifier la promotion' : 'Créer une promotion'}
      open={open}
      onCancel={handleClose}
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleClose}>Annuler</Button>
          <Button type="primary" onClick={handleSubmit}>
            {isEditing ? 'Enregistrer' : 'Créer la promotion'}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="pt-2"
        initialValues={{ type: 'percent', eligibility: 'all', stackable: false }}
      >
        <Form.Item
          label="Nom"
          name="name"
          rules={[{ required: true, message: 'Le nom est requis' }]}
        >
          <Input placeholder="Ex: Soldes d'été -20%" />
        </Form.Item>

        <Form.Item
          label="Code promo"
          name="code"
          rules={[
            { required: true, message: 'Le code est requis' },
            { pattern: /^\S+$/, message: 'Pas d\u2019espaces' },
          ]}
        >
          <Input
            prefix="#"
            placeholder="SOLDES20"
            className="font-mono uppercase"
            onChange={(e) => {
              form.setFieldValue('code', e.target.value.toUpperCase().replace(/\s/g, ''))
            }}
          />
        </Form.Item>

        <Form.Item label="Réduction" required className="mb-4">
          <div className="promo-modal-reduction-row">
            <Form.Item name="type" noStyle rules={[{ required: true, message: 'Requis' }]}>
              <Select options={TYPE_OPTIONS} className="promo-modal-type-select" />
            </Form.Item>
            <Form.Item
              name="value"
              noStyle
              rules={[
                { required: true, message: 'Requis' },
                { type: 'number', min: 1, message: 'Min 1' },
              ]}
            >
              <InputNumber
                min={1}
                max={promoType === 'percent' ? 100 : undefined}
                suffix={promoType === 'percent' ? '%' : 'FCFA'}
                placeholder={promoType === 'percent' ? 'Ex: 20' : 'Ex: 5000'}
                className="promo-modal-value-input"
              />
            </Form.Item>
          </div>
        </Form.Item>

        <Form.Item
          label="Période de validité"
          name="period"
          rules={[{ required: true, message: 'La période est requise' }]}
        >
          <RangePicker
            placeholder={['Date début', 'Date fin']}
            format="DD/MM/YYYY"
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          label="Produits éligibles"
          name="eligibility"
          rules={[{ required: true, message: 'Requis' }]}
        >
          <Select
            options={ELIGIBILITY_OPTIONS}
            onChange={(val: PromotionEligibility) => {
              setEligibility(val)
              if (val === 'all') setSelectedProductIds([])
            }}
          />
        </Form.Item>

        {eligibility === 'specific' && (
          <div className="mb-4">
            {selectedArticles.length === 0 ? (
              <div className="create-ticket-empty-section">
                <ShoppingBag size={32} strokeWidth={1.5} className="text-text-muted opacity-50" />
                <div className="text-sm font-medium text-text-primary">Aucun produit</div>
                <div className="text-xs text-text-muted">
                  Sélectionnez les produits éligibles à cette promotion
                </div>
                <Button onClick={onOpenProductPicker} icon={<Plus size={16} />} className="mt-2">
                  Sélectionner des produits
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedArticles.map((a) => (
                  <div key={a.id} className="ticket-product-item">
                    <Popover
                      content={
                        <img
                          src={a.imageUrl}
                          alt={a.name}
                          className="rounded-lg"
                          style={{ maxWidth: 280, maxHeight: 280, objectFit: 'contain' }}
                        />
                      }
                      trigger="click"
                      placement="right"
                      overlayInnerStyle={{ padding: 4 }}
                    >
                      <img
                        src={a.imageUrl}
                        alt={a.name}
                        className="ticket-product-image cursor-pointer"
                        style={{ width: 56, height: 56 }}
                      />
                    </Popover>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold text-text-primary text-sm">
                        {a.name}
                      </div>
                      {a.description && (
                        <div className="text-xs text-text-muted mt-0.5 line-clamp-1">
                          {a.description}
                        </div>
                      )}
                      <div className="text-xs font-semibold text-text-primary mt-1">
                        {a.price.toLocaleString('fr-FR')} {a.currency}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ticket-product-qty-btn ticket-product-qty-btn--delete"
                      onClick={() => removeProduct(a.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <Button
                  size="small"
                  className="self-start"
                  onClick={onOpenProductPicker}
                  icon={<Plus size={14} />}
                >
                  Modifier la sélection
                </Button>
              </div>
            )}
          </div>
        )}

        <Form.Item
          label="Cumulable avec d'autres promotions"
          name="stackable"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
