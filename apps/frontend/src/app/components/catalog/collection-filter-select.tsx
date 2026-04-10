import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, Modal, Dropdown } from 'antd'
import { ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Collection } from '@app/lib/api/agent-api'
import { CollectionModal } from './collection-modal'

interface CollectionFilterSelectProps {
  collections: Collection[]
  selected: string | undefined
  onSelect: (collectionId: string | undefined) => void
  loading: boolean
  onAdd: (name: string) => void
  onEdit: (collection: Collection, name: string) => void
  onDelete: (collection: Collection) => void
  mutating?: boolean
}

export function CollectionFilterSelect({
  collections,
  selected,
  onSelect,
  loading,
  onAdd,
  onEdit,
  onDelete,
  mutating,
}: CollectionFilterSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)

  const selectedCollection = collections.find((c) => c.id === selected)

  const label = selectedCollection ? selectedCollection.name : t('catalog.collection')

  const handleModalSubmit = (values: { name: string }) => {
    if (editingCollection) {
      onEdit(editingCollection, values.name)
    } else {
      onAdd(values.name)
    }
    setModalOpen(false)
    setEditingCollection(null)
  }

  const handleDelete = (collection: Collection) => {
    Modal.confirm({
      title: t('catalog.delete_collection'),
      content: t('catalog.delete_collection_confirm'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        onDelete(collection)
        if (selected === collection.id) onSelect(undefined)
      },
    })
  }

  const content = (
    <div className="flex w-64 flex-col">
      <div className="px-3 py-2 text-xs font-semibold text-text-muted">
        {t('catalog.filter_collection')}
      </div>

      {/* Scrollable list */}
      <div style={{ maxHeight: 350, overflowY: 'auto' }}>
        {/* "All" option */}
        <button
          type="button"
          onClick={() => {
            onSelect(undefined)
            setOpen(false)
          }}
          className="tickets-status-option"
          style={!selected ? { background: 'var(--color-bg-subtle)' } : undefined}
        >
          <span className="flex-1 truncate">{t('common.all')}</span>
        </button>

        {/* Collection items */}
        {collections.map((collection) => {
          const isActive = selected === collection.id
          return (
            <div
              key={collection.id}
              className="tickets-status-option"
              style={isActive ? { background: 'var(--color-bg-subtle)' } : undefined}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2"
                onClick={() => {
                  onSelect(isActive ? undefined : collection.id)
                  setOpen(false)
                }}
              >
                <span className="flex-1 truncate text-left">{collection.name}</span>
                {collection.product_count != null && (
                  <span className="flex-shrink-0 text-xs text-text-muted">
                    {collection.product_count}
                  </span>
                )}
              </button>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'edit',
                      label: t('catalog.edit_collection'),
                      icon: <Pencil size={14} />,
                      onClick: () => {
                        setEditingCollection(collection)
                        setModalOpen(true)
                        setOpen(false)
                      },
                    },
                    {
                      key: 'delete',
                      label: t('catalog.delete_collection'),
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onClick: () => handleDelete(collection),
                    },
                  ],
                }}
                trigger={['click']}
              >
                <button
                  type="button"
                  className="flex flex-shrink-0 items-center justify-center rounded p-0.5 hover:bg-black/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal size={14} className="text-text-muted" />
                </button>
              </Dropdown>
            </div>
          )
        })}
      </div>

      {/* Add collection button */}
      <button
        type="button"
        className="tickets-status-option border-t border-border-secondary"
        onClick={() => {
          setEditingCollection(null)
          setModalOpen(true)
          setOpen(false)
        }}
      >
        <Plus size={14} className="text-text-muted" />
        <span className="flex-1 truncate">{t('catalog.add_collection')}</span>
      </button>
    </div>
  )

  return (
    <>
      <Popover
        content={content}
        trigger="click"
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
        }}
        placement="bottomLeft"
        overlayClassName="org-switcher-popover"
        arrow={false}
      >
        <button type="button" className="tickets-status-trigger w-full" disabled={loading}>
          <span>{label}</span>
          <ChevronDown size={14} className="text-text-muted" />
        </button>
      </Popover>

      <CollectionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingCollection(null)
        }}
        onSubmit={handleModalSubmit}
        collection={editingCollection ?? undefined}
        loading={mutating}
      />
    </>
  )
}
