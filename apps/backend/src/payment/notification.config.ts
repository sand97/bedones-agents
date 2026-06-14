// Configuration des notifications WhatsApp liées à la souscription.
//
// Les messages partent du numéro CORE Bedones (comme les OTP / l'opt-in
// quotidien), via le token system-user — voir whatsapp-optin.config.ts :
//   CORE_WHATSAPP_NUMBER_ID  Phone Number ID (Cloud API).
//   META_SYSTEM_USER         Token system-user permanent.
//
// Templates Meta (déjà approuvés/traduits) — surchargeables par env :
//   WHATSAPP_TPL_PAYMENT_DUE     Rappel d'échéance (mobile money). Corps:
//                                {{firstname}}, {{ref}}, {{amount}}, {{date}}
//                                + bouton URL dynamique → page Souscriptions.
//                                Défaut: "payment_due_reminder".
//   WHATSAPP_TPL_PAYMENT_FAILED  Fin d'abonnement pour échec de paiement. Corps:
//                                {{firstname}}, {{ref}} + bouton URL dynamique.
//                                Défaut: "payment_failed_4".
//   WHATSAPP_TPL_CHURN_SURVEY    Enquête de départ (WhatsApp Flow). Corps:
//                                {{label}} + bouton Flow. Défaut:
//                                "feedback_survey_form_1".
//   WHATSAPP_TPL_LANG            Code langue des templates. Défaut: "fr".
//   PAYMENT_REMINDER_DAYS_BEFORE Jours avant échéance pour le rappel mobile.
//                                Défaut: 3.

export const notificationConfig = () => ({
  corePhoneNumberId: process.env.CORE_WHATSAPP_NUMBER_ID ?? '',
  coreAccessToken: process.env.META_SYSTEM_USER ?? '',
  tplPaymentDue: process.env.WHATSAPP_TPL_PAYMENT_DUE ?? 'payment_due_reminder',
  tplPaymentFailed: process.env.WHATSAPP_TPL_PAYMENT_FAILED ?? 'payment_failed_4',
  tplChurnSurvey: process.env.WHATSAPP_TPL_CHURN_SURVEY ?? 'feedback_survey_form_1',
  templateLang: process.env.WHATSAPP_TPL_LANG ?? 'fr',
  reminderDaysBefore: Number(process.env.PAYMENT_REMINDER_DAYS_BEFORE ?? '3'),
  frontendUrl: (process.env.FRONTEND_URL ?? 'https://moderator.bedones.local').replace(/\/$/, ''),
})

/** Préfixe du flow_token d'enquête de départ : encode l'org pour la corrélation. */
export const CHURN_FLOW_TOKEN_PREFIX = 'churn:'

export function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  return n.split(/\s+/)[0] || 'client'
}
