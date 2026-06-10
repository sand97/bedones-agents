import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { I18nContext } from 'nestjs-i18n'

/**
 * Shared service to send a 6-digit OTP via the Meta WhatsApp Cloud API.
 * Used both by the invitation flow and the WhatsApp-based login flow.
 */
@Injectable()
export class WhatsAppOtpService {
  private readonly logger = new Logger(WhatsAppOtpService.name)

  constructor(private readonly config: ConfigService) {}

  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  /**
   * Send a verification code to a phone number using a WhatsApp template.
   * `templateEnvKey` selects which template id env var to use — defaults to
   * the invitation template, but the login flow passes `TEMPLATE_LOGIN_ID`.
   */
  async sendOtp(
    phone: string,
    code: string,
    lang: 'fr' | 'en' = 'fr',
    templateEnvKey: 'TEMPLATE_INVITE_ID' | 'TEMPLATE_LOGIN_ID' = 'TEMPLATE_INVITE_ID',
  ): Promise<void> {
    const phoneNumberId = this.config.get<string>('CORE_WHATSAPP_NUMBER_ID')
    const accessToken = this.config.get<string>('META_SYSTEM_USER')
    const templateId =
      this.config.get<string>(templateEnvKey) ?? this.config.get<string>('TEMPLATE_INVITE_ID')

    if (!phoneNumberId || !accessToken || !templateId) {
      this.logger.warn(
        `WhatsApp Cloud API not configured (template: ${templateEnvKey}), OTP not sent`,
      )
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
        throw new ServiceUnavailableException(this.genericSendError())
      }
    } catch (error) {
      // Re-throw the generic error we already built; wrap anything else (network, etc.)
      if (error instanceof ServiceUnavailableException) {
        throw error
      }
      this.logger.error('Failed to send WhatsApp OTP', error)
      throw new ServiceUnavailableException(this.genericSendError())
    }
  }

  /** Generic, non-revealing message shown to the user when the OTP can't be sent. */
  private genericSendError(): string {
    return (
      I18nContext.current()?.t('errors.invitation.otp_send_failed') ??
      "Impossible d'envoyer le code de vérification pour le moment. Veuillez réessayer plus tard."
    )
  }
}
