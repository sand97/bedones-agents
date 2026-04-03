declare global {
  interface Window {
    fbAsyncInit: () => void
    FB: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void
    }
  }
}

export interface FacebookLoginResponse {
  authResponse?: {
    code: string
    userID: string
    expiresIn: number
    signedRequest: string
  }
  status: 'connected' | 'not_authorized' | 'unknown'
}

export interface WhatsAppSessionInfo {
  waba_id?: string
  phone_number_id?: string
  current_step?: string
}

function ensureSDKScript(): Promise<void> {
  if (typeof window.FB !== 'undefined') return Promise.resolve()

  return new Promise<void>((resolve) => {
    const prev = window.fbAsyncInit
    window.fbAsyncInit = () => {
      prev?.()
      resolve()
    }

    if (!document.getElementById('facebook-jssdk')) {
      const js = document.createElement('script')
      js.id = 'facebook-jssdk'
      js.src = 'https://connect.facebook.net/en_US/sdk.js'
      js.async = true
      js.defer = true
      document.body.appendChild(js)
    }
  })
}

/**
 * Launches the WhatsApp Embedded Signup flow.
 * Follows the official Meta documentation:
 * 1. Sets up a MessageEvent listener for session info (WABA ID, phone number ID)
 * 2. Calls FB.init() then FB.login() with the correct extras
 */
export async function launchWhatsAppSignup(
  appId: string,
  configId: string,
): Promise<{
  loginResponse: FacebookLoginResponse
  sessionInfo: WhatsAppSessionInfo
}> {
  await ensureSDKScript()

  window.FB.init({
    appId,
    cookie: true,
    xfbml: true,
    version: 'v22.0',
  })

  return new Promise((resolve) => {
    let sessionInfo: WhatsAppSessionInfo = {}

    // Step 1: Listen for MessageEvent to capture session info (WABA ID, phone number ID)
    const messageHandler = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return
      }

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data

        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            sessionInfo = {
              waba_id: data.data?.waba_id,
              phone_number_id: data.data?.phone_number_id,
            }
          } else if (data.event === 'CANCEL') {
            sessionInfo = { current_step: data.data?.current_step }
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    }

    window.addEventListener('message', messageHandler)

    // Step 2: Launch FB.login with official extras
    window.FB.login(
      function (response: FacebookLoginResponse) {
        window.removeEventListener('message', messageHandler)
        resolve({ loginResponse: response, sessionInfo })
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          version: 'v3',
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
        },
      },
    )
  })
}
