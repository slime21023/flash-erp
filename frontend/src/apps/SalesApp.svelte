<script lang="ts">
  import Statusbar from '../lib/components/Statusbar.svelte'

  let currentStage = $state<'DRAFT' | 'CONFIRMED' | 'SHIPPED'>('DRAFT')
  let customerName = $state('台灣積體電路製造股份有限公司')
  let creditLimit = $state(5000000)
  let currentBalance = $state(1200000)
  let notification = $state<string | null>(null)

  const stages = [
    { id: 'DRAFT', label: '草稿 (Draft)' },
    { id: 'CONFIRMED', label: '已確認 (Confirmed)' },
    { id: 'SHIPPED', label: '已出庫 (Shipped)' },
  ]

  let lines = $state([
    { sku: 'SKU-CPU-01', desc: '高效能工業處理器', qty: 10, unitPrice: 25000 },
    { sku: 'SKU-RAM-16', desc: 'ECC 伺服器記憶體 16GB', qty: 20, unitPrice: 4500 },
  ])

  const subtotal = $derived(lines.reduce((acc, line) => acc + line.qty * line.unitPrice, 0))
  const tax = $derived(Math.round(subtotal * 0.05))
  const total = $derived(subtotal + tax)

  function confirmOrder() {
    if (currentBalance + total > creditLimit) {
      notification = `信用檢查失敗：訂單金額 NT$ ${total.toLocaleString()} 將超出客戶信用額度！`
      return
    }
    currentStage = 'CONFIRMED'
    notification = '訂單確認成功！已透過 InventoryContract.reserve 鎖定可用庫存 (ATP)。'
  }

  function createShipment() {
    currentStage = 'SHIPPED'
    notification = '出庫單建立成功！已扣減庫存並自動拋轉財務 AR 應收帳款與 COGS 銷貨成本傳票草稿。'
  }

  function resetOrder() {
    currentStage = 'DRAFT'
    notification = null
  }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <!-- Statusbar -->
  <Statusbar
    {stages}
    {currentStage}
    actions={[
      ...(currentStage === 'DRAFT'
        ? [{ id: 'confirm', label: '審核確認訂單 (Confirm SO)', primary: true, onClick: confirmOrder }]
        : []),
      ...(currentStage === 'CONFIRMED'
        ? [{ id: 'ship', label: '銷貨出庫交運 (Create Shipment)', primary: true, onClick: createShipment }]
        : []),
      { id: 'reset', label: '重設示範', onClick: resetOrder },
    ]}
  />

  {#if notification}
    <div class="p-3.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between animate-in fade-in">
      <span>💡 {notification}</span>
      <button onclick={() => notification = null} class="text-indigo-500 hover:text-indigo-700 font-bold ml-2">×</button>
    </div>
  {/if}

  <!-- Order Header Form -->
  <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
      <div>
        <span class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">銷售訂單 (Sales Order)</span>
        <h2 class="text-xl font-extrabold text-slate-900">SO-2026-0001</h2>
      </div>
      <div class="text-right">
        <span class="text-xs text-slate-400">訂單總金額 (Total)</span>
        <p class="text-2xl font-black text-slate-900">NT$ {total.toLocaleString()}</p>
      </div>
    </div>

    <!-- Header Fields Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
      <div class="space-y-1">
        <span class="text-slate-500 font-medium">客戶名稱 (Customer):</span>
        <p class="font-semibold text-slate-900">{customerName}</p>
      </div>
      <div class="space-y-1">
        <span class="text-slate-500 font-medium">信用額度與餘額 (Credit Limit):</span>
        <p class="font-semibold text-slate-900">
          NT$ {currentBalance.toLocaleString()} / NT$ {creditLimit.toLocaleString()}
          <span class="text-[10px] text-emerald-600 font-bold ml-1">(良好)</span>
        </p>
      </div>
      <div class="space-y-1">
        <span class="text-slate-500 font-medium">出貨發料倉庫 (Warehouse):</span>
        <p class="font-semibold text-slate-900">WH-MAIN (主營運倉庫)</p>
      </div>
    </div>

    <!-- Order Lines Table -->
    <div class="overflow-x-auto pt-2">
      <table class="w-full text-left text-xs border-collapse">
        <thead>
          <tr class="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold">
            <th class="py-2.5 px-3">料號 SKU</th>
            <th class="py-2.5 px-3">品名規格</th>
            <th class="py-2.5 px-3 text-right">數量</th>
            <th class="py-2.5 px-3 text-right">單價 (TWD)</th>
            <th class="py-2.5 px-3 text-right">金額小計 (TWD)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each lines as line}
            <tr class="hover:bg-slate-50/70">
              <td class="py-2.5 px-3 font-mono font-medium text-slate-800">{line.sku}</td>
              <td class="py-2.5 px-3 text-slate-700">{line.desc}</td>
              <td class="py-2.5 px-3 text-right font-semibold text-slate-900">{line.qty}</td>
              <td class="py-2.5 px-3 text-right text-slate-700">{line.unitPrice.toLocaleString()}</td>
              <td class="py-2.5 px-3 text-right font-bold text-slate-900">
                {(line.qty * line.unitPrice).toLocaleString()}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Order Summary Totals -->
    <div class="flex justify-end pt-4 border-t border-slate-100">
      <div class="w-64 space-y-1.5 text-xs text-slate-600">
        <div class="flex justify-between">
          <span>未稅小計 (Subtotal):</span>
          <span class="font-semibold text-slate-900">NT$ {subtotal.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span>營業稅 5% (VAT):</span>
          <span class="font-semibold text-slate-900">NT$ {tax.toLocaleString()}</span>
        </div>
        <div class="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
          <span>應付總計 (Total):</span>
          <span class="text-indigo-600">NT$ {total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  </div>
</div>
