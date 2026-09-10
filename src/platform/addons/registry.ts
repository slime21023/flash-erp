import { DomainError } from '@platform/fp/domain_error.js'
import { err, ok } from '@platform/fp/result.js'
import type { Result } from '@platform/fp/result.js'
import type { ModuleManifest } from './manifest.js'

export class MissingModuleDependencyError extends DomainError {
  readonly code = 'MISSING_MODULE_DEPENDENCY'

  constructor(
    public readonly moduleId: string,
    public readonly missingDependency: string
  ) {
    super(`Module '${moduleId}' depends on '${missingDependency}', which is not registered.`)
  }
}

export class CircularModuleDependencyError extends DomainError {
  readonly code = 'CIRCULAR_MODULE_DEPENDENCY'

  constructor(public readonly cyclePath: readonly string[]) {
    super(`Circular module dependency detected: ${(cyclePath ?? []).join(' -> ')}`)
  }
}

export class AddonRegistry {
  private readonly manifests = new Map<string, ModuleManifest>()

  register(manifest: ModuleManifest): void {
    this.manifests.set(manifest.id, manifest)
  }

  getManifest(id: string): ModuleManifest | undefined {
    return this.manifests.get(id)
  }

  getAllManifests(): readonly ModuleManifest[] {
    return Array.from(this.manifests.values())
  }

  resolveDependencies(): Result<
    readonly ModuleManifest[],
    MissingModuleDependencyError | CircularModuleDependencyError
  > {
    const all = this.getAllManifests()

    for (const m of all) {
      for (const dep of m.dependsOn) {
        if (!this.manifests.has(dep)) {
          return err(new MissingModuleDependencyError(m.id, dep))
        }
      }
    }

    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    for (const m of all) {
      inDegree.set(m.id, 0)
      adj.set(m.id, [])
    }

    for (const m of all) {
      for (const dep of m.dependsOn) {
        adj.get(dep)!.push(m.id)
        inDegree.set(m.id, (inDegree.get(m.id) ?? 0) + 1)
      }
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id)
      }
    }

    const sortedOrder: ModuleManifest[] = []

    while (queue.length > 0) {
      const u = queue.shift()!
      sortedOrder.push(this.manifests.get(u)!)

      for (const v of adj.get(u) ?? []) {
        const newDeg = (inDegree.get(v) ?? 1) - 1
        inDegree.set(v, newDeg)
        if (newDeg === 0) {
          queue.push(v)
        }
      }
    }

    if (sortedOrder.length < all.length) {
      const unvisited = all.filter((m) => !sortedOrder.some((s) => s.id === m.id)).map((m) => m.id)
      return err(new CircularModuleDependencyError(unvisited))
    }

    return ok(sortedOrder)
  }
}
