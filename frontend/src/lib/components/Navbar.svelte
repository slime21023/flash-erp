<script lang="ts">
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

<header class="bg-slate-900 text-white h-14 px-4 flex items-center justify-between shadow-md border-b border-slate-800 select-none">
  <div class="flex items-center space-x-3">
    <!-- Odoo Style 9-dot Grid App Switcher Button -->
    <button
      onclick={onToggleSwitcher}
      class="p-2 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white transition flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
      title="切換應用程式 (App Switcher)"
      aria-label="App Switcher"
    >
      <div class="grid grid-cols-3 gap-1 w-5 h-5">
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
        <span class="w-1.5 h-1.5 rounded-full {isSwitcherOpen ? 'bg-indigo-400' : 'bg-slate-300'}"></span>
      </div>
    </button>

    <!-- Brand & Active App Title -->
    <div class="flex items-center space-x-2">
      <span class="font-extrabold text-base tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
        FlashERP
      </span>
      <span class="text-slate-600">/</span>
      <span class="font-semibold text-sm text-slate-100">
        {appTitles[activeApp]?.title ?? activeApp}
      </span>
      <span class="hidden md:inline-block text-xs text-slate-400">
        ({appTitles[activeApp]?.subtitle})
      </span>
    </div>
  </div>

  <!-- Right Meta info -->
  <div class="flex items-center space-x-3 text-xs">
    <span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
      Apache-2.0 Open Source
    </span>
    <div class="flex items-center space-x-2 pl-2 border-l border-slate-700">
      <div class="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
        {user.displayName.slice(0, 1).toUpperCase()}
      </div>
      <div class="hidden sm:block text-left leading-tight">
        <p class="font-medium text-slate-200">{user.username}</p>
        <p class="text-[10px] text-slate-400">{user.displayName}</p>
      </div>
      <button
        onclick={onLogout}
        class="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition"
        title="登出"
        aria-label="登出"
      >
        登出
      </button>
    </div>
  </div>
</header>
