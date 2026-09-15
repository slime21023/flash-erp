<script lang="ts">
  import { ApiError, apiRequest, readAuthSession } from '../lib/api.js'

  type JournalEntry = { id: string; companyId: string; number: string; status: string; currency: string; totalDebitMinorUnits: string; totalCreditMinorUnits: string }
  const session = readAuthSession()
  let companyId = $state(session?.user.organizationUnitIds[0] ?? '')
  let accountId = $state(''); let accountCode = $state(''); let accountName = $state(''); let normalBalance = $state<'DEBIT' | 'CREDIT'>('DEBIT')
  let periodId = $state(''); let periodCode = $state(''); let startsOn = $state(`${new Date().getFullYear()}-01-01`); let endsOn = $state(`${new Date().getFullYear()}-12-31`)
  let currency = $state('TWD')
  let journalId = $state(''); let journalNumber = $state(''); let accountingDate = $state(new Date().toISOString().slice(0, 10)); let debitAccountId = $state(''); let creditAccountId = $state(''); let amountMinorUnits = $state('0'); let memo = $state('')
  let journal = $state<JournalEntry | null>(null); let message = $state<string | null>(null); let busy = $state(false)

  function errorMessage(error: unknown) { return error instanceof ApiError || error instanceof Error ? error.message : '操作失敗' }
  async function run(action: () => Promise<void>) { busy = true; message = null; try { await action() } catch (error) { message = errorMessage(error) } finally { busy = false } }

  async function createAccount() { await run(async () => { const account = await apiRequest<{ id: string }>('/finance/accounts', { method: 'POST', body: { id: accountId, companyId, code: accountCode, name: accountName, normalBalance } }); accountId = account.id; message = `科目 ${account.id} 已建立。` }) }
  async function createPeriod() { await run(async () => { const period = await apiRequest<{ id: string }>('/finance/accounting-periods', { method: 'POST', body: { id: periodId, companyId, code: periodCode, startsOn, endsOn } }); periodId = period.id; message = `會計期間 ${period.id} 已建立。` }) }
  async function configureCurrency() { await run(async () => { await apiRequest('/finance/company-accounting-settings', { method: 'POST', body: { companyId, baseCurrency: currency } }); message = `${companyId} 的基準幣別已設定為 ${currency}。` }) }
  async function createJournal() { await run(async () => { journalId = journalId || `je-${crypto.randomUUID()}`; journalNumber = journalNumber || `JE-${Date.now()}`; const created = await apiRequest<JournalEntry>('/finance/journal-entries', { method: 'POST', body: { id: journalId, companyId, number: journalNumber, accountingDate, currency, memo: memo || undefined, lines: [{ accountId: debitAccountId, debitMinorUnits: amountMinorUnits, creditMinorUnits: '0' }, { accountId: creditAccountId, debitMinorUnits: '0', creditMinorUnits: amountMinorUnits }] } }); journal = created; message = `傳票 ${created.number} 已建立。` }) }
  async function postJournal() { const current = journal; if (!current) return; await run(async () => { const posted = await apiRequest<JournalEntry>(`/finance/journal-entries/${encodeURIComponent(current.id)}/post`, { method: 'POST' }); journal = posted; message = `傳票 ${posted.number} 已過帳。` }) }
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div><span class="label">財務會計總帳 (Finance)</span><h2 class="title">科目、期間與複式傳票</h2><p class="hint">借貸金額使用最小貨幣單位；過帳前請先建立科目與開放期間。</p></div>
  {#if message}<div class="message" role="status">{message}</div>{/if}

  <section class="panel"><h3>公司設定與科目</h3><div class="grid"><label>公司 ID<input bind:value={companyId} /></label><label>基準幣別<input bind:value={currency} maxlength="3" /></label><button onclick={configureCurrency} disabled={busy}>設定基準幣別</button></div><div class="grid border-t border-slate-100 pt-3"><label>科目 ID<input bind:value={accountId} /></label><label>科目代碼<input bind:value={accountCode} /></label><label>科目名稱<input bind:value={accountName} /></label><label>正常餘額<select bind:value={normalBalance}><option value="DEBIT">DEBIT</option><option value="CREDIT">CREDIT</option></select></label><button onclick={createAccount} disabled={busy}>建立科目</button></div></section>

  <section class="panel"><h3>會計期間</h3><div class="grid"><label>期間 ID<input bind:value={periodId} /></label><label>期間代碼<input bind:value={periodCode} placeholder="FY2026" /></label><label>開始日<input bind:value={startsOn} type="date" /></label><label>結束日<input bind:value={endsOn} type="date" /></label><button onclick={createPeriod} disabled={busy}>建立期間</button></div></section>

  <section class="panel"><h3>建立與過帳傳票</h3><div class="grid"><label>傳票 ID<input bind:value={journalId} placeholder="留白自動產生" /></label><label>傳票號碼<input bind:value={journalNumber} placeholder="留白自動產生" /></label><label>會計日<input bind:value={accountingDate} type="date" /></label><label>借方科目 ID<input bind:value={debitAccountId} /></label><label>貸方科目 ID<input bind:value={creditAccountId} /></label><label>金額（最小單位）<input bind:value={amountMinorUnits} inputmode="numeric" /></label><label>摘要<input bind:value={memo} /></label><button onclick={createJournal} disabled={busy}>建立草稿</button></div>{#if journal}<div class="result"><pre>{JSON.stringify(journal, null, 2)}</pre><button onclick={postJournal} disabled={busy || journal.status !== 'DRAFT'}>過帳</button></div>{/if}</section>
</div>

<style>
  .label { font-size: .625rem; font-weight: 700; color: #4338ca; text-transform: uppercase; letter-spacing: .08em; } .title { margin-top: .25rem; font-size: 1.25rem; font-weight: 800; } .hint { margin-top: .25rem; color: #64748b; font-size: .75rem; } .panel { display: grid; gap: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: .75rem; padding: 1.25rem; } h3 { font-size: .875rem; font-weight: 700; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; font-size: .75rem; } label { display: grid; gap: .25rem; color: #475569; } input, select { width: 100%; border: 1px solid #cbd5e1; border-radius: .5rem; padding: .5rem .625rem; } button { align-self: end; border-radius: .5rem; background: #4f46e5; color: white; padding: .5rem .75rem; font-size: .75rem; font-weight: 700; } button:disabled { opacity: .5; } .message { border: 1px solid #c7d2fe; border-radius: .5rem; background: #eef2ff; padding: .75rem; color: #3730a3; font-size: .75rem; } .result { display: flex; align-items: end; gap: .75rem; border-top: 1px solid #f1f5f9; padding-top: .75rem; } pre { overflow: auto; max-width: 100%; flex: 1; border-radius: .5rem; background: #0f172a; padding: .75rem; color: #e2e8f0; font-size: .75rem; }
</style>
