import { DomainError } from '@platform/fp/domain_error.js'
import { err, ok } from '@platform/fp/result.js'
import type { Result } from '@platform/fp/result.js'

export class PluginExecutionError extends DomainError {
  readonly code = 'PLUGIN_EXECUTION_ERROR'

  constructor(
    public readonly hookPoint: string,
    public readonly details: string
  ) {
    super(`Plugin failed at hook '${hookPoint}': ${details}`)
  }
}

export type HookHandler<TContext, TResult = void> = (
  context: TContext
) => Promise<Result<TResult, DomainError>>

export class LifecycleHooksEngine {
  private readonly hooks = new Map<string, HookHandler<any, any>[]>()

  register<TContext, TResult = void>(
    hookPoint: string,
    handler: HookHandler<TContext, TResult>
  ): void {
    const list = this.hooks.get(hookPoint) ?? []
    list.push(handler)
    this.hooks.set(hookPoint, list)
  }

  async execute<TContext>(
    hookPoint: string,
    context: TContext
  ): Promise<Result<void, DomainError>> {
    const list = this.hooks.get(hookPoint) ?? []
    for (const handler of list) {
      try {
        const res = await handler(context)
        if (res.isErr) {
          return res
        }
      } catch (error: any) {
        return err(
          new PluginExecutionError(
            hookPoint,
            error instanceof Error ? error.message : String(error)
          )
        )
      }
    }
    return ok(undefined)
  }

  clear(): void {
    this.hooks.clear()
  }
}
