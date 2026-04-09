import { useTranslation } from 'react-i18next'
import { Button, Dropdown, Modal, Spin } from 'antd'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Collection } from '@app/lib/api/agent-api'

interface CollectionListProps {
  collections: Collection[]
  loading: boolean
  onAdd: () => void
  onEdit: (collection: Collection) => void
  onDelete: (collection: Collection) => void
}

export function CollectionList({
  collections,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: CollectionListProps) {
  const { t } = useTranslation()

  const handleDelete = (collection: Collection) => {
    Modal.confirm({
      title: t('catalog.delete_collection'),
      content: t('catalog.delete_collection_confirm'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => onDelete(collection),
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spin />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">
          {t('catalog.collections')} ({collections.length})
        </span>
        <Button onClick={onAdd} icon={<Plus size={14} />} size="small">
          {t('catalog.add_collection')}
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-text-muted">
          {t('catalog.no_collections')}
        </div>
      ) : (
        collections.map((collection) => (
          <div
            key={collection.id}
            className="flex items-center justify-between rounded-lg border border-border-secondary p-4"
          >
            <div>
              <div className="text-sm font-medium text-text-primary">{collection.name}</div>
              {collection.product_count != null && (
                <div className="text-xs text-text-muted">
                  {t('catalog.product_count', { count: collection.product_count })}
                </div>
              )}
            </div>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'edit',
                    label: t('catalog.edit_collection'),
                    icon: <Pencil size={14} />,
                    onClick: () => onEdit(collection),
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
              <Button type="text" icon={<MoreHorizontal size={16} />} size="small" />
            </Dropdown>
          </div>
        ))
      )}
    </div>
  )
}
