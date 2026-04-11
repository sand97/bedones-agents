import { useState } from 'react'
import { Button, Divider, Input, Modal, Select, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Catalog } from '@app/lib/api/agent-api'
import { catalogApi } from '@app/lib/api/agent-api'

const { Text } = Typography

interface CatalogLinkModalProps {
  open: boolean
  onClose: () => void
  phoneNumberId: string
  accountName: string
  catalogs: Catalog[]
}

export function CatalogLinkModal({
  open,
  onClose,
  phoneNumberId,
  accountName,
  catalogs,
}: CatalogLinkModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)

  const associateMutation = useMutation({
    mutationFn: (catalogId: string) => catalogApi.associatePhone(catalogId, phoneNumberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commerce', phoneNumberId] })
      onClose()
      setSelectedCatalogId(null)
    },
  })

  const catalogsWithProvider = catalogs.filter((c) => !!c.providerId)

  return (
    <Modal open={open} onCancel={onClose} title={t('catalog_link.title')} footer={null} width={480}>
      {/* Phone number section */}
      <div className="mb-4">
        <Text className="text-text-secondary">{t('catalog_link.phone_number')}</Text>
        <div className="mt-2">
          <Input value={accountName} disabled />
        </div>
      </div>

      <Divider className="my-3" />

      {/* Catalog selection section with its own action */}
      <div className="mb-2">
        <Text className="text-text-secondary">{t('catalog_link.select_catalog')}</Text>
        <div className="mt-2">
          <Select
            className="w-full"
            placeholder={t('catalog_link.select_placeholder')}
            value={selectedCatalogId}
            onChange={setSelectedCatalogId}
            options={catalogsWithProvider.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="primary"
            disabled={!selectedCatalogId}
            loading={associateMutation.isPending}
            onClick={() => selectedCatalogId && associateMutation.mutate(selectedCatalogId)}
          >
            {t('catalog_link.associate')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
