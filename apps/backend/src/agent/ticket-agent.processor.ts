import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { TICKET_AGENT_QUEUE } from '../queue/queue.module'
import {
  TicketAgentService,
  type TicketAgentJobData,
  type TicketAgentJobName,
} from './ticket-agent.service'

@Processor(TICKET_AGENT_QUEUE)
export class TicketAgentProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketAgentProcessor.name)

  constructor(private readonly ticketAgent: TicketAgentService) {
    super()
  }

  async process(job: Job<unknown>): Promise<void> {
    const name = job.name as TicketAgentJobName
    if (name === 'process') {
      await this.ticketAgent.processTicketRequest(job.data as TicketAgentJobData)
      return
    }
    this.logger.warn(`[Ticket] unknown job name: ${String(name)}`)
  }
}
