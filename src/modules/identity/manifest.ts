import type { ModuleManifest } from '@platform/addons/manifest.js'

export const identityManifest: ModuleManifest = {
  id: 'identity',
  name: '身份認證與組織 RBAC (Identity & RBAC)',
  version: '1.0.0',
  summary: '本地帳號密碼雜湊認證、角色權限授權與組織權限作用域隔離',
  category: 'System',
  author: 'FlashERP Core Team',
  dependsOn: ['organization'],
  installable: true,
  autoInstall: true,
  icon: 'ShieldCheck',
}
