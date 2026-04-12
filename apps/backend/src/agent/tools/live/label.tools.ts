import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { PrismaService } from '../../../prisma/prisma.service'

export function createLabelTools(deps: { prisma: PrismaService; socialAccountId: string }) {
  const getLabels = tool(
    async () => {
      const labels = await deps.prisma.label.findMany({
        where: { socialAccountId: deps.socialAccountId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, color: true },
      })

      if (labels.length === 0) return 'No labels available.'

      return labels.map((l) => `${l.name} (id: ${l.id})`).join('\n')
    },
    {
      name: 'get_labels',
      description: 'Get all available labels for this social account.',
      schema: z.object({}),
    },
  )

  return [getLabels]
}
