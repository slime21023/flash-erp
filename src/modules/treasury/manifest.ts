import type { ModuleManifest } from '@platform/addons/manifest.js'

export const treasuryManifest: ModuleManifest = {
  id: 'treasury',
  name: '出納資金與銀行對帳 (Treasury & Cash Management)',
  version: '1.0.0',
  summary: '銀行帳戶管理、收付款憑單、單據沖銷、銀行對帳單導入、規則對帳與調節表',
  category: 'Financials',
  author: 'FlashERP Core Team',
  dependsOn: ['finance'],
  installable: true,
  autoInstall: true,
  icon: 'Landmark',
}
