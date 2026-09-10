export interface ModuleManifest {
  id: string
  name: string
  version: string
  summary: string
  category: string
  author: string
  dependsOn: string[]
  installable: boolean
  autoInstall: boolean
  icon?: string
}

export type ActiveAppId =
  | 'dashboard'
  | 'sales'
  | 'procurement'
  | 'inventory'
  | 'manufacturing'
  | 'finance'
  | 'treasury'
  | 'organization'
