import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { MESSAGE_PROCESSING_QUEUE } from '../queue/queue.module'
import type { IncomingMessageEvent } from '../social/webhook.service'
import { AgentMessageProcessorService } from './agent-message-processor.service'
import { MessageRunCoordinator } from './message-run-coordinator'
import { runWithContext } from '../posthog/request-context'

export interface MessageProcessingJobData {
  event: IncomingMessageEvent
  /** Numéro de séquence monotone réservé à l'arrivée du message (cf. MessageRunCoordinator). */
  seq: number
}

export type MessageProcessingJobName = 'process'

/**
 * Worker de la file `message-processing`. Chaque message entrant est un job ;
 * un seul run d'agent « gagnant » par contact aboutit :
 *  - on saute immédiatement les jobs déjà périmés (un message plus récent est
 *    arrivé pendant l'attente) — sans même appeler le LLM ;
 *  - on lance le run avec un `AbortSignal` que {@link MessageRunCoordinator.watch}
 *    déclenche dès qu'un message plus récent arrive, sur n'importe quelle instance.
 */
@Processor(MESSAGE_PROCESSING_QUEUE, {
  // Plusieurs contacts traités en parallèle sur une même instance ; l'annulation
  // par contact (et non un verrou global) évite les doubles réponses.
  concurrency: Number(process.env.AGENT_MESSAGE_CONCURRENCY) || 10,
})
export class MessageProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessingProcessor.name)

  constructor(
    private readonly processor: AgentMessageProcessorService,
    private readonly coordinator: MessageRunCoordinator,
  ) {
    super()
  }

  async process(job: Job<MessageProcessingJobData>): Promise<void> {
    const name = job.name as MessageProcessingJobName
    if (name !== 'process') {
      this.logger.warn(`[MessageProcessing] job inconnu : ${String(job.name)}`)
      return
    }

    const { event, seq } = job.data

    // Le job tourne dans un worker BullMQ : le scope AsyncLocalStorage du webhook
    // qui a déclenché ce run n'existe plus ici. On en rouvre un, taggé avec la
    // conversation, pour que TOUS les logs du run d'agent soient cherchables par
    // conversation dans PostHog (et distinguables de l'ingestion via `source`).
    return runWithContext(
      {
        conversationId: event.conversationId,
        contactId: event.message.senderId,
        socialAccountId: event.socialAccountId,
        provider: event.provider,
        organisationId: event.orgId,
        source: 'agent-message-processing',
      },
      async () => {
        // Périmé avant même de commencer : un message plus récent du même contact est
        // déjà arrivé. On n'engage aucune analyse LLM.
        if (await this.coordinator.isSuperseded(event.conversationId, seq)) {
          this.logger.log(
            `Run #${seq} de la conversation ${event.conversationId} ignoré (déjà supplanté)`,
          )
          return
        }

        const controller = new AbortController()
        const stopWatching = this.coordinator.watch(event.conversationId, seq, controller)
        try {
          await this.processor.processIncoming(event, controller.signal)
        } finally {
          stopWatching()
        }
      },
    )
  }
}
