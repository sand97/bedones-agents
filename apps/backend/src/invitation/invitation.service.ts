import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name)
  private readonly otpStore = new Map<string, { code: string; expiresAt: number }>()

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jwtService: JwtService,
    private authService: AuthService,
  ) {}

  /**
   * Generate invitation JWT link (called after inviteMember to build the link)
   */
  generateInviteToken(orgId: string, phone: string): string {
    return this.jwtService.sign({ orgId, phone, type: 'invitation' }, { expiresIn: '7d' })
  }

  /**
   * Get invitation details from JWT token
   */
  async getInvitation(token: string) {
    const payload = this.verifyInviteToken(token)

    const member = await this.prisma.organisationMember.findFirst({
      where: {
        organisationId: payload.orgId,
        user: { phone: payload.phone },
        status: 'INVITED',
      },
      include: {
        organisation: { select: { id: true, name: true, logoUrl: true } },
        user: { select: { id: true, name: true, phone: true, status: true } },
      },
    })

    if (!member) {
      throw new NotFoundException(
        I18nContext.current()?.t('errors.invitation.not_found_or_accepted') ??
          'Invitation introuvable ou déjà acceptée',
      )
    }

    return {
      id: member.id,
      organisationId: member.organisation.id,
      organisationName: member.organisation.name,
      organisationLogo: member.organisation.logoUrl,
      userName: member.user.name,
      phone: member.user.phone,
      userStatus: member.user.status,
      role: member.role,
    }
  }

  /**
   * Send OTP to the phone number from the invitation
   */
  async sendOtp(token: string, lang?: 'fr' | 'en') {
    const payload = this.verifyInviteToken(token)
    const key = `${payload.orgId}:${payload.phone}`

    const code = Math.floor(100000 + Math.random() * 900000).toString()

    this.otpStore.set(key, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    })

    const templateLang = lang === 'en' ? 'en' : 'fr'
    await this.sendWhatsAppOtp(payload.phone, code, templateLang)

    return {
      message: I18nContext.current()?.t('errors.invitation.otp_sent') ?? 'OTP envoyé avec succès',
    }
  }

  /**
   * Verify OTP code → set user VERIFIED → return user info + create auth session
   */
  async verifyOtp(token: string, code: string) {
    const payload = this.verifyInviteToken(token)
    const key = `${payload.orgId}:${payload.phone}`
    const stored = this.otpStore.get(key)

    if (!stored) {
      throw new BadRequestException(
        I18nContext.current()?.t('errors.invitation.no_pending_otp') ??
          'Aucun OTP en attente pour ce numéro',
      )
    }

    if (Date.now() > stored.expiresAt) {
      this.otpStore.delete(key)
      throw new BadRequestException(
        I18nContext.current()?.t('errors.invitation.otp_expired') ??
          'OTP expiré, veuillez en demander un nouveau',
      )
    }

    if (stored.code !== code) {
      throw new BadRequestException(
        I18nContext.current()?.t('errors.invitation.otp_invalid') ?? 'Code OTP invalide',
      )
    }

    this.otpStore.delete(key)

    // Set user as VERIFIED
    const user = await this.prisma.user.update({
      where: { phone: payload.phone },
      data: { status: 'VERIFIED' },
      select: { id: true, name: true, phone: true },
    })

    // Create auth session for this user
    const session = await this.authService.createSession(user.id)

    // Parse name into first/last
    const nameParts = user.name.split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    return {
      user: { id: user.id, firstName, lastName, phone: user.phone },
      session,
    }
  }

  /**
   * Accept an invitation (user is already verified and authenticated)
   */
  async acceptInvitation(userId: string, orgId: string, name?: string) {
    const member = await this.prisma.organisationMember.findFirst({
      where: { userId, organisationId: orgId, status: 'INVITED' },
    })

    if (!member) {
      throw new NotFoundException(
        I18nContext.current()?.t('errors.invitation.not_found') ?? 'Invitation introuvable',
      )
    }

    // Update name if provided
    if (name) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name },
      })
    }

    // Activate membership
    return this.prisma.organisationMember.update({
      where: { id: member.id },
      data: { status: 'ACTIVE' },
      include: {
        organisation: { select: { id: true, name: true, logoUrl: true } },
      },
    })
  }

  /**
   * Reject an invitation
   */
  async rejectInvitation(userId: string, orgId: string) {
    const member = await this.prisma.organisationMember.findFirst({
      where: { userId, organisationId: orgId, status: 'INVITED' },
    })

    if (!member) {
      throw new NotFoundException(
        I18nContext.current()?.t('errors.invitation.not_found') ?? 'Invitation introuvable',
      )
    }

    return this.prisma.organisationMember.delete({
      where: { id: member.id },
    })
  }

  private verifyInviteToken(token: string): { orgId: string; phone: string } {
    try {
      const payload = this.jwtService.verify(token)
      if (payload.type !== 'invitation') {
        throw new BadRequestException(
          I18nContext.current()?.t('errors.invitation.invalid_token') ?? 'Token invalide',
        )
      }
      return { orgId: payload.orgId, phone: payload.phone }
    } catch {
      throw new BadRequestException(
        I18nContext.current()?.t('errors.invitation.invalid_or_expired_link') ??
          "Lien d'invitation invalide ou expiré",
      )
    }
  }

  private async sendWhatsAppOtp(phone: string, code: string, lang: string = 'fr') {
    const phoneNumberId = this.config.get<string>('CORE_WHATSAPP_NUMBER_ID')
    const templateId = this.config.get<string>('TEMPLATE_INVITE_ID')
    const accessToken = this.config.get<string>('META_SYSTEM_USER')

    if (!phoneNumberId || !accessToken) {
      this.logger.warn('WhatsApp Cloud API not configured, OTP not sent')
      return
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace('+', ''),
          type: 'template',
          template: {
            name: templateId,
            language: { code: lang },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`WhatsApp OTP send failed: ${error}`)
      }
    } catch (error) {
      this.logger.error('Failed to send WhatsApp OTP', error)
    }
  }
}
