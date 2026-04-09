import { useState, useEffect } from 'react'
import { Modal, Input } from 'antd'

interface CreateCatalogModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: { name: string; providerId?: string }) => void
  loading?: boolean
}

export function CreateCatalogModal({ open, onClose, onSubmit, loading }: CreateCatalogModalProps) {
  const [name, setName] = useState('')
  const [providerId, setProviderId] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setProviderId('')
    }
  }, [open])

  return (
    <Modal
      title="Ajouter un catalogue"
      open={open}
      onCancel={onClose}
      onOk={() => onSubmit({ name, providerId: providerId || undefined })}
      okText="Créer"
      cancelText="Annuler"
      okButtonProps={{ disabled: !name.trim(), loading }}
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Nom du catalogue</label>
          <Input
            placeholder="Ex: Catalogue WhatsApp"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">
            ID du fournisseur (Facebook Catalog ID, optionnel)
          </label>
          <Input
            placeholder="Ex: 2398583830601212"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
