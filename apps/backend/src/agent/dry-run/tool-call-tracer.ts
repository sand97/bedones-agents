import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { Serialized } from '@langchain/core/load/serializable'

import type { RecordedToolCall } from './extract-trace'

/**
 * Records tool calls (name + args + result) AS THEY HAPPEN, via LangChain
 * callbacks, instead of reading them off the final message list.
 *
 * Why: `buildAgentRunTrace` extracts the trace from `result.messages`, which only
 * exist when the run RETURNS. When the run THROWS (e.g. the LangGraph recursion
 * limit), those messages are lost and the debug tool had no tool trace to show —
 * exactly the case you most need it. Callbacks fire during execution, so this
 * captures the trace even on a failed run.
 */
export class ToolCallTracer extends BaseCallbackHandler {
  name = 'debug-tool-call-tracer'
  readonly calls: RecordedToolCall[] = []
  private order = 0
  private readonly byRunId = new Map<string, RecordedToolCall>()

  handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
  ): void {
    const rec: RecordedToolCall = {
      order: this.order++,
      id: runId,
      name: runName || serializedName(tool) || 'unknown_tool',
      args: parseInput(input),
    }
    this.calls.push(rec)
    this.byRunId.set(runId, rec)
  }

  handleToolEnd(output: unknown, runId: string): void {
    const rec = this.byRunId.get(runId)
    if (rec) rec.result = stringifyOutput(output)
  }

  handleToolError(err: unknown, runId: string): void {
    const rec = this.byRunId.get(runId)
    if (rec) rec.result = `ERROR: ${err instanceof Error ? err.message : String(err)}`
  }
}

function serializedName(tool: Serialized | undefined): string | undefined {
  const asRecord = tool as unknown as { name?: string; id?: unknown }
  if (typeof asRecord?.name === 'string') return asRecord.name
  if (Array.isArray(asRecord?.id) && asRecord.id.length > 0) {
    const last = asRecord.id[asRecord.id.length - 1]
    if (typeof last === 'string') return last
  }
  return undefined
}

/** Tool input arrives as a string — JSON when structured, raw text otherwise. */
function parseInput(input: string): unknown {
  if (typeof input !== 'string') return input
  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

/** Tool output may be a string or a ToolMessage-like object carrying `content`. */
function stringifyOutput(output: unknown): string {
  if (output == null) return ''
  if (typeof output === 'string') return output
  const content = (output as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (content != null) return JSON.stringify(content)
  return JSON.stringify(output)
}
