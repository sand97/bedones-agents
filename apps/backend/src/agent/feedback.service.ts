import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import { LlmFactoryService } from '../common/llm/llm-factory.service'
import { buildLlmTrace } from '../common/llm/llm-trace'
import { AgentPromptsService } from './prompts/agent-prompts.service'
import type { AgentFeedbackResponseDto } from './dto/feedback.dto'

export interface FeedbackTurn {
  from: 'user' | 'agent'
  text: string
}

const feedbackOutputSchema = z
  .object({
    mode: z
      .enum(['complete', 'clarify'])
      .describe(
        '"complete" when the feedback is clear and the agent context can be updated; "clarify" when more information is needed from the operator.',
      ),
    question: z
      .string()
      .optional()
      .describe(
        'A single clarifying question to ask the operator. Required only when mode = "clarify".',
      ),
    newContext: z
      .string()
      .optional()
      .describe('The full updated agent context (markdown). Required only when mode = "complete".'),
    successMessage: z
      .string()
      .optional()
      .describe(
        'Short confirmation message shown to the operator. Required only when mode = "complete".',
      ),
  })
  .describe('Structured decision for the agent-feedback supervisor loop.')

type FeedbackOutput = z.infer<typeof feedbackOutputSchema>

@Injectable()
export class AgentFeedbackService {
  private readonly logger = new Logger(AgentFeedbackService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmFactory: LlmFactoryService,
    private readonly prompts: AgentPromptsService,
  ) {}

  /**
   * Runs one round of the feedback loop for a given AI-generated message.
   *
   * Resolves the agent from the message → conversation → social account chain,
   * calls the thinking-tier LLM (Gemini primary, OpenAI fallback) with a
   * structured-output schema, and either persists a refined context or returns
   * a clarifying question.
   */
  async submitFeedback(
    messageId: string,
    conversation: FeedbackTurn[],
  ): Promise<AgentFeedbackResponseDto> {
    if (conversation.length === 0) {
      throw new NotFoundException('Feedback conversation is empty.')
    }

    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        message: true,
        mediaType: true,
        conversationId: true,
        createdTime: true,
        conversation: {
          select: {
            socialAccountId: true,
            socialAccount: {
              select: {
                agentLink: {
                  select: {
                    agent: {
                      select: {
                        id: true,
                        context: true,
                        organisationId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!message) {
      throw new NotFoundException('Message introuvable.')
    }

    const agent = message.conversation.socialAccount.agentLink?.agent
    if (!agent) {
      throw new NotFoundException(
        "Aucun agent n'est associé à cette conversation. Impossible de traiter le feedback.",
      )
    }

    // Fetch the customer message that triggered this AI reply (the previous
    // non-page message in the same conversation) for richer context.
    const customerMessage = await this.prisma.directMessage.findFirst({
      where: {
        conversationId: message.conversationId,
        isFromPage: false,
        createdTime: { lt: message.createdTime },
      },
      orderBy: { createdTime: 'desc' },
      select: { message: true },
    })

    const systemPrompt = this.prompts.buildFeedbackSystemPrompt({
      agentContext: agent.context || '',
      originalMessage: message.message || `[${message.mediaType || 'media'}]`,
      customerMessage: customerMessage?.message || null,
    })

    const conversationBlock = conversation
      .map((turn) =>
        turn.from === 'user' ? `Opérateur: ${turn.text}` : `Superviseur: ${turn.text}`,
      )
      .join('\n')

    const model = this.llmFactory.createStructuredChatModel('thinking', feedbackOutputSchema, {
      trace: buildLlmTrace({
        feature: 'agent-feedback',
        organisationId: agent.organisationId,
        conversationId: message.conversationId,
        agentId: agent.id,
      }),
    })

    let result: FeedbackOutput
    try {
      result = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Voici l'échange avec l'opérateur jusqu'à présent :\n${conversationBlock}\n\nAnalyse et décide.`,
        ),
      ])
    } catch (error) {
      this.logger.error(
        `Feedback LLM call failed for agent ${agent.id}: ${error instanceof Error ? error.message : error}`,
      )
      throw error
    }

    if (result.mode === 'complete') {
      if (!result.newContext || !result.successMessage) {
        throw new Error(
          'Structured response for mode="complete" is missing newContext or successMessage.',
        )
      }
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: { context: result.newContext },
      })
      return {
        mode: 'complete',
        newContext: result.newContext,
        successMessage: result.successMessage,
      }
    }

    if (!result.question) {
      throw new Error('Structured response for mode="clarify" is missing question.')
    }
    return { mode: 'clarify', question: result.question }
  }
}
