<script lang="ts">
  import { ApiError, apiRequest, readAuthSession } from '../lib/api.js'

  type Stock = {
    companyId: string
    itemId: string
    warehouseId: string
    quantity: string
    averageUnitCostMinorUnits: string
    currency: string | null
  }

  const session = readAuthSession()
  let companyId = $state(session?.user.organizationUnitIds[0] ?? '')
  let unitId = $state('')
  let unitCode = $state('PCS')
  let unitName = $state('Pieces')
  let itemId = $state('')
  let sku = $state('')
  let itemName = $state('')
  let warehouseId = $state('')
  let warehouseCode = $state('')
  let warehouseName = $state('')
  let warehouseOrganizationUnitId = $state(session?.user.organizationUnitIds[0] ?? '')
  let movementId = $state('')
  let sourceType = $state('PURCHASE_RECEIPT')
  let sourceId = $state('')
  let quantityDelta = $state('0')
  let unitCostMinorUnits = $state('0')
  let currency = $state('TWD')
  let occurredAt = $state(new Date().toISOString())
  let stock = $state<Stock | null>(null)
  let message = $state<string | null>(null)
  let busy = $state(false)

  function errorMessage(error: unknown) {
    return error instanceof ApiError || error instanceof Error ? error.message : '操作失敗'
  }

  async function run(action: () => Promise<void>) {
    busy = true
    message = null
    try { await action() } catch (error) { message = errorMessage(error) } finally { busy = false }
  }

  async function createUnit() {
    await run(async () => {
      const result = await apiRequest<{ id: string }>('/inventory/units', {
        method: 'POST', body: { id: unitId, code: unitCode, name: unitName },
      })
      unitId = result.id
      message = `單位 ${result.id} 已建立。`
    })
  }

  async function createItem() {
    await run(async () => {
      const result = await apiRequest<{ id: string }>('/inventory/items', {
        method: 'POST', body: { id: itemId, companyId, sku, name: itemName, unitId },
      })
      itemId = result.id
      message = `料品 ${result.id} 已建立。`
    })
  }

  async function createWarehouse() {
    await run(async () => {
      const result = await apiRequest<{ id: string }>('/inventory/warehouses', {
        method: 'POST', body: {
          id: warehouseId, companyId, organizationUnitId: warehouseOrganizationUnitId,
          code: warehouseCode, name: warehouseName,
        },
      })
      warehouseId = result.id
      message = `倉庫 ${result.id} 已建立。`
    })
  }

  async function recordMovement() {
    await run(async () => {
      const result = await apiRequest<{ id: string }>('/inventory/movements', {
        method: 'POST', body: {
          id: movementId || `mov-${crypto.randomUUID()}`, companyId, itemId, warehouseId,
          sourceType, sourceId, quantityDelta, unitCostMinorUnits, currency, occurredAt,
        },
      })
      movementId = result.id
      message = `庫存異動 ${result.id} 已記錄。`
    })
  }

  async function loadStock() {
    await run(async () => {
      const query = new URLSearchParams({ companyId, itemId, warehouseId })
      stock = await apiRequest<Stock>(`/inventory/stock?${query}`)
      message = '庫存已從 PostgreSQL 載入。'
    })
  }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div><span class="label">倉儲與庫存管理 (Inventory)</span><h2 class="title">主檔、異動與庫存</h2><p class="hint">所有數量與成本欄位以字串形式傳遞，避免前端浮點數誤差。</p></div>
  {#if message}<div class="message" role="status">{message}</div>{/if}

  <section class="panel"><h3>單位</h3><div class="grid"><label>ID<input bind:value={unitId} placeholder="unit-pcs" /></label><label>代碼<input bind:value={unitCode} /></label><label>名稱<input bind:value={unitName} /></label><button onclick={createUnit} disabled={busy}>建立單位</button></div></section>

  <section class="panel"><h3>料品與倉庫主檔</h3><div class="grid">
    <label>公司 ID<input bind:value={companyId} /></label><label>料品 ID<input bind:value={itemId} placeholder="item-..." /></label><label>SKU<input bind:value={sku} /></label><label>料品名稱<input bind:value={itemName} /></label><button onclick={createItem} disabled={busy}>建立料品</button>
  </div><div class="grid border-t border-slate-100 pt-3">
    <label>倉庫 ID<input bind:value={warehouseId} placeholder="wh-..." /></label><label>組織單位 ID<input bind:value={warehouseOrganizationUnitId} /></label><label>倉庫代碼<input bind:value={warehouseCode} /></label><label>倉庫名稱<input bind:value={warehouseName} /></label><button onclick={createWarehouse} disabled={busy}>建立倉庫</button>
  </div></section>

  <section class="panel"><h3>記錄庫存異動</h3><div class="grid"><label>異動 ID<input bind:value={movementId} placeholder="留白自動產生" /></label><label>來源類型<input bind:value={sourceType} /></label><label>來源 ID<input bind:value={sourceId} /></label><label>數量增減<input bind:value={quantityDelta} inputmode="numeric" /></label><label>單位成本<input bind:value={unitCostMinorUnits} inputmode="numeric" /></label><label>幣別<input bind:value={currency} maxlength="3" /></label><label>發生時間<input bind:value={occurredAt} /></label><button onclick={recordMovement} disabled={busy}>記錄異動</button></div></section>

  <section class="panel"><div class="row"><h3>查詢庫存</h3><button onclick={loadStock} disabled={busy}>查詢</button></div>{#if stock}<pre>{JSON.stringify(stock, null, 2)}</pre>{/if}</section>
</div>

<style>
  .label { font-size: .625rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .08em; }
  .title { margin-top: .25rem; font-size: 1.25rem; font-weight: 800; }
  .hint { margin-top: .25rem; color: #64748b; font-size: .75rem; }
  .panel { display: grid; gap: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1.25rem; }
  h3 { font-size: .875rem; font-weight: 700; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; font-size: .75rem; } label { display: grid; gap: .25rem; color: #475569; } input { width: 100%; border: 1px solid #cbd5e1; border-radius: .5rem; padding: .5rem .625rem; } button { align-self: end; border-radius: .5rem; background: #4f46e5; color: white; padding: .5rem .75rem; font-size: .75rem; font-weight: 700; } button:disabled { opacity: .5; } .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } .message { border: 1px solid #c7d2fe; border-radius: .5rem; background: #eef2ff; padding: .75rem; color: #3730a3; font-size: .75rem; } pre { overflow: auto; border-radius: .5rem; background: #0f172a; padding: .75rem; color: #e2e8f0; font-size: .75rem; }
</style>
