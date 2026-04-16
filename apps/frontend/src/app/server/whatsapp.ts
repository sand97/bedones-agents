// Server-only module — Node.js APIs available at runtime via TanStack Start SSR
declare const process: { cwd(): string; env: Record<string, string | undefined> }

import { createServerFn } from '@tanstack/react-start'
// @ts-expect-error — Server-only Node.js module
import { readFileSync } from 'node:fs'
// @ts-expect-error — Server-only Node.js module
import { resolve } from 'node:path'

function loadEnv(): Record<string, string> {
  const envVars: Record<string, string> = {}
  try {
    const possiblePaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]
    for (const p of possiblePaths) {
      try {
        const content = readFileSync(p, 'utf-8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx === -1) continue
          envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
        }
        break
      } catch {
        // try next path
      }
    }
  } catch {
    // ignore
  }
  return envVars
}

const env = loadEnv()
const FB_APP_ID = process.env.VITE_FACEBOOK_APP_ID || env.VITE_FACEBOOK_APP_ID || ''
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || env.FACEBOOK_APP_SECRET || ''

export const exchangeWhatsAppCode = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string; wabaId?: string; phoneNumberId?: string }) => data)
  .handler(async ({ data }) => {
    const { code, wabaId: clientWabaId, phoneNumberId: clientPhoneId } = data

    try {
      // 1. Exchange the code for a user access token (POST JSON as per Meta docs)
      const tokenResponse = await fetch('https://graph.facebook.com/v22.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: FB_APP_ID,
          client_secret: FB_APP_SECRET,
          grant_type: 'authorization_code',
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const err = await tokenResponse.json()
        console.error('[WhatsApp] Token exchange failed:', err)
        return {
          success: false as const,
          error: `Échec de l'échange du token : ${err.error?.message || 'erreur inconnue'}`,
        }
      }

      const tokenData = await tokenResponse.json()
      const accessToken = tokenData.access_token as string

      console.log('[WhatsApp] Token exchange successful')

      // Use WABA ID and phone ID from the embedded signup session info
      let wabaId = clientWabaId
      let phoneId = clientPhoneId

      // 2. Fallback: fetch from debug_token if not provided by session info
      if (!wabaId) {
        const debugResponse = await fetch(
          `https://graph.facebook.com/v22.0/debug_token?` +
            new URLSearchParams({
              input_token: accessToken,
              access_token: `${FB_APP_ID}|${FB_APP_SECRET}`,
            }),
        )

        if (debugResponse.ok) {
          const debugData = await debugResponse.json()
          const sharedInfo = debugData.data?.granular_scopes?.find(
            (s: { scope: string }) => s.scope === 'whatsapp_business_management',
          )

          if (sharedInfo?.target_ids?.length) {
            wabaId = sharedInfo.target_ids[0]
          }

          if (!phoneId) {
            const messagingScope = debugData.data?.granular_scopes?.find(
              (s: { scope: string }) => s.scope === 'whatsapp_business_messaging',
            )
            if (messagingScope?.target_ids?.length) {
              phoneId = messagingScope.target_ids[0]
            }
          }
        }
      }

      // 3. Subscribe the app to the WABA
      if (wabaId) {
        const subscribeResponse = await fetch(
          `https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        )

        if (subscribeResponse.ok) {
          console.log(`[WhatsApp] Subscribed app to WABA ${wabaId}`)
        } else {
          const subErr = await subscribeResponse.json()
          console.error('[WhatsApp] Subscription failed:', subErr)
        }
      }

      // 4. Fetch phone numbers if not provided
      if (wabaId && !phoneId) {
        const phonesResponse = await fetch(
          `https://graph.facebook.com/v22.0/${wabaId}/phone_numbers`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        )

        if (phonesResponse.ok) {
          const phonesData = await phonesResponse.json()
          if (phonesData.data?.length) {
            phoneId = phonesData.data[0].id
          }
        }
      }

      console.log('[WhatsApp] Setup complete:', { wabaId, phoneId })

      return {
        success: true as const,
        accessToken,
        wabaId,
        phoneId,
      }
    } catch (err) {
      console.error('[WhatsApp] Unexpected error:', err)
      return {
        success: false as const,
        error: err instanceof Error ? err.message : 'Erreur serveur inattendue',
      }
    }
  })
