<script lang="ts">
  import type { ActiveAppId } from '../types.js'

  interface Props {
    activeApp: ActiveAppId
    isOpen: boolean
    onSelectApp: (app: ActiveAppId) => void
    onClose: () => void
  }

  let { activeApp, isOpen, onSelectApp, onClose }: Props = $props()

  const apps: { id: ActiveAppId; name: string; en: string; iconBg: string; desc: string; iconChar: string }[] = [
    {
      id: 'dashboard',
      name: '系統總覽',
      en: 'App Store / Modules',
      iconBg: 'from-violet-500 to-purple-600',
      desc: '依賴拓撲解析與 9 大模組清單',
      iconChar: '⚡',
    },
    {
      id: 'sales',
      name: '銷售管理',
      en: 'Sales / OTC',
      iconBg: 'from-blue-500 to-indigo-600',
      desc: '訂單審批、客戶信用與銷貨出庫',
      iconChar: '🏷️',
    },
    {
      id: 'procurement',
      name: '採購管理',
      en: 'Procurement / P2P',
      iconBg: 'from-teal-500 to-emerald-600',
      desc: '請購單、採購單與三向匹配 (3-Way Match)',
      iconChar: '🛒',
    },
    {
      id: 'inventory',
      name: '倉儲庫存',
      en: 'Inventory & ATP',
      iconBg: 'from-amber-500 to-orange-600',
      desc: '庫存水位、移動平均成本與調撥',
      iconChar: '📦',
    },
    {
      id: 'manufacturing',
      name: '生產製造',
      en: 'Manufacturing & Costing',
      iconBg: 'from-rose-500 to-red-600',
      desc: 'BOM 防循環展算、工單發料與製費分攤',
      iconChar: '⚙️',
    },
    {
      id: 'treasury',
      name: '出納資金',
      en: 'Treasury & Cash',
      iconBg: 'from-cyan-500 to-blue-600',
      desc: '收付款單、單據沖銷與銀行自動對帳',
      iconChar: '🏦',
    },
    {
      id: 'finance',
      name: '財務總帳',
      en: 'General Ledger',
      iconBg: 'from-emerald-500 to-teal-700',
      desc: '平衡傳票、會計期間與即時試算表',
      iconChar: '📖',
    },
    {
      id: 'organization',
      name: '企業架構',
      en: 'Organization & RBAC',
      iconBg: 'from-slate-600 to-slate-800',
      desc: '公司/廠區/倉庫組織樹與多公司隔離',
      iconChar: '🏢',
    },
  ]
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    role="presentation"
    onclick={onClose}
    class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 transition-opacity animate-in fade-in"
  ></div>

  <!-- App Drawer Modal -->
  <div
    role="dialog"
    aria-modal="true"
    class="fixed top-14 left-0 right-0 max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-700 shadow-2xl rounded-b-2xl z-50 text-white animate-in slide-in-from-top-4 duration-200"
  >
    <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
      <div>
        <h2 class="text-base font-bold text-slate-100">應用程式啟動器 (Application Menu)</h2>
        <p class="text-xs text-slate-400">點選進入各業務領域模組，所有領域共享統一單體模組架構</p>
      </div>
      <button
        onclick={onClose}
        class="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition"
      >
        關閉 (ESC)
      </button>
    </div>

    <!-- 4x2 Grid of Odoo style App Tiles -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {#each apps as app}
        <button
          onclick={() => {
            onSelectApp(app.id)
            onClose()
          }}
          class="flex flex-col items-center text-center p-4 rounded-xl border transition-all duration-150 group text-left {activeApp === app.id ? 'bg-slate-800/90 border-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'}"
        >
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br {app.iconBg} flex items-center justify-center text-2xl shadow-md mb-2 group-hover:scale-105 transition-transform">
            {app.iconChar}
          </div>
          <span class="font-semibold text-xs text-slate-100">{app.name}</span>
          <span class="text-[10px] text-slate-400 mb-1">{app.en}</span>
          <p class="text-[10px] text-slate-500 line-clamp-1">{app.desc}</p>
        </button>
      {/each}
    </div>
  </div>
{/if}
