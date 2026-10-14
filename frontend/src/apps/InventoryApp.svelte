<script lang="ts">
  import { api, readAuthSession, type Api } from '../lib/api.js'

  type Stock = Awaited<ReturnType<Api['inventory']['movements']['showStock']>>

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
    return error instanceof Error ? error.message : '操作失敗'
  }

  async function run(action: () => Promise<void>) {
    busy = true
    message = null
    try {
      await action()
    } catch (error) {
      message = errorMessage(error)
    } finally {
      busy = false
    }
  }

  async function createUnit() {
    await run(async () => {
      const result = await api.inventory.master.unit(
        { id: unitId, code: unitCode, name: unitName },
        { context: { organizationUnitId: companyId } }
      )
      unitId = result.id
      message = `單位 ${result.id} 已建立。`
    })
  }

  async function createItem() {
    await run(async () => {
      const result = await api.inventory.master.item(
        { id: itemId, companyId, sku, name: itemName, unitId },
        { context: { organizationUnitId: companyId } }
      )
      itemId = result.id
      message = `料品 ${result.id} 已建立。`
    })
  }

  async function createWarehouse() {
    await run(async () => {
      const result = await api.inventory.master.warehouse(
        {
          id: warehouseId,
          companyId,
          organizationUnitId: warehouseOrganizationUnitId,
          code: warehouseCode,
          name: warehouseName,
        },
        { context: { organizationUnitId: companyId } }
      )
      warehouseId = result.id
      message = `倉庫 ${result.id} 已建立。`
    })
  }

  async function recordMovement() {
    await run(async () => {
      const result = await api.inventory.movements.store(
        {
          id: movementId || `mov-${crypto.randomUUID()}`,
          companyId,
          itemId,
          warehouseId,
          sourceType,
          sourceId,
          quantityDelta,
          unitCostMinorUnits,
          currency,
          occurredAt,
        },
        { context: { organizationUnitId: companyId } }
      )
      movementId = result.id
      message = `庫存異動 ${result.id} 已記錄。`
    })
  }

  async function loadStock() {
    await run(async () => {
      stock = await api.inventory.movements.showStock(
        { companyId, itemId, warehouseId },
        { context: { organizationUnitId: companyId } }
      )
      message = '庫存已從 PostgreSQL 載入。'
    })
  }
</script>

<div class="erp-page">
  <header class="erp-page-header">
    <span class="erp-eyebrow">倉儲與庫存管理 (Inventory)</span>
    <h2 class="erp-page-title">主檔、異動與庫存</h2>
    <p class="erp-page-hint">所有數量與成本欄位以字串形式傳遞，避免前端浮點數誤差。</p>
  </header>
  {#if message}
    <div class="notification is-info is-light py-3" role="status">{message}</div>
  {/if}

  <section class="erp-panel">
    <h3 class="erp-panel-title">單位</h3>
    <div class="erp-form-grid">
      <label>ID<input class="input" bind:value={unitId} placeholder="unit-pcs"></label
      ><label>代碼<input class="input" bind:value={unitCode}></label
      ><label>名稱<input class="input" bind:value={unitName}></label
      ><button class="button is-primary" onclick={createUnit} disabled={busy}>建立單位</button>
    </div>
  </section>

  <section class="erp-panel">
    <h3 class="erp-panel-title">料品與倉庫主檔</h3>
    <div class="erp-form-grid">
      <label>公司 ID<input class="input" bind:value={companyId}></label
      ><label>料品 ID<input class="input" bind:value={itemId} placeholder="item-..."></label
      ><label>SKU<input class="input" bind:value={sku}></label
      ><label>料品名稱<input class="input" bind:value={itemName}></label
      ><button class="button is-primary" onclick={createItem} disabled={busy}>建立料品</button>
    </div>
    <div class="erp-form-grid">
      <label>倉庫 ID<input class="input" bind:value={warehouseId} placeholder="wh-..."></label
      ><label>組織單位 ID<input class="input" bind:value={warehouseOrganizationUnitId}></label
      ><label>倉庫代碼<input class="input" bind:value={warehouseCode}></label
      ><label>倉庫名稱<input class="input" bind:value={warehouseName}></label
      ><button class="button is-primary" onclick={createWarehouse} disabled={busy}>建立倉庫</button>
    </div>
  </section>

  <section class="erp-panel">
    <h3 class="erp-panel-title">記錄庫存異動</h3>
    <div class="erp-form-grid">
      <label>異動 ID<input class="input" bind:value={movementId} placeholder="留白自動產生"></label
      ><label>來源類型<input class="input" bind:value={sourceType}></label
      ><label>來源 ID<input class="input" bind:value={sourceId}></label
      ><label>數量增減<input class="input" bind:value={quantityDelta} inputmode="numeric"></label
      ><label
        >單位成本<input class="input" bind:value={unitCostMinorUnits} inputmode="numeric"></label
      ><label>幣別<input class="input" bind:value={currency} maxlength="3"></label
      ><label>發生時間<input class="input" bind:value={occurredAt}></label
      ><button class="button is-primary" onclick={recordMovement} disabled={busy}>記錄異動</button>
    </div>
  </section>

  <section class="erp-panel">
    <div class="is-flex is-align-items-center is-justify-content-space-between" style="gap: 1rem">
      <h3 class="erp-panel-title">查詢庫存</h3>
      <button class="button is-light" onclick={loadStock} disabled={busy}>查詢</button>
    </div>
    {#if stock}
      <div class="erp-result"><pre>{JSON.stringify(stock, null, 2)}</pre></div>
    {/if}
  </section>
</div>
