/**
 * Structured logger for server-side operations.
 * Creates scoped loggers with consistent formatting and timing.
 */

interface LogContext {
  [key: string]: unknown
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatContext(ctx: LogContext): string {
  const parts = Object.entries(ctx)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (typeof v === 'string') return `${k}=${v}`
      return `${k}=${JSON.stringify(v)}`
    })
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

function timestamp(): string {
  return new Date().toISOString()
}

export function createLogger(scope: string) {
  const prefix = `[${scope}]`

  return {
    info(message: string, ctx: LogContext = {}) {
      console.log(`${timestamp()} ${prefix} ${message}${formatContext(ctx)}`)
    },

    warn(message: string, ctx: LogContext = {}) {
      console.warn(`${timestamp()} ${prefix} ${message}${formatContext(ctx)}`)
    },

    error(message: string, error?: unknown, ctx: LogContext = {}) {
      const errMsg = error instanceof Error ? error.message : String(error || '')
      const extra = errMsg ? ` error="${errMsg}"` : ''
      console.error(`${timestamp()} ${prefix} ${message}${extra}${formatContext(ctx)}`)
      if (error instanceof Error && error.stack) {
        console.error(error.stack)
      }
    },

    /** Start a timed operation. Call the returned function to log completion. */
    time(operation: string, ctx: LogContext = {}): (resultCtx?: LogContext) => void {
      const start = Date.now()
      console.log(`${timestamp()} ${prefix} ${operation} started${formatContext(ctx)}`)
      return (resultCtx: LogContext = {}) => {
        const duration = Date.now() - start
        console.log(`${timestamp()} ${prefix} ${operation} completed duration=${formatDuration(duration)}${formatContext({ ...ctx, ...resultCtx })}`)
      }
    },

    /** Start a timed operation that may fail. Returns done() and fail() callbacks. */
    timedOp(operation: string, ctx: LogContext = {}) {
      const start = Date.now()
      console.log(`${timestamp()} ${prefix} ${operation} started${formatContext(ctx)}`)
      return {
        done(resultCtx: LogContext = {}) {
          const duration = Date.now() - start
          console.log(`${timestamp()} ${prefix} ${operation} completed duration=${formatDuration(duration)}${formatContext({ ...ctx, ...resultCtx })}`)
        },
        fail(error: unknown, resultCtx: LogContext = {}) {
          const duration = Date.now() - start
          const errMsg = error instanceof Error ? error.message : String(error)
          console.error(`${timestamp()} ${prefix} ${operation} failed duration=${formatDuration(duration)} error="${errMsg}"${formatContext({ ...ctx, ...resultCtx })}`)
        }
      }
    }
  }
}
