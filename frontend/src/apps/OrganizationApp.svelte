<script lang="ts">
  let orgNodes = [
    { id: 'org-root', code: 'HQ', name: 'FlashERP 企業總部 (Enterprise Headquarters)', kind: 'COMPANY', level: 0 },
    { id: 'org-site-tp', code: 'SITE-TPE', name: '台北製造廠區 (Taipei Plant)', kind: 'FACTORY', level: 1 },
    { id: 'org-wh-main', code: 'WH-MAIN', name: '主原料營運倉 (Raw Materials)', kind: 'WAREHOUSE', level: 2 },
    { id: 'org-wh-fg', code: 'WH-FG', name: '產成品保稅倉 (Finished Goods)', kind: 'WAREHOUSE', level: 2 },
    { id: 'org-site-kh', code: 'SITE-KHH', name: '高雄物流配送中心 (Logistics Center)', kind: 'FACTORY', level: 1 },
    { id: 'org-wh-kh', code: 'WH-KHH', name: '南部轉運倉 (Southern Hub)', kind: 'WAREHOUSE', level: 2 },
  ]
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div>
    <span class="text-[10px] font-bold text-slate-600 uppercase tracking-wider">組織權限基礎 (Organization)</span>
    <h2 class="text-xl font-extrabold text-slate-900">多公司、廠區與倉儲階層樹狀架構</h2>
    <p class="text-xs text-slate-500">所有用例均支援組織作用域隔離與嚴格所有權校驗</p>
  </div>

  <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
    {#each orgNodes as node}
      <div
        class="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition"
        style="margin-left: {node.level * 24}px"
      >
        <div class="flex items-center space-x-3">
          <span class="text-sm">
            {#if node.kind === 'COMPANY'}🏢
            {:else if node.kind === 'FACTORY'}🏭
            {:else}📦
            {/if}
          </span>
          <div>
            <span class="font-bold text-xs text-slate-900">{node.name}</span>
            <span class="text-[11px] font-mono text-slate-400 ml-2">[{node.code}]</span>
          </div>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600">
          {node.kind}
        </span>
      </div>
    {/each}
  </div>
</div>
