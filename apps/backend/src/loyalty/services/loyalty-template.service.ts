import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EncryptionService } from '../../auth/encryption.service'
import {
  CampaignTemplateSelectionDto,
  CreateLoyaltyTemplateDto,
  UpdateLoyaltyTemplateDto,
} from '../dto/loyalty.dto'

const META_API_BASE = 'https://graph.facebook.com/v22.0'

const META_NAMED_PARAMETER_EXAMPLES: Record<string, string> = {
  customer_name: 'Marie Dupont',
  amount: '45 000 FCFA',
  product_name: 'Sac a main cuir noir',
  order_count: '7',
  orders_left: '2',
  reward_value: '5 000 FCFA',
}

interface MetaTemplateComponent {
  type: string
  text?: string
  format?: string
  example?: Record<string, unknown>
  buttons?: Array<Record<string, unknown>>
}

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
  rejected_reason?: string
  rejection_reason?: string
}

/**
 * Public template shape returned to the frontend. Templates are NOT persisted
 * in our DB; they live on Meta and are fetched live on each list call.
 */
export interface LoyaltyTemplate {
  id: string // Meta template id
  socialAccountId: string
  name: string
  language: string
  category: string
  body: string
  variables: string[]
  status: string
  headerType?: string
  headerText?: string
  footerText?: string
  buttons?: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>
  rejectionReason?: string
}

@Injectable()
export class LoyaltyTemplateService {
  private readonly logger = new Logger('LoyaltyService')

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
  ) {}

  // ─── Templates (live from Meta — never persisted) ───

  /** Resolve a WhatsApp account or fail loudly. */
  private async resolveWhatsAppAccount(socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      omit: { accessToken: false },
    })
    if (!account) throw new NotFoundException('Compte social introuvable')
    if (account.provider !== 'WHATSAPP') {
      throw new BadRequestException('Cette opération est réservée aux comptes WhatsApp')
    }
    if (!account.wabaId) {
      throw new BadRequestException('WABA ID manquant pour ce numéro WhatsApp')
    }
    const accessToken = await this.encryptionService.decrypt(account.accessToken)
    return { account, accessToken, wabaId: account.wabaId }
  }

  private toLoyaltyTemplate(socialAccountId: string, m: MetaTemplate): LoyaltyTemplate {
    const bodyComponent = (m.components ?? []).find((c) => c.type === 'BODY')
    const headerComponent = (m.components ?? []).find((c) => c.type === 'HEADER')
    const footerComponent = (m.components ?? []).find((c) => c.type === 'FOOTER')
    const buttonsComponent = (m.components ?? []).find((c) => c.type === 'BUTTONS')
    const body = bodyComponent?.text ?? ''
    const variables = Array.from(body.matchAll(/{{\s*([^}]+?)\s*}}/g), (x) => x[1].trim())
    return {
      id: m.id,
      socialAccountId,
      name: m.name,
      language: m.language,
      category: m.category,
      body,
      variables,
      status: m.status,
      headerType: headerComponent?.format ?? (headerComponent?.text ? 'TEXT' : 'NONE'),
      headerText: headerComponent?.text,
      footerText: footerComponent?.text,
      buttons: (buttonsComponent?.buttons ?? []).map((button) => ({
        type: String(button.type ?? 'QUICK_REPLY'),
        text: String(button.text ?? ''),
        url: typeof button.url === 'string' ? button.url : undefined,
        phoneNumber: typeof button.phone_number === 'string' ? button.phone_number : undefined,
      })),
      rejectionReason: m.rejected_reason ?? m.rejection_reason,
    }
  }

  private extractNamedTemplateParameters(text?: string): string[] {
    if (!text) return []
    const names = new Set<string>()
    for (const match of text.matchAll(/{{\s*([^}]+?)\s*}}/g)) {
      const name = match[1].trim()
      if (name && !/^\d+$/.test(name)) names.add(name)
    }
    return Array.from(names)
  }

  private buildNamedParameterExamples(names: string[]) {
    return names.map((paramName) => ({
      param_name: paramName,
      example: META_NAMED_PARAMETER_EXAMPLES[paramName] ?? 'Example',
    }))
  }

  private buildTextTemplateComponent(type: 'HEADER' | 'BODY', text: string): MetaTemplateComponent {
    const namedParameters = this.extractNamedTemplateParameters(text)
    const component: MetaTemplateComponent = { type, text }
    if (type === 'HEADER') component.format = 'TEXT'
    if (namedParameters.length > 0) {
      component.example = {
        [type === 'HEADER' ? 'header_text_named_params' : 'body_text_named_params']:
          this.buildNamedParameterExamples(namedParameters),
      }
    }
    return component
  }

  private usesNamedTemplateParameters(data: Pick<CreateLoyaltyTemplateDto, 'body' | 'headerText'>) {
    return (
      this.extractNamedTemplateParameters(data.body).length > 0 ||
      this.extractNamedTemplateParameters(data.headerText).length > 0
    )
  }

  /** Fetch the live list of WhatsApp Business message templates from Meta. */
  async listTemplates(socialAccountId: string): Promise<LoyaltyTemplate[]> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(socialAccountId)

    const fetched: MetaTemplate[] = []
    let nextUrl: string | null =
      `${META_API_BASE}/${wabaId}/message_templates` +
      `?fields=id,name,language,status,category,components,rejected_reason&limit=100`

    while (nextUrl) {
      const res: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const text = await res.text()
        this.logger.error(`Meta message_templates fetch failed: ${res.status} ${text}`)
        throw new BadRequestException(`Meta API error: ${text}`)
      }
      const json = (await res.json()) as {
        data?: MetaTemplate[]
        paging?: { next?: string }
      }
      if (json.data) fetched.push(...json.data)
      nextUrl = json.paging?.next ?? null
    }

    return fetched.map((m) => this.toLoyaltyTemplate(socialAccountId, m))
  }

  /** Build Meta's `components` array from our flat DTO. */
  private buildTemplateComponents(data: CreateLoyaltyTemplateDto): MetaTemplateComponent[] {
    const components: MetaTemplateComponent[] = []

    // ─── HEADER ───
    if (data.headerType === 'TEXT' && data.headerText?.trim()) {
      components.push(this.buildTextTemplateComponent('HEADER', data.headerText.trim()))
    } else if (
      (data.headerType === 'IMAGE' || data.headerType === 'VIDEO') &&
      data.headerMediaUrl
    ) {
      // NOTE: in production Meta requires a `header_handle` obtained via the
      // resumable upload API. For now we pass the public URL through `example`
      // so submission still goes through; switching to header_handle is a
      // future hardening step.
      components.push({
        type: 'HEADER',
        format: data.headerType,
        example: { header_url: [data.headerMediaUrl] },
      } as MetaTemplateComponent)
    }

    // ─── BODY (always required) ───
    components.push(this.buildTextTemplateComponent('BODY', data.body))

    // ─── FOOTER ───
    if (data.footerText?.trim()) {
      components.push({ type: 'FOOTER', text: data.footerText.trim() })
    }

    // ─── BUTTONS ───
    if (data.buttons && data.buttons.length > 0) {
      const buttons = data.buttons.reduce<Record<string, unknown>[]>((acc, b) => {
        const fixedText = this.getProductTemplateButtonText(b.type)
        const text = fixedText ?? b.text?.trim()
        if (!text) return acc
        if (b.type === 'URL') acc.push({ type: 'URL', text, url: b.url ?? '' })
        else if (b.type === 'PHONE_NUMBER')
          acc.push({ type: 'PHONE_NUMBER', text, phone_number: b.phoneNumber ?? '' })
        else if (b.type === 'CATALOG') acc.push({ type: 'CATALOG', text })
        else if (b.type === 'MPM') acc.push({ type: 'MPM', text })
        else acc.push({ type: 'QUICK_REPLY', text })
        return acc
      }, [])
      if (buttons.length > 0) {
        components.push({ type: 'BUTTONS', buttons } as MetaTemplateComponent)
      }
    }

    return components
  }

  private validateTemplateFooter(data: { category?: string; footerText?: string }) {
    const footer = data.footerText?.trim() ?? ''
    if (footer.length > 60) {
      throw new BadRequestException('Le footer doit contenir 60 caractères maximum')
    }
    if ((data.category ?? 'MARKETING') === 'MARKETING') {
      if (!footer.includes('STOP')) {
        throw new BadRequestException('Le footer des templates marketing doit contenir STOP')
      }
    }
  }

  private getProductTemplateButtonText(type?: string) {
    if (type === 'CATALOG') return 'View catalog'
    if (type === 'MPM') return 'View items'
    return undefined
  }

  private validateTemplateButtons(data: { category?: string; buttons?: Array<{ type?: string }> }) {
    const buttons = data.buttons ?? []
    const productButtons = buttons.filter((button) =>
      this.getProductTemplateButtonText(button.type),
    )
    if (productButtons.length === 0) return

    if ((data.category ?? 'MARKETING') !== 'MARKETING') {
      throw new BadRequestException(
        'Les boutons catalogue et multi-produits sont uniquement disponibles pour les templates marketing',
      )
    }

    if (buttons.length > 1 || productButtons.length > 1) {
      throw new BadRequestException(
        'Un template catalogue ou multi-produits ne peut contenir qu’un seul bouton',
      )
    }
  }

  private validateTemplateMpmHeader(data: {
    buttons?: Array<{ type?: string }>
    headerType?: string
    headerText?: string
    headerMediaUrl?: string
  }) {
    const hasMpmButton = (data.buttons ?? []).some((button) => button.type === 'MPM')
    if (!hasMpmButton) return

    if (!data.headerType || data.headerType === 'NONE') {
      throw new BadRequestException(
        'Un entête est requis pour les templates avec un bouton multi-produits',
      )
    }
    if (data.headerType === 'TEXT' && !data.headerText?.trim()) {
      throw new BadRequestException(
        "Le texte d'entête est requis pour les templates avec un bouton multi-produits",
      )
    }
    if (
      (data.headerType === 'IMAGE' || data.headerType === 'VIDEO') &&
      !data.headerMediaUrl?.trim()
    ) {
      throw new BadRequestException(
        "Le média d'entête est requis pour les templates avec un bouton multi-produits",
      )
    }
  }

  /** Create a template directly on Meta (it enters Meta's review queue). */
  async createTemplate(data: CreateLoyaltyTemplateDto): Promise<LoyaltyTemplate> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(data.socialAccountId)
    this.validateTemplateFooter(data)
    this.validateTemplateButtons(data)
    this.validateTemplateMpmHeader(data)

    const components = this.buildTemplateComponents(data)
    const parameterFormat = this.usesNamedTemplateParameters(data) ? 'NAMED' : undefined

    const res = await fetch(`${META_API_BASE}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        language: data.language ?? 'fr',
        category: data.category ?? 'MARKETING',
        ...(parameterFormat ? { parameter_format: parameterFormat } : {}),
        components,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`Meta template create failed: ${res.status} ${text}`)
      throw new BadRequestException(`Meta API error: ${text}`)
    }

    const created = (await res.json()) as { id: string; status: string; category: string }
    return {
      id: created.id,
      socialAccountId: data.socialAccountId,
      name: data.name,
      language: data.language ?? 'fr',
      category: created.category ?? data.category ?? 'MARKETING',
      body: data.body,
      variables: data.variables ?? [],
      status: created.status ?? 'PENDING',
      footerText: data.footerText,
    }
  }

  async updateTemplate(
    socialAccountId: string,
    templateId: string,
    data: UpdateLoyaltyTemplateDto,
  ): Promise<LoyaltyTemplate> {
    const { accessToken } = await this.resolveWhatsAppAccount(socialAccountId)
    if (!data.body) throw new BadRequestException('Le corps du template est requis')
    this.validateTemplateFooter(data)
    this.validateTemplateButtons(data)
    this.validateTemplateMpmHeader(data)

    const components = this.buildTemplateComponents({
      socialAccountId,
      name: data.name ?? '',
      language: data.language,
      category: data.category,
      body: data.body,
      variables: data.variables,
      headerType: data.headerType,
      headerText: data.headerText,
      headerMediaUrl: data.headerMediaUrl,
      footerText: data.footerText,
      buttons: data.buttons,
    })
    const parameterFormat = this.usesNamedTemplateParameters({
      body: data.body,
      headerText: data.headerText,
    })
      ? 'NAMED'
      : undefined

    const res = await fetch(`${META_API_BASE}/${templateId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: data.category ?? 'MARKETING',
        ...(parameterFormat ? { parameter_format: parameterFormat } : {}),
        components,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`Meta template update failed: ${res.status} ${text}`)
      throw new BadRequestException(`Meta API error: ${text}`)
    }

    const updated = (await res.json().catch(() => ({}))) as {
      success?: boolean
      id?: string
      status?: string
    }
    return {
      id: updated.id ?? templateId,
      socialAccountId,
      name: data.name ?? '',
      language: data.language ?? 'fr',
      category: data.category ?? 'MARKETING',
      body: data.body,
      variables: data.variables ?? [],
      status: updated.status ?? 'PENDING',
      footerText: data.footerText,
    }
  }

  /** Delete a template on Meta by name (Meta deletes all language variants). */
  async removeTemplate(socialAccountId: string, name: string): Promise<void> {
    const { accessToken, wabaId } = await this.resolveWhatsAppAccount(socialAccountId)
    const usage = await this.findTemplateUsage(socialAccountId, name)
    if (usage.length > 0) {
      throw new BadRequestException({
        message: 'Ce template est utilisé et ne peut pas être supprimé',
        usage,
      })
    }

    const url = `${META_API_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`Meta template delete failed: ${res.status} ${text}`)
      throw new BadRequestException(`Meta API error: ${text}`)
    }
  }

  private async findTemplateUsage(socialAccountId: string, templateName: string) {
    const campaigns = await this.prisma.loyaltyCampaign.findMany({
      where: { socialAccountId },
      select: {
        id: true,
        name: true,
        origin: true,
        metaTemplateName: true,
        templateAssignments: true,
        status: true,
      },
    })
    return campaigns
      .filter((campaign) => {
        if (campaign.metaTemplateName === templateName) return true
        const assignments =
          (campaign.templateAssignments as CampaignTemplateSelectionDto[] | null) ?? []
        return assignments.some((assignment) => assignment.metaTemplateName === templateName)
      })
      .map((campaign) => ({
        type: 'campaign',
        id: campaign.id,
        name: campaign.name,
        origin: campaign.origin,
        status: campaign.status,
      }))
  }
}
