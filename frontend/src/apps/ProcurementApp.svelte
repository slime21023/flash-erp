<script lang="ts">
  import { api, readAuthSession, type Api } from '../lib/api.js'

  type PurchaseOrder = Awaited<ReturnType<Api['procurement']['createPO']>>

  const session = readAuthSession()
  let companyId = $state(session?.user.organizationUnitIds[0] ?? '')
  let supplierId = $state('')
  let supplierCode = $state('')
  let supplierName = $state('')
  let purchaseOrderId = $state('')
  let purchaseOrderNumber = $state('')
  let itemId = $state('')
  let orderedQuantity = $state('1')
  let unitCostMinorUnits = $state('0')
  let currency = $state('TWD')
  let receiptId = $state('')
  let warehouseId = $state('')
  let purchaseOrder = $state<PurchaseOrder | null>(null)
  let message = $state<string | null>(null)
  let busy = $state(false)

  function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失敗' }
  async function run(action: () => Promise<void>) { busy = true; message = null; try { await action() } catch (error) { message = errorMessage(error) } finally { busy = false } }

  async function createSupplier() {
    await run(async () => {
      supplierId = supplierId || `supplier-${crypto.randomUUID()}`
      const supplier = await api.procurement.registerSupplier({ id: supplierId, companyId, code: supplierCode, name: supplierName }, { context: { organizationUnitId: companyId } })
      supplierId = supplier.id
      message = `供應商 ${supplier.id} 已建立。`
    })
  }

  async function createPurchaseOrder() {
    await run(async () => {
      purchaseOrderId = purchaseOrderId || `po-${crypto.randomUUID()}`
      purchaseOrderNumber = purchaseOrderNumber || `PO-${Date.now()}`
      purchaseOrder = await api.procurement.createPO({ id: purchaseOrderId, companyId, supplierId, number: purchaseOrderNumber, lines: [{ itemId, orderedQuantity, unitCostMinorUnits, currency }] }, { context: { organizationUnitId: companyId } })
      message = `採購單 ${purchaseOrder.number} 已建立。`
    })
  }

  async function loadPurchaseOrder() {
    await run(async () => {
      const loaded = await api.procurement.getPO({ id: purchaseOrderId.trim() }, { context: { organizationUnitId: companyId } })
      purchaseOrder = loaded
      companyId = loaded.companyId
      purchaseOrderId = loaded.id
      purchaseOrderNumber = loaded.number
      supplierId = loaded.supplierId
      const firstLine = loaded.lines[0]
      itemId = firstLine?.itemId ?? ''
      orderedQuantity = firstLine?.orderedQuantity ?? '1'
      unitCostMinorUnits = firstLine?.unitCostMinorUnits ?? '0'
      currency = firstLine?.currency ?? 'TWD'
      message = `採購單 ${loaded.number} 已載入。`
    })
  }

  async function approvePurchaseOrder() {
    const current = purchaseOrder
    if (!current?.approval?.currentStepId) return
    const expectedStepId = current.approval.currentStepId
    await run(async () => {
      const updated = await api.procurement.approvePO({ id: current.id, expectedStepId }, { context: { organizationUnitId: current.companyId } })
      purchaseOrder = updated
      message = updated.status === 'APPROVED' ? `採購單 ${updated.number} 已核准。` : `簽核已保存，待 ${updated.approval?.requiredRole === 'DIRECTOR' ? '董事' : '經理'} 簽核。`
    })
  }

  async function receiveGoods() {
    const current = purchaseOrder
    if (!current) return
    await run(async () => {
      const receipt = await api.procurement.receiveGoods({ id: receiptId || `gr-${crypto.randomUUID()}`, purchaseOrderId: current.id, warehouseId, receivedAt: new Date().toISOString(), lines: [{ itemId, receivedQuantity: orderedQuantity }] }, { context: { organizationUnitId: current.companyId } })
      receiptId = receipt.id
      message = `收貨單 ${receipt.id} 已建立，庫存異動已交由後端處理。`
    })
  }
</script>

<div class="erp-page">
  <header class="erp-page-header"><span class="erp-eyebrow">採購管理 (Procurement)</span><h2 class="erp-page-title">供應商、採購與收貨</h2><p class="erp-page-hint">操作結果來自 ProcurementContract 與 InventoryContract。</p></header>
  {#if message}<div class="notification is-info is-light py-3" role="status">{message}</div>{/if}

  <section class="erp-panel"><h3 class="erp-panel-title">供應商</h3><div class="erp-form-grid"><label>ID<input class="input" bind:value={supplierId} placeholder="留白自動產生" /></label><label>公司 ID<input class="input" bind:value={companyId} /></label><label>代碼<input class="input" bind:value={supplierCode} /></label><label>名稱<input class="input" bind:value={supplierName} /></label><button class="button is-primary" onclick={createSupplier} disabled={busy}>建立供應商</button></div></section>

  <section class="erp-panel"><h3 class="erp-panel-title">查詢與接續簽核</h3><div class="erp-form-grid"><label>公司 ID<input class="input" bind:value={companyId} /></label><label>採購單 ID<input class="input" bind:value={purchaseOrderId} /></label><button class="button is-link" onclick={loadPurchaseOrder} disabled={busy || !purchaseOrderId.trim() || !companyId.trim()}>載入採購單</button></div></section>

  <section class="erp-panel"><h3 class="erp-panel-title">採購單</h3><div class="erp-form-grid"><label>採購單 ID<input class="input" bind:value={purchaseOrderId} placeholder="留白自動產生" /></label><label>採購單號<input class="input" bind:value={purchaseOrderNumber} placeholder="留白自動產生" /></label><label>供應商 ID<input class="input" bind:value={supplierId} /></label><label>料品 ID<input class="input" bind:value={itemId} /></label><label>數量<input class="input" bind:value={orderedQuantity} inputmode="numeric" /></label><label>單位成本<input class="input" bind:value={unitCostMinorUnits} inputmode="numeric" /></label><label>幣別<input class="input" bind:value={currency} maxlength="3" /></label><button class="button is-primary" onclick={createPurchaseOrder} disabled={busy}>建立採購單</button></div>
    {#if purchaseOrder}<div class="erp-result"><strong>{purchaseOrder.number}</strong><span class="tag is-info is-light">{purchaseOrder.status}</span><span class="erp-code">{purchaseOrder.id}</span>{#if purchaseOrder.approval?.currentStepId}<span class="tag is-warning is-light">待 {purchaseOrder.approval.requiredRole === 'DIRECTOR' ? '董事' : '經理'} 簽核</span>{/if}</div><div class="erp-actions"><button class="button is-link" onclick={approvePurchaseOrder} disabled={busy || purchaseOrder.status !== 'DRAFT' || !purchaseOrder.approval?.currentStepId}>核准採購單</button><label class="field mb-0">收貨倉庫 ID<input class="input" bind:value={warehouseId} /></label><label class="field mb-0">收貨單 ID<input class="input" bind:value={receiptId} placeholder="留白自動產生" /></label><button class="button is-primary" onclick={receiveGoods} disabled={busy || purchaseOrder.status !== 'APPROVED'}>建立收貨</button></div>{/if}
  </section>
</div>
