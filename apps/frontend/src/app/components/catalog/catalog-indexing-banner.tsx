import { Progress } from 'antd'
import { Brain } from 'lucide-react'
import type { Catalog } from '@app/lib/api/agent-api'

interface CatalogIndexingBannerProps {
  catalogs: Catalog[]
}

export function CatalogIndexingBanner({ catalogs }: CatalogIndexingBannerProps) {
  // Find catalogs currently being indexed
  const indexingCatalogs = catalogs.filter(
    (c) => c.analysisStatus === 'ANALYZING' || c.analysisStatus === 'INDEXING',
  )

  if (indexingCatalogs.length === 0) return null

  // Aggregate progress across all indexing catalogs
  const totalProducts = indexingCatalogs.reduce((sum, c) => sum + c.productCount, 0)
  const totalIndexed = indexingCatalogs.reduce((sum, c) => sum + c.indexedCount, 0)
  const percentage = totalProducts > 0 ? Math.round(20 + (totalIndexed / totalProducts) * 80) : 10

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
      <div className="flex-shrink-0 text-text-muted">
        <Brain size={20} strokeWidth={1.5} />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-text-primary">
          Indexation des images en cours
        </span>
        <span className="text-xs text-text-muted">
          Nos IA apprennent à connaître vos produits et services afin de mieux répondre à vos
          clients
        </span>
        <Progress
          percent={percentage}
          size="small"
          strokeColor={{ from: '#000', to: '#000' }}
          showInfo={false}
        />
      </div>
    </div>
  )
}
