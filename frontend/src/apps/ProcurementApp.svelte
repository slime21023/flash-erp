<script lang="ts">
  import Statusbar from '../lib/components/Statusbar.svelte'

  let currentStage = $state<'DRAFT' | 'APPROVED' | 'RECEIVED' | 'MATCHED'>('DRAFT')
  let notification = $state<string | null>(null)

  const stages = [
    { id: 'DRAFT', label: '請購審核 (PR Draft)' },
    { id: 'APPROVED', label: '採購下單 (PO Approved)' },
    { id: 'RECEIVED', label: '驗收入庫 (GR Received)' },
    { id: 'MATCHED', label: '三向匹配過帳 (AP Matched)' },
  ]

  function approvePo() {
    currentStage = 'APPROVED'
    notification = '採購訂單已核准！向供應商發出正式採購委託。'
  }

  function receiveGoods() {
    currentStage = 'RECEIVED'
    notification = '收貨入庫成功！已透過 InventoryContract.recordMovement 登記庫存入庫並記錄批次。'
  }

  function matchInvoice() {
    currentStage = 'MATCHED'
    notification = '三向匹配成功（PO vs GR vs Invoice 容差通過）！自動生成應付憑單 (AP Voucher) 及借記存貨/貸記應付帳款傳票。'
  }

  function reset() {
    currentStage = 'DRAFT'
    notification = null
  }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <Statusbar
    {stages}
    {currentStage}
    actions={[
      ...(currentStage === 'DRAFT'
        ? [{ id: 'approve', label: '核准採購單 (Approve PO)', primary: true, onClick: approvePo }]
        : []),
      ...(currentStage === 'APPROVED'
        ? [{ id: 'receive', label: '收貨驗收入庫 (Receive Goods)', primary: true, onClick: receiveGoods }]
        : []),
      ...(currentStage === 'RECEIVED'
        ? [{ id: 'match', label: '執行發票三向匹配 (3-Way Match)', primary: true, onClick: matchInvoice }]
        : []),
      { id: 'reset', label: '重設示範', onClick: reset },
    ]}
  />

  {#if notification}
    <div class="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center justify-between animate-in fade-in">
      <span>🛒 {notification}</span>
      <button onclick={() => notification = null} class="text-teal-500 hover:text-teal-700 font-bold ml-2">×</button>
    </div>
  {/if}

  <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
      <div>
        <span class="text-[10px] font-bold text-teal-600 uppercase tracking-wider">採購訂單與三向匹配 (P2P)</span>
        <h2 class="text-xl font-extrabold text-slate-900">PO-2026-0042 • 供應商：聯發科技</h2>
      </div>
      <div class="text-right">
        <span class="text-xs text-slate-400">採購單總金額 (Total)</span>
        <p class="text-2xl font-black text-slate-900">NT$ 945,000</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
      <div>
        <span class="text-slate-500 font-medium">採購人員 (Purchaser):</span>
        <p class="font-semibold text-slate-900">林經理 (採購部)</p>
      </div>
      <div>
        <span class="text-slate-500 font-medium">預定交貨倉庫 (Warehouse):</span>
        <p class="font-semibold text-slate-900">WH-MAIN (主營運倉庫)</p>
      </div>
      <div>
        <span class="text-slate-500 font-medium">三向匹配容差政策 (Tolerance):</span>
        <p class="font-semibold text-teal-700">數量 0% / 單價 ±1% 內自動允收</p>
      </div>
    </div>
  </div>
</div>
