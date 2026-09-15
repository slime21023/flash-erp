<script lang="ts">
  import { onMount } from 'svelte'
  import { API_BASE, fetchModules } from '../lib/api.js'
  import type { ModuleManifest } from '../lib/types.js'

  let modules = $state<ModuleManifest[]>([])
  let loading = $state(true)
  let selectedCategory = $state<string>('ALL')

  onMount(async () => {
    try {
      const data = await fetchModules()
      modules = data.modules
    } finally {
      loading = false
    }
  })

  const categories = ['ALL', 'Operations', 'Supply Chain', 'Financials', 'System']

  const filteredModules = $derived(
    selectedCategory === 'ALL'
      ? modules
      : modules.filter((m) => m.category === selectedCategory)
  )
</script>

<div class="p-6 max-w-7xl mx-auto space-y-6">
  <!-- Top Hero Banner -->
  <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div class="space-y-1">
      <div class="flex items-center space-x-2">
        <span class="px-2 py-0.5 text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
          Apache-2.0 Licensed
        </span>
        <span class="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
          9 Modules Active
        </span>
        <span class="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
          Pure Clean Slate
        </span>
      </div>
      <h1 class="text-2xl font-black tracking-tight text-slate-50">
        FlashERP 開源應用中心與系統總覽 (App Store)
      </h1>
      <p class="text-xs text-slate-300 max-w-2xl">
        單體模組架構（Modular Monolith）＋ 契約優先（Contract-First）＋ ROP 鐵路導向感知 ACID 交易傳播，所有核心模組均通過 fast-check 性質測試守衛。
      </p>
    </div>

    <div class="flex items-center space-x-2">
      <a
        href={`${API_BASE}/api/docs`}
        target="_blank"
        rel="noreferrer"
        class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition flex items-center space-x-1.5"
      >
        <span>📖 OpenAPI / Swagger</span>
      </a>
    </div>
  </div>

  <!-- Category Pills Filter -->
  <div class="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200">
    <div class="flex items-center space-x-1.5 overflow-x-auto">
      {#each categories as cat}
        <button
          onclick={() => selectedCategory = cat}
          class="px-3 py-1 rounded-full text-xs font-semibold transition {selectedCategory === cat ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}"
        >
          {cat}
        </button>
      {/each}
    </div>
    <span class="text-xs text-slate-500">
      依賴拓撲已解析（{filteredModules.length} 個模組）
    </span>
  </div>

  <!-- Modules Grid -->
  {#if loading}
    <div class="py-12 text-center text-slate-400 text-sm">正在載入模組清單...</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredModules as m, idx}
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition p-5 flex flex-col justify-between space-y-4">
          <div class="space-y-2">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">#{idx + 1} • {m.category}</span>
                <h3 class="font-bold text-sm text-slate-900">{m.name}</h3>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                v{m.version}
              </span>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed">{m.summary}</p>
          </div>

          <div class="space-y-2 pt-3 border-t border-slate-100 text-[11px]">
            <div class="flex items-center justify-between text-slate-500">
              <span>依賴模組 (dependsOn):</span>
              <span class="font-mono text-[10px] text-slate-700">
                {m.dependsOn.length > 0 ? m.dependsOn.join(', ') : 'None (Root Base)'}
              </span>
            </div>
            <div class="flex items-center justify-between text-slate-500">
              <span>作者 (Author):</span>
              <span class="text-slate-700">{m.author}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
