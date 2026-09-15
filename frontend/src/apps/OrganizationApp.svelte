<script lang="ts">
  import { ApiError, apiRequest, readAuthSession } from '../lib/api.js'

  type OrganizationUnit = {
    id: string
    code: string
    name: string
    kind: 'COMPANY' | 'PLANT' | 'WAREHOUSE'
    parentId?: string | null
  }

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
    return error instanceof ApiError || error instanceof Error ? error.message : '操作失敗'
  }

  async function register() {
    if (!id.trim() || !code.trim() || !name.trim()) {
      message = 'ID、代碼與名稱為必填。'
      return
    }
    busy = true
    message = null
    try {
      unit = await apiRequest<OrganizationUnit>('/organization/units', {
        method: 'POST',
        body: { id, code, name, kind, parentId: parentId.trim() || null },
      })
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
      unit = await apiRequest<OrganizationUnit>(`/organization/units/${encodeURIComponent(lookupId)}`)
      message = `已載入 ${unit.name}。`
    } catch (error) {
      unit = null
      message = errorMessage(error)
    } finally {
      busy = false
    }
  }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div>
    <span class="label">組織權限基礎 (Organization)</span>
    <h2 class="title">組織單位</h2>
    <p class="hint">目前頁面直接讀寫 organization API，不再使用示範樹狀資料。</p>
  </div>

  {#if message}<div class="message" role="status">{message}</div>{/if}

  <section class="panel">
    <h3>建立組織單位</h3>
    <div class="grid">
      <label>ID<input bind:value={id} placeholder="org-..." /></label>
      <label>代碼<input bind:value={code} placeholder="HQ" /></label>
      <label>名稱<input bind:value={name} placeholder="Headquarters" /></label>
      <label>類型<select bind:value={kind}><option value="COMPANY">COMPANY</option><option value="PLANT">PLANT</option><option value="WAREHOUSE">WAREHOUSE</option></select></label>
      <label>父節點 ID<input bind:value={parentId} placeholder="可留白" /></label>
      <button onclick={register} disabled={busy}>建立</button>
    </div>
  </section>

  <section class="panel">
    <div class="row"><h3>查詢單位</h3><button onclick={lookup} disabled={busy}>載入</button></div>
    <input bind:value={lookupId} placeholder="organization unit ID" />
    {#if unit}<pre>{JSON.stringify(unit, null, 2)}</pre>{/if}
  </section>
</div>

<style>
  .label { font-size: 0.625rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; }
  .title { margin-top: 0.25rem; font-size: 1.25rem; font-weight: 800; }
  .hint { margin-top: 0.25rem; color: #64748b; font-size: 0.75rem; }
  .panel { display: grid; gap: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1.25rem; }
  h3 { font-size: 0.875rem; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.75rem; font-size: 0.75rem; }
  label { display: grid; gap: 0.25rem; color: #475569; }
  input, select { width: 100%; border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 0.5rem 0.625rem; }
  button { align-self: end; border-radius: 0.5rem; background: #4f46e5; color: white; padding: 0.5rem 0.75rem; font-size: 0.75rem; font-weight: 700; }
  button:disabled { opacity: 0.5; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .message { border: 1px solid #c7d2fe; border-radius: 0.5rem; background: #eef2ff; padding: 0.75rem; color: #3730a3; font-size: 0.75rem; }
  pre { overflow: auto; border-radius: 0.5rem; background: #0f172a; padding: 0.75rem; color: #e2e8f0; font-size: 0.75rem; }
</style>
