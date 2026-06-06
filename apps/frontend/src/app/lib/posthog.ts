import type { PostHogConfig } from 'posthog-js'

/**
 * PostHog browser configuration.
 *
 * The project key is a PUBLIC key (safe to ship in the bundle) — it can only
 * write events, never read data. Analytics is simply disabled when the key is
 * absent, so local dev works without it.
 */
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
export const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

export const posthogOptions: Partial<PostHogConfig> = {
  api_host: POSTHOG_HOST,
  ui_host: 'https://us.posthog.com',
  // Modern defaults: exception autocapture, dead clicks, heatmaps, etc.
  defaults: '2025-05-24',
  // We capture $pageview manually on TanStack Router navigations (SPA), so the
  // history-based auto pageview is turned off to avoid double counting.
  capture_pageview: false,
  capture_pageleave: true,
  // Session replay. This is a CRM handling customer data, so inputs are masked
  // by default. Add `data-ph-mask` on any element whose text must also be hidden,
  // or `ph-no-capture` to block a whole subtree from recordings.
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: '[data-ph-mask]',
  },
}
