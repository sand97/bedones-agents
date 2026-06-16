// Configuration for the WhatsApp daily opt-in flow.
//
// All notifications are sent from the central Bedones WhatsApp number using
// the existing system-user token (same flow as invitation OTPs):
//   CORE_WHATSAPP_NUMBER_ID    Phone Number ID (Cloud API).
//   META_SYSTEM_USER           Permanent system-user access token (raw).
//
// Opt-in specific env (all optional):
//   WHATSAPP_OPTIN_TEMPLATE_NAME    Approved Meta template name with body
//                                   variables `firstname` + `company` and a
//                                   Quick Reply Yes/No button. Default:
//                                   "accept_notification".
//   WHATSAPP_OPTIN_TICK_CRON        Cron expression for the hourly tick that
//                                   scans organisations whose local time has
//                                   just hit the opt-in send hour. Default:
//                                   "0 * * * *" (every hour at :00).
//   WHATSAPP_OPTIN_LOCAL_HOUR       Local hour-of-day (0-23) at which each
//                                   org's members get their daily template.
//                                   Default: 8 (08:00 in the org's timezone).
//
// Per-organisation timezone lives on `Organisation.timezone` (IANA tag).
// Per-user language lives on `User.locale` ("fr" | "en"); the template name
// is shared, only `language.code` differs at send time.

export const OPTIN_WINDOW_MS = 24 * 60 * 60 * 1000

export const optinConfig = () => ({
  corePhoneNumberId: process.env.CORE_WHATSAPP_NUMBER_ID ?? '',
  coreAccessToken: process.env.META_SYSTEM_USER ?? '',
  templateName: process.env.WHATSAPP_OPTIN_TEMPLATE_NAME ?? 'accept_notification',
  tickCron: process.env.WHATSAPP_OPTIN_TICK_CRON ?? '0 * * * *',
  localHour: Number(process.env.WHATSAPP_OPTIN_LOCAL_HOUR ?? '8'),
  // Frontend base URL for the deep link in the "window opened" confirmation
  // message (CTA button → the member's notification settings modal).
  frontendUrl: (process.env.FRONTEND_URL ?? 'https://moderator.bedones.com').replace(/\/$/, ''),
})

export type OptinJobName = 'tick-hourly' | 'send-template'

/** What caused an opt-in template to be sent — surfaced as a PostHog property. */
export type OptinTrigger = 'cron' | 'dashboard'

export interface SendTemplateJobData {
  userId: string
  organisationId: string
  trigger?: OptinTrigger
}

/**
 * Returns the current hour (0-23) in the given IANA timezone.
 * Uses Intl.DateTimeFormat to avoid pulling in a tz library.
 */
export function hourInTz(tz: string, now: Date = new Date()): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: tz,
    })
    return Number(fmt.format(now))
  } catch {
    // Invalid TZ string — fall back to UTC so we don't crash the cron.
    return now.getUTCHours()
  }
}
