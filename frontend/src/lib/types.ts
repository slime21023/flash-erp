import type { Api } from './api.js'

export type ModuleManifest = Awaited<ReturnType<Api['system']['getModules']>>['modules'][number]

export type ActiveAppId =
  | 'dashboard'
  | 'sales'
  | 'procurement'
  | 'inventory'
  | 'manufacturing'
  | 'finance'
  | 'treasury'
  | 'organization'
