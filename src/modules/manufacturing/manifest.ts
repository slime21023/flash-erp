import type { ModuleManifest } from '@platform/addons/manifest.js'

export const manufacturingManifest: ModuleManifest = {
  id: 'manufacturing',
  name: '生產製造與成本分攤 (Manufacturing & Costing - PP/CO)',
  version: '1.0.0',
  summary: 'BOM 物料清單、防循環驗證、工單展算、領料發料在製品 (WIP) 結轉與月末製費零尾差分攤',
  category: 'Operations',
  author: 'FlashERP Core Team',
  dependsOn: ['inventory', 'finance'],
  installable: true,
  autoInstall: true,
  icon: 'Cog',
}
