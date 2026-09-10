<script lang="ts">
  let items = $state([
    { sku: 'SKU-CPU-01', name: '高效能工業處理器', warehouse: 'WH-MAIN', onHand: 150, reserved: 20, unitCost: 18000 },
    { sku: 'SKU-RAM-16', name: 'ECC 伺服器記憶體 16GB', warehouse: 'WH-MAIN', onHand: 300, reserved: 40, unitCost: 3200 },
    { sku: 'SKU-CASE-ATX', name: '工業級機殼 4U', warehouse: 'WH-MAIN', onHand: 80, reserved: 10, unitCost: 4500 },
    { sku: 'SKU-FG-SERVER', name: '邊緣運算伺服器 (成品)', warehouse: 'WH-FG', onHand: 25, reserved: 5, unitCost: 48000 },
  ])

  let selectedSku = $state('SKU-CPU-01')
  const selectedItem = $derived(items.find((i) => i.sku === selectedSku) ?? items[0])
  const atp = $derived(selectedItem.onHand - selectedItem.reserved)
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <span class="text-[10px] font-bold text-amber-600 uppercase tracking-wider">庫存與供應鏈 (Inventory)</span>
      <h2 class="text-xl font-extrabold text-slate-900">倉庫庫存水位與 ATP 可承諾量</h2>
      <p class="text-xs text-slate-500">以移動加權平均成本 (Moving Weighted Average) 實時重算存貨價值</p>
    </div>
  </div>

  <!-- ATP Quick Inspector -->
  <div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
    <div class="space-y-1">
      <span class="text-[10px] font-bold text-amber-800 uppercase tracking-wider">ATP 可承諾可用量快速檢核</span>
      <p class="text-sm font-semibold text-slate-900">{selectedItem.name} ({selectedItem.sku})</p>
      <p class="text-xs text-slate-600">在手庫存 {selectedItem.onHand} - 銷售已預留 {selectedItem.reserved} = 可用量 (ATP)</p>
    </div>
    <div class="text-center bg-white px-6 py-3 rounded-lg border border-amber-200 shadow-xs">
      <span class="text-[10px] text-slate-400 font-semibold uppercase">可承諾量 ATP</span>
      <p class="text-3xl font-black text-amber-600">{atp} <span class="text-xs text-slate-500 font-normal">單位</span></p>
    </div>
  </div>

  <!-- Items Table -->
  <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
    <table class="w-full text-left text-xs border-collapse">
      <thead>
        <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
          <th class="py-3 px-4">料號 SKU</th>
          <th class="py-3 px-4">料品名稱</th>
          <th class="py-3 px-4">所屬倉庫</th>
          <th class="py-3 px-4 text-right">在手存量 (On-Hand)</th>
          <th class="py-3 px-4 text-right">已預留量 (Reserved)</th>
          <th class="py-3 px-4 text-right">可用量 (ATP)</th>
          <th class="py-3 px-4 text-right">加權平均成本 (TWD)</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each items as item}
          <tr
            onclick={() => selectedSku = item.sku}
            class="hover:bg-slate-50/80 cursor-pointer transition {selectedSku === item.sku ? 'bg-amber-50/40 font-semibold' : ''}"
          >
            <td class="py-2.5 px-4 font-mono font-medium text-slate-800">{item.sku}</td>
            <td class="py-2.5 px-4 text-slate-900">{item.name}</td>
            <td class="py-2.5 px-4 font-mono text-slate-500">{item.warehouse}</td>
            <td class="py-2.5 px-4 text-right font-bold text-slate-900">{item.onHand}</td>
            <td class="py-2.5 px-4 text-right text-amber-700 font-semibold">{item.reserved}</td>
            <td class="py-2.5 px-4 text-right text-emerald-700 font-black">{item.onHand - item.reserved}</td>
            <td class="py-2.5 px-4 text-right font-mono text-slate-700">NT$ {item.unitCost.toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
