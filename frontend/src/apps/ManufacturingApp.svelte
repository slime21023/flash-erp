<script lang="ts">
  import Statusbar from '../lib/components/Statusbar.svelte'

  let currentStage = $state<'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED'>('DRAFT')
  let plannedQty = $state(50)
  let notification = $state<string | null>(null)

  const stages = [
    { id: 'DRAFT', label: '草稿 (Draft)' },
    { id: 'RELEASED', label: '已下達 (Released)' },
    { id: 'IN_PROGRESS', label: '領料生產中 (In Progress)' },
    { id: 'COMPLETED', label: '完工入庫 (Completed)' },
  ]

  // BOM with ceiling calculation
  const bomComponents = [
    { sku: 'RAW-CHIP', name: '主晶片組', qtyPerBase: 1, scrapBps: 200 }, // 2% scrap
    { sku: 'RAW-PCB', name: '多層印刷電路板', qtyPerBase: 1, scrapBps: 100 }, // 1% scrap
    { sku: 'RAW-CAP', name: '固態電容', qtyPerBase: 8, scrapBps: 500 }, // 5% scrap
  ]

  function releaseOrder() {
    currentStage = 'RELEASED'
    notification = '工單已下達！依 BOM 需求展算引擎 (BomExplosionEngine) 完成天花板整數除法算料。'
  }

  function issueMaterials() {
    currentStage = 'IN_PROGRESS'
    notification = '原料已扣庫出庫！自動生成借記在製品 (WIP)、貸記原材料 (Raw Materials) 之會計傳票。'
  }

  function completeOrder() {
    currentStage = 'COMPLETED'
    notification = '完工入庫完成！自動產生成品入庫及在製品轉產成品結轉傳票，無尾差製費分攤準備就緒。'
  }

  function reset() {
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
        ? [{ id: 'release', label: '下達生產工單 (Release WO)', primary: true, onClick: releaseOrder }]
        : []),
      ...(currentStage === 'RELEASED'
        ? [{ id: 'issue', label: '領料出庫 (Issue Materials)', primary: true, onClick: issueMaterials }]
        : []),
      ...(currentStage === 'IN_PROGRESS'
        ? [{ id: 'complete', label: '工單完工入庫 (Complete WO)', primary: true, onClick: completeOrder }]
        : []),
      { id: 'reset', label: '重設示範', onClick: reset },
    ]}
  />

  {#if notification}
    <div class="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between animate-in fade-in">
      <span>⚙️ {notification}</span>
      <button onclick={() => notification = null} class="text-rose-500 hover:text-rose-700 font-bold ml-2">×</button>
    </div>
  {/if}

  <!-- Header -->
  <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
      <div>
        <span class="text-[10px] font-bold text-rose-600 uppercase tracking-wider">生產工單 (Work Order)</span>
        <h2 class="text-xl font-extrabold text-slate-900">WO-2026-0008 • 邊緣運算伺服器 (成品)</h2>
      </div>
      <div class="text-right">
        <span class="text-xs text-slate-400">計劃生產數量</span>
        <p class="text-2xl font-black text-slate-900">{plannedQty} <span class="text-xs font-medium text-slate-500">台</span></p>
      </div>
    </div>

    <!-- BOM Explosion Calculation Table -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold text-slate-700">物料清單需求展算 (BOM Explosion with Ceiling Division)</h3>
        <span class="text-[11px] text-slate-400 font-mono">Planned = ⌈(Target × Qty × (10000 + scrapBps)) / 10000⌉</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold">
              <th class="py-2.5 px-3">子料件 SKU</th>
              <th class="py-2.5 px-3">料品規格</th>
              <th class="py-2.5 px-3 text-right">基準用量</th>
              <th class="py-2.5 px-3 text-right">損耗率 (bps)</th>
              <th class="py-2.5 px-3 text-right font-bold text-slate-900">向上取整計劃發料量</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each bomComponents as comp}
              {@const req = Math.ceil((plannedQty * comp.qtyPerBase * (10000 + comp.scrapBps)) / 10000)}
              <tr class="hover:bg-slate-50/70">
                <td class="py-2.5 px-3 font-mono font-medium text-slate-800">{comp.sku}</td>
                <td class="py-2.5 px-3 text-slate-700">{comp.name}</td>
                <td class="py-2.5 px-3 text-right text-slate-700">{comp.qtyPerBase}</td>
                <td class="py-2.5 px-3 text-right text-slate-500 font-mono">{comp.scrapBps / 100}%</td>
                <td class="py-2.5 px-3 text-right font-bold text-rose-700 font-mono">{req}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
