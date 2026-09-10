import type { ModuleManifest } from '@platform/addons/manifest.js'

export const organizationManifest: ModuleManifest = {
  id: 'organization',
  name: '企業組織架構 (Organization)',
  version: '1.0.0',
  summary: '支援多公司、多廠區、多倉儲組織樹狀管理與所有權隔離',
  category: 'System',
  author: 'FlashERP Core Team',
  dependsOn: [],
  installable: true,
  autoInstall: true,
  icon: 'Building2',
}
