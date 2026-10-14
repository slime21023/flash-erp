<script lang="ts">
  import { tick } from 'svelte'
  import {
    BadgePercent,
    BookOpen,
    Boxes,
    Building2,
    Cog,
    History,
    Landmark,
    LayoutDashboard,
    ShieldCheck,
    ShoppingCart,
  } from 'lucide-svelte'
  import type { ActiveAppId } from '../types.js'

  interface Props {
    activeApp: ActiveAppId
    isOpen: boolean
    onSelectApp: (app: ActiveAppId) => void
    onClose: () => void
  }

  let { activeApp, isOpen, onSelectApp, onClose }: Props = $props()

  let modalRoot = $state<HTMLDivElement | undefined>(undefined)
  let closeButton = $state<HTMLButtonElement | undefined>(undefined)

  $effect(() => {
    if (!isOpen) return

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    void tick().then(() => closeButton?.focus())

    return () => previousFocus?.focus()
  })

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab' || !modalRoot) return

    const focusable = Array.from(
      modalRoot.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const icons = {
    BadgePercent,
    BookOpen,
    Boxes,
    Building2,
    Cog,
    History,
    Landmark,
    LayoutDashboard,
    ShieldCheck,
    ShoppingCart,
  }

  const apps: { id: ActiveAppId; name: string; en: string; icon: string; desc: string }[] = [
    {
      id: 'dashboard',
      name: '系統總覽',
      en: 'App Store / Modules',
      desc: '依賴拓撲解析與 9 大模組清單',
      icon: 'LayoutDashboard',
    },
    {
      id: 'sales',
      name: '銷售管理',
      en: 'Sales / OTC',
      desc: '訂單審批、客戶信用與銷貨出庫',
      icon: 'BadgePercent',
    },
    {
      id: 'procurement',
      name: '採購管理',
      en: 'Procurement / P2P',
      desc: '請購單、採購單與三向匹配 (3-Way Match)',
      icon: 'ShoppingCart',
    },
    {
      id: 'inventory',
      name: '倉儲庫存',
      en: 'Inventory & ATP',
      desc: '庫存水位、移動平均成本與調撥',
      icon: 'Boxes',
    },
    {
      id: 'manufacturing',
      name: '生產製造',
      en: 'Manufacturing & Costing',
      desc: 'BOM 防循環展算、工單發料與製費分攤',
      icon: 'Cog',
    },
    {
      id: 'treasury',
      name: '出納資金',
      en: 'Treasury & Cash',
      desc: '收付款單、單據沖銷與銀行自動對帳',
      icon: 'Landmark',
    },
    {
      id: 'finance',
      name: '財務總帳',
      en: 'General Ledger',
      desc: '平衡傳票、會計期間與即時試算表',
      icon: 'BookOpen',
    },
    {
      id: 'organization',
      name: '企業架構',
      en: 'Organization & RBAC',
      desc: '公司/廠區/倉庫組織樹與多公司隔離',
      icon: 'Building2',
    },
  ]
</script>

{#if isOpen}
  <div
    bind:this={modalRoot}
    class="modal is-active erp-app-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="app-switcher-title"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <div class="modal-background" role="presentation" onclick={onClose}></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <div>
          <h2 id="app-switcher-title" class="modal-card-title">應用程式啟動器</h2>
          <p class="is-size-7 has-text-grey-dark">
            點選進入各業務領域模組，所有領域共享統一單體模組架構
          </p>
        </div>
        <button bind:this={closeButton} class="delete" aria-label="關閉" onclick={onClose}></button>
      </header>
      <section class="modal-card-body">
        <div class="erp-app-grid">
          {#each apps as app}
            {@const Icon = icons[app.icon as keyof typeof icons]}
            <button
              onclick={() => {
                onSelectApp(app.id)
                onClose()
              }}
              class="button is-white erp-app-tile {activeApp === app.id ? 'is-selected' : ''}"
            >
              <span class="erp-app-icon"><Icon size={22} strokeWidth={1.8} /></span>
              <span class="has-text-weight-semibold is-size-7">{app.name}</span>
              <span class="is-size-7 has-text-grey">{app.en}</span>
              <span class="is-size-7 has-text-grey-dark">{app.desc}</span>
            </button>
          {/each}
        </div>
      </section>
    </div>
  </div>
{/if}
