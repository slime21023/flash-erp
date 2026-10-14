<script lang="ts">
  import Statusbar from '../lib/components/Statusbar.svelte'
  import { api, ORPCError, readAuthSession, type Api } from '../lib/api.js'

  type Customer = Awaited<ReturnType<Api['sales']['getCustomer']>>
  type SalesOrder = Awaited<ReturnType<Api['sales']['getSalesOrder']>>

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
    if (error instanceof ORPCError) return `${error.message} (${error.status})`
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
    customer = await api.sales.getCustomer(
      { id: id.trim() },
      { context: { organizationUnitId: companyId } }
    )
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
      order = await api.sales.getSalesOrder(
        { id: orderId.trim() },
        { context: { organizationUnitId: companyId } }
      )
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
      customer = await api.sales.registerCustomer(
        {
          id,
          companyId: companyId.trim(),
          code: customerCode.trim(),
          name: customerName.trim(),
          currency,
          creditLimitMinorUnits: creditLimitMinorUnits.trim() || '0',
        },
        { context: { organizationUnitId: companyId } }
      )
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
      order = await api.sales.createSalesOrder(
        {
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
        { context: { organizationUnitId: companyId } }
      )
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
      order = await api.sales.confirmOrder(
        { id: order.id },
        { context: { organizationUnitId: companyId } }
      )
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
      const shipment = await api.sales.createShipment(
        {
          id: shipmentId.trim() || `ship-${crypto.randomUUID()}`,
          salesOrderId: order.id,
          warehouseId: warehouseId.trim() || order.lines[0]?.warehouseId || '',
          shipmentDate: new Date().toISOString().slice(0, 10),
        },
        { context: { organizationUnitId: companyId } }
      )
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

<div class="erp-page">
  <Statusbar
    {stages}
    {currentStage}
    actions={[
      ...(currentStage === 'DRAFT' && order
        ? [
            {
              id: 'confirm',
              label: '審核確認訂單 (Confirm SO)',
              primary: true,
              onClick: confirmOrder,
            },
          ]
        : []),
      ...(currentStage === 'CONFIRMED'
        ? [
            {
              id: 'ship',
              label: '銷貨出庫交運 (Create Shipment)',
              primary: true,
              onClick: createShipment,
            },
          ]
        : []),
      { id: 'reset', label: '清除畫面', onClick: resetOrder },
    ]}
  />

  {#if notification}
    <div
      class="notification {notification.type === 'error'
        ? 'is-danger'
        : 'is-info'} is-light py-3 is-flex is-align-items-center is-justify-content-space-between"
      role="status"
    >
      <span>{notification.text}</span>
      <button onclick={() => (notification = null)} class="delete" aria-label="關閉訊息"></button>
    </div>
  {/if}

  <section class="erp-panel">
    <div>
      <span class="erp-eyebrow">銷售訂單 (Sales Order)</span>
      <h2 class="erp-page-title">Sales vertical slice</h2>
      <p class="erp-page-hint">資料直接讀寫後端 PostgreSQL；請使用已建立的料品、倉庫與客戶 ID。</p>
    </div>

    <div class="erp-form-grid">
      <label>訂單 ID<input bind:value={orderId} class="input" placeholder="so-..."></label>
      <label
        >訂單號碼<input bind:value={orderNumber} class="input" placeholder="SO-2026-001"></label
      >
      <label>公司 / scope<input bind:value={companyId} class="input" required></label>
      <button onclick={loadOrder} disabled={isBusy} class="button is-light">載入訂單</button>
    </div>

    <div class="erp-form-grid">
      <label>客戶 ID<input bind:value={customerId} class="input" placeholder="cust-..."></label>
      <label>料品 ID<input bind:value={itemId} class="input" placeholder="item-..."></label>
      <label>倉庫 ID<input bind:value={warehouseId} class="input" placeholder="wh-..."></label>
      <label>幣別<input bind:value={currency} class="input" maxlength="3"></label>
      <label>訂購數量<input bind:value={orderedQuantity} class="input" inputmode="numeric"></label>
      <label
        >單價（最小單位）<input
          bind:value={unitPriceMinorUnits}
          class="input"
          inputmode="numeric"
        ></label
      >
      <button onclick={createOrder} disabled={isBusy} class="button is-primary">
        建立銷售訂單
      </button>
    </div>
  </section>

  <section class="erp-panel">
    <div class="is-flex is-align-items-center is-justify-content-space-between" style="gap: 1rem">
      <div>
        <h3 class="erp-panel-title">客戶主檔與信用</h3>
        <p class="is-size-7 has-text-grey">可先建立客戶，或輸入既有客戶 ID 後查詢。</p>
      </div>
      <button onclick={() => loadCustomer()} disabled={isBusy} class="button is-light is-small">
        查詢客戶
      </button>
    </div>
    <div class="erp-form-grid">
      <label>客戶代碼<input bind:value={customerCode} class="input" placeholder="CUST-001"></label>
      <label>客戶名稱<input bind:value={customerName} class="input" placeholder="Customer"></label>
      <label
        >信用額度（最小單位）<input
          bind:value={creditLimitMinorUnits}
          class="input"
          inputmode="numeric"
        ></label
      >
      <button onclick={registerCustomer} disabled={isBusy} class="button is-primary">
        建立客戶
      </button>
    </div>
    {#if customer}
      <div class="notification is-light py-3 is-size-7 mb-0">
        <span class="has-text-weight-semibold">{customer.name} ({customer.code})</span>
        <span class="ml-3"
          >未收：NT$ {formatMinorUnits(customer.currentOutstandingMinorUnits)}</span
        >
        <span class="ml-3">額度：NT$ {formatMinorUnits(customer.creditLimitMinorUnits)}</span>
      </div>
    {/if}
  </section>

  {#if order}
    <section class="erp-panel">
      <div
        class="is-flex is-flex-wrap-wrap is-justify-content-space-between pb-4"
        style="gap: 1rem; border-bottom: 1px solid var(--bulma-border-weak)"
      >
        <div>
          <span class="erp-eyebrow">已持久化訂單</span>
          <h2 class="title is-5 mb-1">{order.number}</h2>
          <p class="erp-code is-size-7 has-text-grey">{order.id} · {order.status}</p>
        </div>
        <div class="has-text-right">
          <span class="is-size-7 has-text-grey">訂單總金額</span>
          <p class="title is-4 mb-0">NT$ {formatMinorUnits(order.totalAmountMinorUnits)}</p>
        </div>
      </div>

      <div class="erp-table-wrap">
        <table class="table is-fullwidth is-hoverable is-size-7">
          <thead>
            <tr>
              <th>料品</th>
              <th>倉庫</th>
              <th class="has-text-right">數量</th>
              <th class="has-text-right">已出貨</th>
              <th class="has-text-right">單價</th>
              <th class="has-text-right">小計</th>
            </tr>
          </thead>
          <tbody>
            {#each lines as line}
              <tr>
                <td class="erp-code">{line.itemId}</td>
                <td class="erp-code">{line.warehouseId}</td>
                <td class="has-text-right">{line.orderedQuantity}</td>
                <td class="has-text-right">{line.shippedQuantity}</td>
                <td class="has-text-right">{formatMinorUnits(line.unitPriceMinorUnits)}</td>
                <td class="has-text-right has-text-weight-bold">
                  {formatMinorUnits(line.lineTotalMinorUnits)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div
        class="is-flex is-justify-content-flex-end pt-4"
        style="border-top: 1px solid var(--bulma-border-weak)"
      >
        <div style="width: min(100%, 16rem)" class="is-size-7">
          <div class="is-flex is-justify-content-space-between">
            <span>未稅小計</span
            ><span class="has-text-weight-semibold"
              >NT$ {formatMinorUnits(order.netAmountMinorUnits)}</span
            >
          </div>
          <div class="is-flex is-justify-content-space-between mt-2">
            <span>營業稅</span
            ><span class="has-text-weight-semibold"
              >NT$ {formatMinorUnits(order.taxAmountMinorUnits)}</span
            >
          </div>
          <div
            class="is-flex is-justify-content-space-between mt-2 pt-2 has-text-weight-bold"
            style="border-top: 1px solid var(--bulma-border)"
          >
            <span>應付總計</span
            ><span class="has-text-link">NT$ {formatMinorUnits(order.totalAmountMinorUnits)}</span>
          </div>
        </div>
      </div>

      {#if currentStage === 'CONFIRMED'}
        <div class="erp-actions pt-4" style="border-top: 1px solid var(--bulma-border-weak)">
          <label class="field mb-0" style="flex: 1 1 16rem"
            >出貨單 ID（可留白自動產生）<input
              bind:value={shipmentId}
              class="input"
              placeholder="ship-..."
            ></label
          >
          <button onclick={createShipment} disabled={isBusy} class="button is-primary">
            建立出貨
          </button>
        </div>
      {/if}
    </section>
  {/if}
</div>
