import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from './auth.service'
import { WhatsAppOtpService } from './whatsapp-otp.service'
import { AuthType, UserStatus } from '../../generated/prisma/client'

interface OtpEntry {
  code: string
  expiresAt: number
  countryCode: string
  phoneLocal: string
}

@Injectable()
export class WhatsAppLoginService {
  private readonly logger = new Logger(WhatsAppLoginService.name)
  private readonly otpStore = new Map<string, OtpEntry>()
  private readonly OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes
  private readonly RESEND_COOLDOWN_MS = 30 * 1000 // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly otpService: WhatsAppOtpService,
  ) {}

  /**
   * Send a WhatsApp OTP to the requested phone. The user does NOT need to
   * exist yet — they will be created on verifyOtp if needed.
   */
  async sendOtp(countryCode: string, phoneLocal: string, lang: 'fr' | 'en' = 'fr') {
    const { fullPhone, normalizedCountryCode, normalizedLocal } = this.normalizePhone(
      countryCode,
      phoneLocal,
    )

    const existing = this.otpStore.get(fullPhone)
    if (existing && Date.now() < existing.expiresAt - (this.OTP_TTL_MS - this.RESEND_COOLDOWN_MS)) {
      // Within cooldown window — reuse the same code rather than spamming WhatsApp.
      await this.otpService.sendOtp(fullPhone, existing.code, lang, 'TEMPLATE_LOGIN_ID')
      return { status: 'success' as const }
    }

    const code = this.otpService.generateCode()
    this.otpStore.set(fullPhone, {
      code,
      expiresAt: Date.now() + this.OTP_TTL_MS,
      countryCode: normalizedCountryCode,
      phoneLocal: normalizedLocal,
    })

    await this.otpService.sendOtp(fullPhone, code, lang, 'TEMPLATE_LOGIN_ID')

    return { status: 'success' as const }
  }

  /**
   * Verify the code → find-or-create the user → create an auth session.
   */
  async verifyOtp(countryCode: string, phoneLocal: string, code: string) {
    const { fullPhone, normalizedCountryCode, normalizedLocal } = this.normalizePhone(
      countryCode,
      phoneLocal,
    )

    const stored = this.otpStore.get(fullPhone)
    if (!stored) {
      throw new BadRequestException({
        code: 'OTP_NOT_FOUND',
        message:
          I18nContext.current()?.t('errors.invitation.no_pending_otp') ??
          'Aucun OTP en attente pour ce numéro',
      })
    }

    if (Date.now() > stored.expiresAt) {
      this.otpStore.delete(fullPhone)
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message:
          I18nContext.current()?.t('errors.invitation.otp_expired') ??
          'OTP expiré, veuillez en demander un nouveau',
      })
    }

    if (stored.code !== code) {
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: I18nContext.current()?.t('errors.invitation.otp_invalid') ?? 'Code OTP invalide',
      })
    }

    this.otpStore.delete(fullPhone)

    let user = await this.prisma.user.findUnique({ where: { phone: fullPhone } })

    let isNewUser = false
    if (!user) {
      // Auto-signup on first successful OTP — the user picks a name later
      // (we use the phone as a placeholder name so the required field is set).
      user = await this.prisma.user.create({
        data: {
          phone: fullPhone,
          phoneCountryCode: normalizedCountryCode,
          phoneLocal: normalizedLocal,
          name: fullPhone,
          authType: AuthType.WHATSAPP,
          status: UserStatus.VERIFIED,
        },
      })
      isNewUser = true
    } else if (!user.phoneCountryCode || !user.phoneLocal) {
      // Backfill split fields for an existing user that only had the combined phone.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneCountryCode: normalizedCountryCode,
          phoneLocal: normalizedLocal,
          status: UserStatus.VERIFIED,
        },
      })
    }

    const session = await this.authService.createSession(user.id)

    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        phoneCountryCode: user.phoneCountryCode,
        phoneLocal: user.phoneLocal,
      },
      isNewUser,
      session,
    }
  }

  private normalizePhone(countryCode: string, phoneLocal: string) {
    const cc = countryCode.trim()
    const normalizedCountryCode = cc.startsWith('+') ? cc : `+${cc}`
    const normalizedLocal = phoneLocal.replace(/[^0-9]/g, '')

    if (!/^\+\d{1,4}$/.test(normalizedCountryCode)) {
      throw new BadRequestException('Invalid country code')
    }
    if (normalizedLocal.length < 6 || normalizedLocal.length > 15) {
      throw new BadRequestException('Invalid phone number')
    }

    return {
      fullPhone: `${normalizedCountryCode}${normalizedLocal}`,
      normalizedCountryCode,
      normalizedLocal,
    }
  }
}
