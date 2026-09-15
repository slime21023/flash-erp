<script lang="ts">
  import Statusbar from '../lib/components/Statusbar.svelte'
  import { ApiError, apiRequest, readAuthSession } from '../lib/api.js'

  type Customer = {
    id: string
    companyId: string
    code: string
    name: string
    currency: string
    creditLimitMinorUnits: string
    currentOutstandingMinorUnits: string
    isActive: boolean
  }

  type SalesOrderLine = {
    itemId: string
    warehouseId: string
    orderedQuantity: string
    shippedQuantity: string
    unitPriceMinorUnits: string
    lineTotalMinorUnits: string
    currency: string
  }

  type SalesOrder = {
    id: string
    companyId: string
    customerId: string
    number: string
    status: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CLOSED' | 'VOID'
    taxRateBasisPoints: number
    netAmountMinorUnits: string
    taxAmountMinorUnits: string
    totalAmountMinorUnits: string
    reservationIds: string[]
    lines: SalesOrderLine[]
    memo?: string
  }

  const session = readAuthSession()
  let orderId = $state('')
  let orderNumber = $state('')
  let companyId = $state(session?.user.organizationUnitIds[0] ?? '')
  let customerId = $state('')
  let warehouseId = $state('')
  let itemId = $state('')
  let orderedQuantity = $state('1')
  let unitPriceMinorUnits = $state('0')
  let currency = $state('TWD')
  let customerCode = $state('')
  let customerName = $state('')
  let creditLimitMinorUnits = $state('0')
  let shipmentId = $state('')
  let order = $state<SalesOrder | null>(null)
  let customer = $state<Customer | null>(null)
  let notification = $state<{ type: 'success' | 'error'; text: string } | null>(null)
  let isBusy = $state(false)

  const stages = [
    { id: 'DRAFT', label: '草稿 (Draft)' },
    { id: 'CONFIRMED', label: '已確認 (Confirmed)' },
    { id: 'SHIPPED', label: '已出庫 (Shipped)' },
  ]

  let currentStage = $derived(order?.status ?? 'DRAFT')
  let lines = $derived(order?.lines ?? [])

  function formatMinorUnits(value: string | bigint): string {
    const raw = value.toString()
    const sign = raw.startsWith('-') ? '-' : ''
    const digits = sign ? raw.slice(1) : raw
    return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  }

  function messageFor(error: unknown): string {
    if (error instanceof ApiError) return `${error.message} (${error.status})`
    return error instanceof Error ? error.message : '操作失敗'
  }

  function notify(type: 'success' | 'error', text: string) {
    notification = { type, text }
  }

  function requireScope(): boolean {
    if (companyId.trim()) return true
    notify('error', '目前帳號沒有可用的 organization scope，請先設定權限作用域。')
    return false
  }

  async function loadCustomer(id = customerId) {
    if (!id.trim()) {
      customer = null
      return
    }
    customer = await apiRequest<Customer>(`/sales/customers/${encodeURIComponent(id.trim())}`)
    companyId = customer.companyId
  }

  async function loadOrder() {
    if (!orderId.trim()) {
      notify('error', '請輸入要查詢的訂單 ID。')
      return
    }
    isBusy = true
    notification = null
    try {
      order = await apiRequest<SalesOrder>(`/sales/orders/${encodeURIComponent(orderId.trim())}`)
      companyId = order.companyId
      customerId = order.customerId
      warehouseId = order.lines[0]?.warehouseId ?? warehouseId
      itemId = order.lines[0]?.itemId ?? itemId
      orderedQuantity = order.lines[0]?.orderedQuantity ?? orderedQuantity
      unitPriceMinorUnits = order.lines[0]?.unitPriceMinorUnits ?? unitPriceMinorUnits
      currency = order.lines[0]?.currency ?? currency
      await loadCustomer(order.customerId)
      notify('success', `已從 PostgreSQL 載入訂單 ${order.number}。`)
    } catch (error) {
      order = null
      customer = null
      notify('error', messageFor(error))
    } finally {
      isBusy = false
    }
  }

  async function registerCustomer() {
    if (!requireScope() || !customerCode.trim() || !customerName.trim()) {
      if (!customerCode.trim() || !customerName.trim()) notify('error', '客戶代碼與名稱為必填。')
      return
    }
    isBusy = true
    notification = null
    try {
      const id = customerId.trim() || `cust-${crypto.randomUUID()}`
      customer = await apiRequest<Customer>('/sales/customers', {
        method: 'POST',
        body: {
          id,
          companyId: companyId.trim(),
          code: customerCode.trim(),
          name: customerName.trim(),
          currency,
          creditLimitMinorUnits: creditLimitMinorUnits.trim() || '0',
        },
      })
      customerId = customer.id
      notify('success', `客戶 ${customer.code} 已建立。`)
    } catch (error) {
      notify('error', messageFor(error))
    } finally {
      isBusy = false
    }
  }

  async function createOrder() {
    if (!requireScope()) return
    if (!customerId.trim() || !itemId.trim() || !warehouseId.trim()) {
      notify('error', '客戶、料品與倉庫 ID 為必填。')
      return
    }
    if (!/^\d+$/.test(orderedQuantity) || BigInt(orderedQuantity) <= 0n) {
      notify('error', '訂購數量必須是大於 0 的整數。')
      return
    }
    if (!/^\d+$/.test(unitPriceMinorUnits)) {
      notify('error', '單價必須是非負整數（最小貨幣單位）。')
      return
    }

    isBusy = true
    notification = null
    try {
      orderId = orderId.trim() || `so-${crypto.randomUUID()}`
      orderNumber = orderNumber.trim() || `SO-${new Date().getFullYear()}-${Date.now()}`
      order = await apiRequest<SalesOrder>('/sales/orders', {
        method: 'POST',
        body: {
          id: orderId,
          companyId: companyId.trim(),
          customerId: customerId.trim(),
          number: orderNumber,
          lines: [
            {
              itemId: itemId.trim(),
              warehouseId: warehouseId.trim(),
              orderedQuantity,
              unitPriceMinorUnits,
              currency,
            },
          ],
        },
      })
      await loadCustomer(customerId)
      notify('success', `訂單 ${order.number} 已儲存為草稿。`)
    } catch (error) {
      notify('error', messageFor(error))
    } finally {
      isBusy = false
    }
  }

  async function confirmOrder() {
    if (!order) return
    isBusy = true
    notification = null
    try {
      order = await apiRequest<SalesOrder>(`/sales/orders/${encodeURIComponent(order.id)}/confirm`, {
        method: 'POST',
      })
      notify('success', '訂單已確認，後端已執行信用檢查與 ATP 庫存預留。')
    } catch (error) {
      notify('error', messageFor(error))
    } finally {
      isBusy = false
    }
  }

  async function createShipment() {
    if (!order || !requireScope()) return
    isBusy = true
    notification = null
    try {
      const shipment = await apiRequest<{ id: string }>('/sales/shipments', {
        method: 'POST',
        body: {
          id: shipmentId.trim() || `ship-${crypto.randomUUID()}`,
          salesOrderId: order.id,
          warehouseId: warehouseId.trim() || order.lines[0]?.warehouseId,
          shipmentDate: new Date().toISOString().slice(0, 10),
        },
      })
      shipmentId = shipment.id
      await loadOrder()
      notify('success', `出貨單 ${shipment.id} 已建立，庫存與 AR/COGS 已由後端處理。`)
    } catch (error) {
      notify('error', messageFor(error))
    } finally {
      isBusy = false
    }
  }

  function resetOrder() {
    order = null
    customer = null
    orderId = ''
    orderNumber = ''
    notification = null
  }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <Statusbar
    {stages}
    {currentStage}
    actions={[
      ...(currentStage === 'DRAFT' && order
        ? [{ id: 'confirm', label: '審核確認訂單 (Confirm SO)', primary: true, onClick: confirmOrder }]
        : []),
      ...(currentStage === 'CONFIRMED'
        ? [{ id: 'ship', label: '銷貨出庫交運 (Create Shipment)', primary: true, onClick: createShipment }]
        : []),
      { id: 'reset', label: '清除畫面', onClick: resetOrder },
    ]}
  />

  {#if notification}
    <div
      class="p-3.5 rounded-lg border text-xs flex items-center justify-between {notification.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-indigo-50 border-indigo-200 text-indigo-900'}"
      role="status"
    >
      <span>{notification.text}</span>
      <button onclick={() => (notification = null)} class="font-bold ml-2" aria-label="關閉訊息">×</button>
    </div>
  {/if}

  <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
    <div>
      <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">銷售訂單 (Sales Order)</span>
      <h2 class="text-xl font-extrabold text-slate-900">Sales vertical slice</h2>
      <p class="mt-1 text-xs text-slate-500">資料直接讀寫後端 PostgreSQL；請使用已建立的料品、倉庫與客戶 ID。</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
      <label class="space-y-1">訂單 ID<input bind:value={orderId} class="field" placeholder="so-..." /></label>
      <label class="space-y-1">訂單號碼<input bind:value={orderNumber} class="field" placeholder="SO-2026-001" /></label>
      <label class="space-y-1">公司 / scope<input bind:value={companyId} class="field" required /></label>
      <button onclick={loadOrder} disabled={isBusy} class="self-end rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-50">載入訂單</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs border-t border-slate-100 pt-5">
      <label class="space-y-1">客戶 ID<input bind:value={customerId} class="field" placeholder="cust-..." /></label>
      <label class="space-y-1">料品 ID<input bind:value={itemId} class="field" placeholder="item-..." /></label>
      <label class="space-y-1">倉庫 ID<input bind:value={warehouseId} class="field" placeholder="wh-..." /></label>
      <label class="space-y-1">幣別<input bind:value={currency} class="field" maxlength="3" /></label>
      <label class="space-y-1">訂購數量<input bind:value={orderedQuantity} class="field" inputmode="numeric" /></label>
      <label class="space-y-1">單價（最小單位）<input bind:value={unitPriceMinorUnits} class="field" inputmode="numeric" /></label>
      <button onclick={createOrder} disabled={isBusy} class="self-end rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">建立銷售訂單</button>
    </div>
  </div>

  <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold text-sm">客戶主檔與信用</h3>
        <p class="text-xs text-slate-500">可先建立客戶，或輸入既有客戶 ID 後查詢。</p>
      </div>
      <button onclick={() => loadCustomer()} disabled={isBusy} class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">查詢客戶</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
      <label class="space-y-1">客戶代碼<input bind:value={customerCode} class="field" placeholder="CUST-001" /></label>
      <label class="space-y-1">客戶名稱<input bind:value={customerName} class="field" placeholder="Customer" /></label>
      <label class="space-y-1">信用額度（最小單位）<input bind:value={creditLimitMinorUnits} class="field" inputmode="numeric" /></label>
      <button onclick={registerCustomer} disabled={isBusy} class="self-end rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-50">建立客戶</button>
    </div>
    {#if customer}
      <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        <span class="font-semibold">{customer.name} ({customer.code})</span>
        <span class="ml-3">未收：NT$ {formatMinorUnits(customer.currentOutstandingMinorUnits)}</span>
        <span class="ml-3">額度：NT$ {formatMinorUnits(customer.creditLimitMinorUnits)}</span>
      </div>
    {/if}
  </div>

  {#if order}
    <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
      <div class="flex flex-col md:flex-row justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">已持久化訂單</span>
          <h2 class="text-xl font-extrabold text-slate-900">{order.number}</h2>
          <p class="font-mono text-xs text-slate-500">{order.id} · {order.status}</p>
        </div>
        <div class="text-right">
          <span class="text-xs text-slate-400">訂單總金額</span>
          <p class="text-2xl font-black text-slate-900">NT$ {formatMinorUnits(order.totalAmountMinorUnits)}</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead><tr class="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold"><th class="py-2.5 px-3">料品</th><th class="py-2.5 px-3">倉庫</th><th class="py-2.5 px-3 text-right">數量</th><th class="py-2.5 px-3 text-right">已出貨</th><th class="py-2.5 px-3 text-right">單價</th><th class="py-2.5 px-3 text-right">小計</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            {#each lines as line}
              <tr><td class="py-2.5 px-3 font-mono">{line.itemId}</td><td class="py-2.5 px-3 font-mono">{line.warehouseId}</td><td class="py-2.5 px-3 text-right">{line.orderedQuantity}</td><td class="py-2.5 px-3 text-right">{line.shippedQuantity}</td><td class="py-2.5 px-3 text-right">{formatMinorUnits(line.unitPriceMinorUnits)}</td><td class="py-2.5 px-3 text-right font-bold">{formatMinorUnits(line.lineTotalMinorUnits)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="flex justify-end border-t border-slate-100 pt-4">
        <div class="w-64 space-y-1.5 text-xs text-slate-600">
          <div class="flex justify-between"><span>未稅小計</span><span class="font-semibold">NT$ {formatMinorUnits(order.netAmountMinorUnits)}</span></div>
          <div class="flex justify-between"><span>營業稅</span><span class="font-semibold">NT$ {formatMinorUnits(order.taxAmountMinorUnits)}</span></div>
          <div class="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200"><span>應付總計</span><span class="text-indigo-600">NT$ {formatMinorUnits(order.totalAmountMinorUnits)}</span></div>
        </div>
      </div>

      {#if currentStage === 'CONFIRMED'}
        <div class="border-t border-slate-100 pt-4 flex items-end gap-3 text-xs">
          <label class="space-y-1 flex-1">出貨單 ID（可留白自動產生）<input bind:value={shipmentId} class="field" placeholder="ship-..." /></label>
          <button onclick={createShipment} disabled={isBusy} class="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">建立出貨</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  :global(.field) {
    width: 100%;
    border: 1px solid rgb(203 213 225);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
    outline: none;
  }

  :global(.field:focus) {
    border-color: rgb(99 102 241);
    box-shadow: 0 0 0 2px rgb(224 231 255);
  }
</style>
