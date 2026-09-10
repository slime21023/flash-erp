import type { ModuleManifest } from '@platform/addons/manifest.js'

export const financeManifest: ModuleManifest = {
  id: 'finance',
  name: '財務會計總帳 (Finance & General Ledger)',
  version: '1.0.0',
  summary: '會計科目表、會計期間、傳票草稿與過帳、複式簿記平衡與即時試算表',
  category: 'Financials',
  author: 'FlashERP Core Team',
  dependsOn: ['organization'],
  installable: true,
  autoInstall: true,
  icon: 'BookOpen',
}
