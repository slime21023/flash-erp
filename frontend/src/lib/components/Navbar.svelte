<script lang="ts">
  import { Grid3X3, LogOut } from 'lucide-svelte'
  import type { AuthenticatedUser } from '../api.js'
  import type { ActiveAppId } from '../types.js'

  interface Props {
    activeApp: ActiveAppId
    onToggleSwitcher: () => void
    isSwitcherOpen: boolean
    user: AuthenticatedUser
    onLogout: () => void
  }

  let { activeApp, onToggleSwitcher, isSwitcherOpen, user, onLogout }: Props = $props()

  const appTitles: Record<ActiveAppId, { title: string; subtitle: string }> = {
    dashboard: { title: '系統總覽與模組中心', subtitle: 'App Store & Dependency Topology' },
    sales: { title: '銷售管理 (Sales)', subtitle: 'Order-to-Cash & Credit Control' },
    procurement: { title: '採購管理 (Procurement)', subtitle: 'Procure-to-Pay & 3-Way Match' },
    inventory: { title: '庫存管理 (Inventory)', subtitle: 'Stock Watermark & ATP Tracking' },
    manufacturing: { title: '生產製造 (Manufacturing)', subtitle: 'BOM Explosion & Costing PP/CO' },
    treasury: { title: '出納資金 (Treasury)', subtitle: 'Vouchers & Bank Reconciliation' },
    finance: { title: '財務總帳 (Finance)', subtitle: 'Double-entry GL & Trial Balance' },
    organization: { title: '組織架構 (Organization)', subtitle: 'Multi-company Tree Hierarchy' },
  }
</script>

<nav class="navbar erp-navbar" aria-label="主要導覽">
  <div class="container is-fluid">
    <div class="navbar-brand">
      <button
        onclick={onToggleSwitcher}
        class="navbar-item button is-white"
        title="切換應用程式"
        aria-label="切換應用程式"
        aria-haspopup="dialog"
        aria-expanded={isSwitcherOpen}
      >
        <Grid3X3 size={18} strokeWidth={1.8} />
      </button>
      <div class="navbar-item">
        <span class="erp-brand">FlashERP</span>
        <span class="mx-2 has-text-grey-light">/</span>
        <span class="has-text-weight-semibold">{appTitles[activeApp]?.title ?? activeApp}</span>
      </div>
    </div>

    <div class="navbar-menu is-active">
      <div class="navbar-start">
        <div class="navbar-item is-hidden-touch has-text-grey">
          {appTitles[activeApp]?.subtitle}
        </div>
      </div>

      <div class="navbar-end">
        <div class="navbar-item is-hidden-mobile">
          <span class="tag is-success is-light">Apache-2.0 Open Source</span>
        </div>
        <div class="navbar-item">
          <span class="erp-user-avatar mr-2">{user.displayName.slice(0, 1).toUpperCase()}</span>
          <span class="is-hidden-mobile mr-3">
            <strong>{user.username}</strong>
            <small class="is-block has-text-grey">{user.displayName}</small>
          </span>
          <button onclick={onLogout} class="button is-light is-small" title="登出">
            <span class="icon"><LogOut size={15} strokeWidth={1.8} /></span>
            <span>登出</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</nav>
