<script lang="ts">
  import { onMount } from 'svelte'
  import { API_BASE, fetchModules } from '../lib/api.js'
  import type { ModuleManifest } from '../lib/types.js'

  let modules = $state<ModuleManifest[]>([])
  let loading = $state(true)
  let loadError = $state('')
  let selectedCategory = $state<string>('ALL')

  onMount(async () => {
    try {
      const data = await fetchModules()
      modules = data.modules
    } catch (error) {
      loadError = error instanceof Error ? error.message : '無法載入模組清單'
    } finally {
      loading = false
    }
  })

  const categories = ['ALL', 'Operations', 'Supply Chain', 'Financials', 'System']

  const filteredModules = $derived(
    selectedCategory === 'ALL' ? modules : modules.filter((m) => m.category === selectedCategory)
  )
</script>

<div class="erp-page">
  <section class="hero is-primary is-small mb-5" style="border-radius: var(--bulma-radius-large)">
    <div class="hero-body">
      <div class="tags mb-3">
        <span class="tag is-primary is-light">Apache-2.0 Licensed</span>
        <span class="tag is-success is-light">9 Modules Active</span>
        <span class="tag is-warning is-light">Pure Clean Slate</span>
      </div>
      <h1 class="title is-4 has-text-white">FlashERP 開源應用中心與系統總覽 (App Store)</h1>
      <p class="is-size-7 has-text-white" style="max-width: 48rem">
        單體模組架構（Modular Monolith）＋ 契約優先（Contract-First）＋ ROP 鐵路導向感知 ACID
        交易傳播，所有核心模組均通過 fast-check 性質測試守衛。
      </p>
      <a
        href={`${API_BASE}/api/docs`}
        target="_blank"
        rel="noreferrer"
        class="button is-light is-small mt-4"
      >
        <span>OpenAPI / Swagger</span>
      </a>
    </div>
  </section>

  <div
    class="is-flex is-flex-wrap-wrap is-align-items-center is-justify-content-space-between mb-4"
    style="gap: 0.75rem; border-bottom: 1px solid var(--bulma-border); padding-bottom: 0.75rem"
  >
    <div class="buttons are-small mb-0">
      {#each categories as cat}
        <button
          onclick={() => (selectedCategory = cat)}
          class="button {selectedCategory === cat ? 'is-primary' : 'is-light'}"
        >
          {cat}
        </button>
      {/each}
    </div>
    <span class="is-size-7 has-text-grey-dark">
      依賴拓撲已解析（{filteredModules.length}
      個模組）
    </span>
  </div>

  {#if loadError}
    <div class="notification is-danger is-light" role="alert">{loadError}</div>
  {/if}

  {#if loading}
    <div class="has-text-centered py-6 has-text-grey is-size-7">正在載入模組清單...</div>
  {:else}
    <div class="columns is-multiline">
      {#each filteredModules as m, idx}
        <div class="column is-half-tablet is-one-third-desktop">
          <article class="card" style="height: 100%">
            <div
              class="card-content is-flex is-flex-direction-column"
              style="height: 100%; gap: 1rem"
            >
              <div
                class="is-flex is-align-items-flex-start is-justify-content-space-between"
                style="gap: 0.75rem"
              >
                <div>
                  <span class="is-size-7 has-text-grey">#{idx + 1} · {m.category}</span>
                  <h3 class="has-text-weight-bold is-size-6">{m.name}</h3>
                </div>
                <span class="tag is-success is-light"> v{m.version} </span>
              </div>
              <p class="is-size-7 has-text-grey-dark" style="line-height: 1.6">{m.summary}</p>
              <div
                class="mt-auto pt-3"
                style="border-top: 1px solid var(--bulma-border-weak); font-size: 0.75rem"
              >
                <div class="is-flex is-justify-content-space-between" style="gap: 0.75rem">
                  <span class="has-text-grey">依賴模組:</span>
                  <span class="erp-code has-text-right"
                    >{m.dependsOn.length > 0 ? m.dependsOn.join(', ') : 'None (Root Base)'}</span
                  >
                </div>
                <div class="is-flex is-justify-content-space-between mt-2" style="gap: 0.75rem">
                  <span class="has-text-grey">作者:</span>
                  <span>{m.author}</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      {/each}
    </div>
  {/if}
</div>
