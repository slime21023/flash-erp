import type { ModuleManifest } from '@platform/addons/manifest.js'

export const salesManifest: ModuleManifest = {
  id: 'sales',
  name: '銷售管理與客戶信用 (Sales & Order-to-Cash)',
  version: '1.0.0',
  summary: '客戶主檔、動態信用管制、銷售訂單 SO、庫存預留、出庫履約與銷貨 AR/COGS 傳票',
  category: 'Supply Chain',
  author: 'FlashERP Core Team',
  dependsOn: ['inventory', 'finance'],
  installable: true,
  autoInstall: true,
  icon: 'BadgePercent',
}
