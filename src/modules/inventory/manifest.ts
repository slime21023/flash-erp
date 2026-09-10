import type { ModuleManifest } from '@platform/addons/manifest.js'

export const inventoryManifest: ModuleManifest = {
  id: 'inventory',
  name: '倉儲與庫存管理 (Inventory & ATP)',
  version: '1.0.0',
  summary: '料品主檔、倉儲庫位、庫存移動、移動加權平均成本、預留與可用量 (ATP)',
  category: 'Supply Chain',
  author: 'FlashERP Core Team',
  dependsOn: ['organization'],
  installable: true,
  autoInstall: true,
  icon: 'Boxes',
}
