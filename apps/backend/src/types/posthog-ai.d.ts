/**
 * Ambient type declaration for the `@posthog/ai/langchain` subpath.
 *
 * The package only exposes this entry point through the `exports` map, which the
 * backend's `moduleResolution: node` (node10) does not read. At runtime Node
 * resolves the subpath correctly (and loads only LangChain + posthog-node,
 * avoiding the heavy optional AI SDKs that the package root pulls in), so we
 * just need TypeScript to know the handler's shape.
 */
declare module '@posthog/ai/langchain' {
  import type { PostHog } from 'posthog-node'
  import { BaseCallbackHandler } from '@langchain/core/callbacks/base'

  export class LangChainCallbackHandler extends BaseCallbackHandler {
    constructor(options: {
      client: PostHog
      distinctId?: string | number
      traceId?: string | number
      properties?: Record<string, unknown>
      privacyMode?: boolean
      groups?: Record<string, unknown>
      debug?: boolean
    })
  }
}
