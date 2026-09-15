<script lang="ts">
  import { ApiError, apiRequest, readAuthSession } from '../lib/api.js'

  type PurchaseOrder = {
    id: string
    companyId: string
    supplierId: string
    number: string
    status: 'DRAFT' | 'APPROVED' | 'CLOSED' | 'VOID'
    lines: { itemId: string; orderedQuantity: string; unitCostMinorUnits: string; currency: string }[]
  }

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

  function errorMessage(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : '操作失敗' }
  async function run(action: () => Promise<void>) { busy = true; message = null; try { await action() } catch (error) { message = errorMessage(error) } finally { busy = false } }

  async function createSupplier() {
    await run(async () => {
      supplierId = supplierId || `supplier-${crypto.randomUUID()}`
      const supplier = await apiRequest<{ id: string }>('/procurement/suppliers', { method: 'POST', body: { id: supplierId, companyId, code: supplierCode, name: supplierName } })
      supplierId = supplier.id
      message = `供應商 ${supplier.id} 已建立。`
    })
  }

  async function createPurchaseOrder() {
    await run(async () => {
      purchaseOrderId = purchaseOrderId || `po-${crypto.randomUUID()}`
      purchaseOrderNumber = purchaseOrderNumber || `PO-${Date.now()}`
      purchaseOrder = await apiRequest<PurchaseOrder>('/procurement/purchase-orders', { method: 'POST', body: { id: purchaseOrderId, companyId, supplierId, number: purchaseOrderNumber, lines: [{ itemId, orderedQuantity, unitCostMinorUnits, currency }] } })
      message = `採購單 ${purchaseOrder.number} 已建立。`
    })
  }

  async function approvePurchaseOrder() {
    const current = purchaseOrder
    if (!current) return
    await run(async () => {
      const updated = await apiRequest<PurchaseOrder>(`/procurement/purchase-orders/${encodeURIComponent(current.id)}/approve`, { method: 'POST' })
      purchaseOrder = updated
      message = `採購單 ${updated.number} 已核准。`
    })
  }

  async function receiveGoods() {
    const current = purchaseOrder
    if (!current) return
    await run(async () => {
      const receipt = await apiRequest<{ id: string }>('/procurement/goods-receipts', { method: 'POST', body: { id: receiptId || `gr-${crypto.randomUUID()}`, purchaseOrderId: current.id, warehouseId, receivedAt: new Date().toISOString(), lines: [{ itemId, receivedQuantity: orderedQuantity }] } })
      receiptId = receipt.id
      message = `收貨單 ${receipt.id} 已建立，庫存異動已交由後端處理。`
    })
  }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div><span class="label">採購管理 (Procurement)</span><h2 class="title">供應商、採購與收貨</h2><p class="hint">操作結果來自 ProcurementContract 與 InventoryContract。</p></div>
  {#if message}<div class="message" role="status">{message}</div>{/if}

  <section class="panel"><h3>供應商</h3><div class="grid"><label>ID<input bind:value={supplierId} placeholder="留白自動產生" /></label><label>公司 ID<input bind:value={companyId} /></label><label>代碼<input bind:value={supplierCode} /></label><label>名稱<input bind:value={supplierName} /></label><button onclick={createSupplier} disabled={busy}>建立供應商</button></div></section>

  <section class="panel"><h3>採購單</h3><div class="grid"><label>採購單 ID<input bind:value={purchaseOrderId} placeholder="留白自動產生" /></label><label>採購單號<input bind:value={purchaseOrderNumber} placeholder="留白自動產生" /></label><label>供應商 ID<input bind:value={supplierId} /></label><label>料品 ID<input bind:value={itemId} /></label><label>數量<input bind:value={orderedQuantity} inputmode="numeric" /></label><label>單位成本<input bind:value={unitCostMinorUnits} inputmode="numeric" /></label><label>幣別<input bind:value={currency} maxlength="3" /></label><button onclick={createPurchaseOrder} disabled={busy}>建立採購單</button></div>
    {#if purchaseOrder}<div class="result"><strong>{purchaseOrder.number}</strong><span>{purchaseOrder.status}</span><span>{purchaseOrder.id}</span></div><div class="actions"><button onclick={approvePurchaseOrder} disabled={busy || purchaseOrder.status !== 'DRAFT'}>核准採購單</button><label>收貨倉庫 ID<input bind:value={warehouseId} /></label><label>收貨單 ID<input bind:value={receiptId} placeholder="留白自動產生" /></label><button onclick={receiveGoods} disabled={busy || purchaseOrder.status !== 'APPROVED'}>建立收貨</button></div>{/if}
  </section>
</div>

<style>
  .label { font-size: .625rem; font-weight: 700; color: #7c2d12; text-transform: uppercase; letter-spacing: .08em; } .title { margin-top: .25rem; font-size: 1.25rem; font-weight: 800; } .hint { margin-top: .25rem; color: #64748b; font-size: .75rem; } .panel { display: grid; gap: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1.25rem; } h3 { font-size: .875rem; font-weight: 700; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; font-size: .75rem; } label { display: grid; gap: .25rem; color: #475569; } input { width: 100%; border: 1px solid #cbd5e1; border-radius: .5rem; padding: .5rem .625rem; } button { align-self: end; border-radius: .5rem; background: #ea580c; color: white; padding: .5rem .75rem; font-size: .75rem; font-weight: 700; } button:disabled { opacity: .5; } .message { border: 1px solid #fed7aa; border-radius: .5rem; background: #fff7ed; padding: .75rem; color: #9a3412; font-size: .75rem; } .result, .actions { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; border-top: 1px solid #f1f5f9; padding-top: .75rem; font-size: .75rem; } .result span { color: #64748b; font-family: monospace; }
</style>
