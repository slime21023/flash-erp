<script lang="ts">
  import { api, readAuthSession, type Api } from '../lib/api.js'

  type OrganizationUnit = Awaited<ReturnType<Api['organization']['units']['find']>>

  const session = readAuthSession()
  let id = $state('')
  let code = $state('')
  let name = $state('')
  let kind = $state<OrganizationUnit['kind']>('COMPANY')
  let parentId = $state('')
  let lookupId = $state(session?.user.organizationUnitIds[0] ?? '')
  let unit = $state<OrganizationUnit | null>(null)
  let message = $state<string | null>(null)
  let busy = $state(false)

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : '操作失敗'
  }

  async function register() {
    if (!id.trim() || !code.trim() || !name.trim()) {
      message = 'ID、代碼與名稱為必填。'
      return
    }
    busy = true
    message = null
    try {
      unit = await api.organization.units.register({ id, code, name, kind, parentId: parentId.trim() || null })
      lookupId = unit.id
      message = `組織單位 ${unit.code} 已建立。`
    } catch (error) {
      message = errorMessage(error)
    } finally {
      busy = false
    }
  }

  async function lookup() {
    if (!lookupId.trim()) {
      message = '請輸入組織單位 ID。'
      return
    }
    busy = true
    message = null
    try {
      unit = await api.organization.units.find({ id: lookupId })
      message = `已載入 ${unit.name}。`
    } catch (error) {
      unit = null
      message = errorMessage(error)
    } finally {
      busy = false
    }
  }
</script>

<div class="erp-page">
  <header class="erp-page-header">
    <span class="erp-eyebrow">組織權限基礎 (Organization)</span>
    <h2 class="erp-page-title">組織單位</h2>
    <p class="erp-page-hint">目前頁面直接讀寫 organization API，不再使用示範樹狀資料。</p>
  </header>

  {#if message}<div class="notification is-info is-light py-3" role="status">{message}</div>{/if}

  <section class="erp-panel">
    <h3 class="erp-panel-title">建立組織單位</h3>
    <div class="erp-form-grid">
      <label>ID<input class="input" bind:value={id} placeholder="org-..." /></label>
      <label>代碼<input class="input" bind:value={code} placeholder="HQ" /></label>
      <label>名稱<input class="input" bind:value={name} placeholder="Headquarters" /></label>
      <label>類型<div class="select is-fullwidth"><select bind:value={kind}><option value="COMPANY">COMPANY</option><option value="PLANT">PLANT</option><option value="WAREHOUSE">WAREHOUSE</option></select></div></label>
      <label>父節點 ID<input class="input" bind:value={parentId} placeholder="可留白" /></label>
      <button class="button is-primary" onclick={register} disabled={busy}>建立</button>
    </div>
  </section>

  <section class="erp-panel">
    <div class="is-flex is-align-items-center is-justify-content-space-between" style="gap: 1rem"><h3 class="erp-panel-title">查詢單位</h3><button class="button is-light" onclick={lookup} disabled={busy}>載入</button></div>
    <input class="input" bind:value={lookupId} placeholder="organization unit ID" />
    {#if unit}<div class="erp-result"><pre>{JSON.stringify(unit, null, 2)}</pre></div>{/if}
  </section>
</div>
