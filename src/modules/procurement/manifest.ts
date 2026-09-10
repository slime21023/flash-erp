import type { ModuleManifest } from '@platform/addons/manifest.js'

export const procurementManifest: ModuleManifest = {
  id: 'procurement',
  name: '採購管理與三向匹配 (Procurement & 3-Way Match)',
  version: '1.0.0',
  summary: '請購 PR、採購 PO、收貨 GR、廠商發票、容差三向匹配與應付帳款 (AP) 傳票',
  category: 'Supply Chain',
  author: 'FlashERP Core Team',
  dependsOn: ['inventory', 'finance'],
  installable: true,
  autoInstall: true,
  icon: 'ShoppingCart',
}
