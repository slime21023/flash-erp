import type { ModuleManifest } from '@platform/addons/manifest.js'

export const auditManifest: ModuleManifest = {
  id: 'audit',
  name: '不可變審計軌跡 (Audit Trail)',
  version: '1.0.0',
  summary: '基於領域事件監聽之全業務領域不可變操作日誌與變更稽核',
  category: 'System',
  author: 'FlashERP Core Team',
  dependsOn: ['identity'],
  installable: true,
  autoInstall: true,
  icon: 'History',
}
