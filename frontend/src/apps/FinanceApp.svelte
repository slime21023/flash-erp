<script lang="ts">
  import { api, readAuthSession, type Api } from '../lib/api.js'

  type JournalEntry = Awaited<ReturnType<Api['finance']['journalEntries']['store']>>
  const session = readAuthSession()
  let companyId = $state(session?.user.organizationUnitIds[0] ?? '')
  let accountId = $state(''); let accountCode = $state(''); let accountName = $state(''); let normalBalance = $state<'DEBIT' | 'CREDIT'>('DEBIT')
  let periodId = $state(''); let periodCode = $state(''); let startsOn = $state(`${new Date().getFullYear()}-01-01`); let endsOn = $state(`${new Date().getFullYear()}-12-31`)
  let currency = $state('TWD')
  let journalId = $state(''); let journalNumber = $state(''); let accountingDate = $state(new Date().toISOString().slice(0, 10)); let debitAccountId = $state(''); let creditAccountId = $state(''); let amountMinorUnits = $state('0'); let memo = $state('')
  let journal = $state<JournalEntry | null>(null); let message = $state<string | null>(null); let busy = $state(false)

  function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失敗' }
  async function run(action: () => Promise<void>) { busy = true; message = null; try { await action() } catch (error) { message = errorMessage(error) } finally { busy = false } }

  async function createAccount() { await run(async () => { const account = await api.finance.accounts.store({ id: accountId, companyId, code: accountCode, name: accountName, normalBalance }, { context: { organizationUnitId: companyId } }); accountId = account.id; message = `科目 ${account.id} 已建立。` }) }
  async function createPeriod() { await run(async () => { const period = await api.finance.accountingPeriods.store({ id: periodId, companyId, code: periodCode, startsOn, endsOn }, { context: { organizationUnitId: companyId } }); periodId = period.id; message = `會計期間 ${period.id} 已建立。` }) }
  async function configureCurrency() { await run(async () => { await api.finance.companyAccountingSettings.store({ companyId, baseCurrency: currency }, { context: { organizationUnitId: companyId } }); message = `${companyId} 的基準幣別已設定為 ${currency}。` }) }
  async function createJournal() { await run(async () => { journalId = journalId || `je-${crypto.randomUUID()}`; journalNumber = journalNumber || `JE-${Date.now()}`; const created = await api.finance.journalEntries.store({ id: journalId, companyId, number: journalNumber, accountingDate, currency, memo: memo || undefined, lines: [{ accountId: debitAccountId, debitMinorUnits: amountMinorUnits, creditMinorUnits: '0' }, { accountId: creditAccountId, debitMinorUnits: '0', creditMinorUnits: amountMinorUnits }] }, { context: { organizationUnitId: companyId } }); journal = created; message = `傳票 ${created.number} 已建立。` }) }
  async function postJournal() { const current = journal; if (!current) return; await run(async () => { const posted = await api.finance.journalEntries.post({ id: current.id }, { context: { organizationUnitId: current.companyId } }); journal = posted; message = `傳票 ${posted.number} 已過帳。` }) }
</script>

<div class="erp-page">
  <header class="erp-page-header"><span class="erp-eyebrow">財務會計總帳 (Finance)</span><h2 class="erp-page-title">科目、期間與複式傳票</h2><p class="erp-page-hint">借貸金額使用最小貨幣單位；過帳前請先建立科目與開放期間。</p></header>
  {#if message}<div class="notification is-info is-light py-3" role="status">{message}</div>{/if}

  <section class="erp-panel"><h3 class="erp-panel-title">公司設定與科目</h3><div class="erp-form-grid"><label>公司 ID<input class="input" bind:value={companyId} /></label><label>基準幣別<input class="input" bind:value={currency} maxlength="3" /></label><button class="button is-primary" onclick={configureCurrency} disabled={busy}>設定基準幣別</button></div><div class="erp-form-grid"><label>科目 ID<input class="input" bind:value={accountId} /></label><label>科目代碼<input class="input" bind:value={accountCode} /></label><label>科目名稱<input class="input" bind:value={accountName} /></label><label>正常餘額<div class="select is-fullwidth"><select bind:value={normalBalance}><option value="DEBIT">DEBIT</option><option value="CREDIT">CREDIT</option></select></div></label><button class="button is-primary" onclick={createAccount} disabled={busy}>建立科目</button></div></section>

  <section class="erp-panel"><h3 class="erp-panel-title">會計期間</h3><div class="erp-form-grid"><label>期間 ID<input class="input" bind:value={periodId} /></label><label>期間代碼<input class="input" bind:value={periodCode} placeholder="FY2026" /></label><label>開始日<input class="input" bind:value={startsOn} type="date" /></label><label>結束日<input class="input" bind:value={endsOn} type="date" /></label><button class="button is-primary" onclick={createPeriod} disabled={busy}>建立期間</button></div></section>

  <section class="erp-panel"><h3 class="erp-panel-title">建立與過帳傳票</h3><div class="erp-form-grid"><label>傳票 ID<input class="input" bind:value={journalId} placeholder="留白自動產生" /></label><label>傳票號碼<input class="input" bind:value={journalNumber} placeholder="留白自動產生" /></label><label>會計日<input class="input" bind:value={accountingDate} type="date" /></label><label>借方科目 ID<input class="input" bind:value={debitAccountId} /></label><label>貸方科目 ID<input class="input" bind:value={creditAccountId} /></label><label>金額（最小單位）<input class="input" bind:value={amountMinorUnits} inputmode="numeric" /></label><label>摘要<input class="input" bind:value={memo} /></label><button class="button is-primary" onclick={createJournal} disabled={busy}>建立草稿</button></div>{#if journal}<div class="erp-result"><pre>{JSON.stringify(journal, null, 2)}</pre><button class="button is-link" onclick={postJournal} disabled={busy || journal.status !== 'DRAFT'}>過帳</button></div>{/if}</section>
</div>
