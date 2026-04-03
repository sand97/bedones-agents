import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

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
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name)
  private geminiModel: ChatGoogleGenerativeAI | null = null
  private openaiModel: ChatOpenAI | null = null

  constructor(private configService: ConfigService) {}

  private getGeminiModel(): ChatGoogleGenerativeAI | null {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')
    if (!apiKey) return null
    if (!this.geminiModel) {
      const model =
        this.configService.get<string>('GEMINI_COMMENT_MODEL') || 'gemini-3-flash-preview'
      this.geminiModel = new ChatGoogleGenerativeAI({
        apiKey,
        model,
        temperature: 0.7,
        maxOutputTokens: 1024,
      })
    }
    return this.geminiModel
  }

  private getOpenAIModel(): ChatOpenAI | null {
    const apiKey = this.configService.get<string>('OPENIA_API_KEY')
    if (!apiKey) return null
    if (!this.openaiModel) {
      const model = this.configService.get<string>('OPENAI_COMMENT_MODEL') || 'gpt-5.4-mini'
      this.openaiModel = new ChatOpenAI({
        openAIApiKey: apiKey,
        model,
        temperature: 0.7,
        maxTokens: 1024,
      })
    }
    return this.openaiModel
  }

  async analyzeComment(context: CommentContext): Promise<AIAnalysisResult> {
    const systemPrompt = this.buildSystemPrompt(context.pageSettings)
    const userMessage = this.buildUserMessage(context.comment)
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(userMessage)]

    // Try Gemini first
    try {
      const gemini = this.getGeminiModel()
      if (gemini) {
        const response = await gemini.invoke(messages)
        return this.parseAIResponse(response.content as string)
      }
    } catch (error) {
      this.logger.error('Gemini analysis failed:', error)
    }

    // Fallback to OpenAI
    try {
      const openai = this.getOpenAIModel()
      if (openai) {
        const response = await openai.invoke(messages)
        return this.parseAIResponse(response.content as string)
      }
    } catch (error) {
      this.logger.error('OpenAI analysis failed:', error)
    }

    this.logger.warn('No AI service available, defaulting to no action')
    return { action: 'none', reason: 'No AI service configured' }
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

  private buildUserMessage(comment: CommentContext['comment']): string {
    return `Analyze this social media comment:

From: ${comment.fromName} (ID: ${comment.fromId})
Message: "${comment.message}"

Provide your analysis and recommended action.`
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
