import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { $api } from '@app/lib/api/$api'
import {
  setAuthRedirect,
  buildFacebookOAuthUrl,
  buildInstagramOAuthUrl,
  buildTikTokOAuthUrl,
} from '@app/lib/auth-redirect'
import { launchWhatsAppSignup } from '@app/lib/facebook-sdk'

/**
 * Channel connect flow for the chats page (WhatsApp embedded signup, Meta /
 * Instagram / TikTok OAuth redirects). Extracted verbatim from the chats/$id
 * route.
 */
export function useChatConnect({ id, orgSlug }: { id: string; orgSlug: string }) {
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)

  // ─── WhatsApp connect mutation ───
  const connectWhatsAppMutation = $api.useMutation('post', '/social/connect/whatsapp')

  const handleConnect = async () => {
    setConnecting(true)

    if (id === 'whatsapp') {
      try {
        const appId = import.meta.env.VITE_FACEBOOK_APP_ID
        const waConfigId = import.meta.env.VITE_WHATSAPP_CONFIGGURATION_ID
        if (!appId || !waConfigId) {
          setConnecting(false)
          return
        }

        const { loginResponse, sessionInfo } = await launchWhatsAppSignup(appId, waConfigId)
        if (!loginResponse.authResponse?.code) {
          setConnecting(false)
          return
        }

        await connectWhatsAppMutation.mutateAsync({
          body: {
            organisationId: orgSlug,
            code: loginResponse.authResponse.code,
            wabaId: sessionInfo.waba_id,
            phoneNumberId: sessionInfo.phone_number_id,
          },
        })

        // Refresh accounts list
        queryClient.invalidateQueries({
          queryKey: ['get', '/social/accounts/{organisationId}'],
        })
      } catch (err) {
        console.error('[WhatsApp] Connect failed:', err)
      } finally {
        setConnecting(false)
      }
      return
    }

    if (id === 'messenger') {
      setAuthRedirect({
        intent: 'connect_pages',
        orgId: orgSlug,
        provider: 'facebook',
        pageId: 'messenger',
        scopes: ['messages'],
      })
      const configId = import.meta.env.VITE_FB_MESSAGES_CONFIGGURATION_ID
      if (!configId) {
        setConnecting(false)
        return
      }
      window.location.href = buildFacebookOAuthUrl(configId)
    } else if (id === 'instagram-dm') {
      setAuthRedirect({
        intent: 'connect_pages',
        orgId: orgSlug,
        provider: 'instagram',
        igScope: 'messages',
        pageId: 'instagram-dm',
        scopes: ['messages'],
      })
      window.location.href = buildInstagramOAuthUrl('messages')
    } else if (id === 'tiktok') {
      setAuthRedirect({
        intent: 'connect_pages',
        orgId: orgSlug,
        provider: 'tiktok',
        pageId: 'tiktok',
        scopes: ['messages', 'message.list.read', 'message.list.send', 'message.list.manage'],
      })
      window.location.href = buildTikTokOAuthUrl('messages')
    }
  }

  return { connecting, handleConnect }
}
