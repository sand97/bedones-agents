import { Injectable, Logger } from '@nestjs/common'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { LlmFactoryService } from '../common/llm/llm-factory.service'

export interface AIAnalysisResult {
  action: 'none' | 'hide' | 'delete' | 'reply'
  reason: string
  replyMessage?: string
}

interface FAQRule {
  question: string
  answer: string
}

interface CommentContext {
  comment: {
    id: string
    message: string
    fromName: string
    fromId: string
  }
  pageSettings: {
    undesiredCommentsAction: string
    spamAction: string
    customInstructions?: string | null
    faqRules: FAQRule[]
  }
  /** The post the comment is on (caption / message). */
  post?: {
    message: string | null
    permalinkUrl: string | null
  }
  /**
   * Parent reply chain, ordered from oldest (top-level reply to the post) to
   * newest (the comment immediately above the one we are analyzing). Empty
   * when the comment is itself a top-level reply to the post.
   */
  thread?: Array<{
    fromName: string
    message: string
    isPageReply: boolean
  }>
  /**
   * Products referenced by the post (resolved from product codes found in the post
   * caption against the catalog linked to the page). Lets the agent answer
   * price / availability questions on the commented product instead of replying
   * generically.
   */
  products?: Array<{
    retailerId: string
    name: string | null
    price: number | null
    currency: string | null
  }>
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name)

  constructor(private readonly llmFactory: LlmFactoryService) {}

  /**
   * Comment moderation / auto-reply uses the "flash" tier (lightweight model).
   * Gemini primary + OpenAI fallback is handled by the factory via withFallbacks.
   */
  async analyzeComment(context: CommentContext): Promise<AIAnalysisResult> {
    const systemPrompt = this.buildSystemPrompt(context.pageSettings)
    const userMessage = this.buildUserMessage(
      context.comment,
      context.post,
      context.thread,
      context.products,
    )
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(userMessage)]

    try {
      const model = this.llmFactory.createChatModel('flash', {
        temperature: 0.7,
        maxOutputTokens: 1024,
      })
      const response = await model.invoke(messages)
      const content =
        typeof response === 'object' && response !== null && 'content' in response
          ? (response as { content: unknown }).content
          : ''
      return this.parseAIResponse(typeof content === 'string' ? content : '')
    } catch (error) {
      this.logger.error('Comment analysis failed:', error)
      return { action: 'none', reason: 'No AI service available' }
    }
  }

  private buildSystemPrompt(pageSettings: CommentContext['pageSettings']): string {
    const capabilities: string[] = []

    if (pageSettings.undesiredCommentsAction !== 'none') {
      capabilities.push(
        `- Detect undesired comments (offensive, inappropriate, violating community guidelines) and ${pageSettings.undesiredCommentsAction} them`,
      )
    }

    if (pageSettings.spamAction !== 'none') {
      capabilities.push(
        `- Detect spam comments (promotional, repetitive, irrelevant) and ${pageSettings.spamAction} them`,
      )
    }

    if (pageSettings.faqRules.length > 0) {
      capabilities.push(
        '- Respond to frequently asked questions with helpful, friendly replies based on the FAQ rules below',
      )
    }

    let faqSection = ''
    if (pageSettings.faqRules.length > 0) {
      faqSection = `\n\nFAQ Rules (Use these to automatically reply to user questions):
${pageSettings.faqRules
  .map(
    (rule, index) =>
      `${index + 1}. When: ${rule.question}
   Reply with: ${rule.answer}`,
  )
  .join('\n')}

IMPORTANT: When a user's comment matches one of the FAQ rules above, you MUST use the "reply" action and provide the corresponding response as the replyMessage. Adapt the response slightly to match the user's question naturally, but keep the core information from the FAQ rule.`
    }

    let customSection = ''
    if (pageSettings.customInstructions) {
      customSection = `\n\nCustom instructions from the page owner:\n${pageSettings.customInstructions}`
    }

    return `You are a social media comment moderator AI. Your task is to analyze comments and decide what action to take.

Available capabilities:
${capabilities.length > 0 ? capabilities.join('\n') : '- Monitor comments (no automated actions configured)'}${faqSection}${customSection}

Available actions:
- "hide": Hide the comment from public view
- "delete": Permanently delete the comment
- "reply": Reply to the comment with a helpful message
- "none": Take no action (comment is acceptable)

You must respond with a JSON object in this exact format:
{
  "action": "none" | "hide" | "delete" | "reply",
  "reason": "Brief explanation of why this action was chosen",
  "replyMessage": "The message to reply with (only if action is 'reply')"
}

Guidelines:
- Be fair and balanced in your moderation decisions
- Only take action when clearly warranted by the comment content
- For FAQ replies, be helpful, friendly, and concise
- When a comment matches an FAQ rule, ALWAYS use the "reply" action with the appropriate response
- Consider context and intent, not just keywords
- Prioritize user experience and community safety
- Negative opinions about the brand, products, or services (e.g. "these look fake", "overpriced", "bad quality") can influence other users' purchasing decisions. By default, HIDE negative opinions to protect the brand image. However, if the page owner's custom instructions explicitly ask to leave negative opinions visible or not moderate them, then take no action on those comments.`
  }

  private buildUserMessage(
    comment: CommentContext['comment'],
    post?: CommentContext['post'],
    thread?: CommentContext['thread'],
    products?: CommentContext['products'],
  ): string {
    const sections: string[] = []

    if (post?.message) {
      sections.push(`Original post:\n"""\n${post.message}\n"""`)
    }

    if (products && products.length > 0) {
      const productText = products
        .map((p) => {
          const price = p.price != null ? ` — ${p.price}${p.currency ? ` ${p.currency}` : ''}` : ''
          return `- ${p.name || p.retailerId} (code: ${p.retailerId})${price}`
        })
        .join('\n')
      sections.push(
        `Products referenced in the post (use these exact details for price/availability questions; do not invent prices):\n${productText}`,
      )
    }

    if (thread && thread.length > 0) {
      const threadText = thread
        .map((t) => `- ${t.isPageReply ? 'Page' : t.fromName}: "${t.message}"`)
        .join('\n')
      sections.push(
        `Comment thread leading to this reply (oldest first — use this to avoid repeating yourself and to keep context):\n${threadText}`,
      )
    }

    sections.push(
      `New comment to analyze:\nFrom: ${comment.fromName} (ID: ${comment.fromId})\nMessage: "${comment.message}"`,
    )

    sections.push(
      'Provide your analysis and recommended action. If the thread shows the page already answered the same question, do not repeat the same reply — either acknowledge progress, ask a clarifying question, or take no action.',
    )

    return sections.join('\n\n')
  }

  private parseAIResponse(text: string): AIAnalysisResult {
    const jsonRegex = /\{[\s\S]*\}/
    const jsonMatch = jsonRegex.exec(text)
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response')
    }

    const parsed = JSON.parse(jsonMatch[0]) as AIAnalysisResult

    if (!['none', 'hide', 'delete', 'reply'].includes(parsed.action)) {
      throw new Error(`Invalid action in AI response: ${parsed.action}`)
    }

    if (!parsed.reason) {
      throw new Error('Missing reason in AI response')
    }

    if (parsed.action === 'reply' && !parsed.replyMessage) {
      throw new Error('Missing replyMessage for reply action')
    }

    return parsed
  }
}
