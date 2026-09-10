export type ModuleCategory = 'Operations' | 'Supply Chain' | 'Financials' | 'System'

export interface ModuleManifest {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly summary: string
  readonly category: ModuleCategory
  readonly author: string
  readonly dependsOn: readonly string[]
  readonly installable: boolean
  readonly autoInstall: boolean
  readonly icon?: string
}
