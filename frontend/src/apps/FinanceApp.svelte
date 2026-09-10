<script lang="ts">
  let accounts = $state([
    { code: '1100', name: '庫存現金與銀行存款', category: 'ASSET', debit: 4500000, credit: 0 },
    { code: '1130', name: '應收帳款 (Accounts Receivable)', category: 'ASSET', debit: 1200000, credit: 0 },
    { code: '1210', name: '原材料存貨 (Raw Materials)', category: 'ASSET', debit: 850000, credit: 0 },
    { code: '1220', name: '製成品存貨 (Finished Goods)', category: 'ASSET', debit: 1650000, credit: 0 },
    { code: '1230', name: '在製品存貨 (WIP)', category: 'ASSET', debit: 320000, credit: 0 },
    { code: '2100', name: '應付帳款 (Accounts Payable)', category: 'LIABILITY', debit: 0, credit: 1520000 },
    { code: '3100', name: '股本 (Capital Stock)', category: 'EQUITY', debit: 0, credit: 5000000 },
    { code: '4100', name: '銷貨收入 (Sales Revenue)', category: 'REVENUE', debit: 0, credit: 3200000 },
    { code: '5100', name: '銷貨成本 (COGS)', category: 'EXPENSE', debit: 1200000, credit: 0 },
  ])

  const totalDebit = $derived(accounts.reduce((acc, a) => acc + a.debit, 0))
  const totalCredit = $derived(accounts.reduce((acc, a) => acc + a.credit, 0))
  const isBalanced = $derived(totalDebit === totalCredit)
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">會計總帳核心 (General Ledger)</span>
      <h2 class="text-xl font-extrabold text-slate-900">複式簿記試算表 (Trial Balance)</h2>
      <p class="text-xs text-slate-500">所有業務單據過帳均嚴格守護借貸平衡不變量：∑ Debit ≡ ∑ Credit</p>
    </div>

    <div class="flex items-center space-x-2">
      <div class="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-2 {isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'}">
        <span class="w-2 h-2 rounded-full {isBalanced ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
        <span>{isBalanced ? '借貸完全平衡 (Balanced)' : '不平衡 (Unbalanced)'}</span>
      </div>
    </div>
  </div>

  <!-- Trial Balance Table -->
  <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
    <table class="w-full text-left text-xs border-collapse">
      <thead>
        <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
          <th class="py-3 px-4">科目代碼</th>
          <th class="py-3 px-4">會計科目名稱</th>
          <th class="py-3 px-4">類別</th>
          <th class="py-3 px-4 text-right">借方金額 (Debit TWD)</th>
          <th class="py-3 px-4 text-right">貸方金額 (Credit TWD)</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each accounts as acc}
          <tr class="hover:bg-slate-50/60">
            <td class="py-2.5 px-4 font-mono font-semibold text-slate-800">{acc.code}</td>
            <td class="py-2.5 px-4 font-medium text-slate-900">{acc.name}</td>
            <td class="py-2.5 px-4 text-slate-500">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                {acc.category}
              </span>
            </td>
            <td class="py-2.5 px-4 text-right font-mono font-medium text-slate-900">
              {acc.debit > 0 ? acc.debit.toLocaleString() : '-'}
            </td>
            <td class="py-2.5 px-4 text-right font-mono font-medium text-slate-900">
              {acc.credit > 0 ? acc.credit.toLocaleString() : '-'}
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="bg-slate-100/80 border-t-2 border-slate-300 font-black text-sm text-slate-900">
          <td colspan="3" class="py-3 px-4 text-right">合計 (Total):</td>
          <td class="py-3 px-4 text-right font-mono text-emerald-700">
            NT$ {totalDebit.toLocaleString()}
          </td>
          <td class="py-3 px-4 text-right font-mono text-emerald-700">
            NT$ {totalCredit.toLocaleString()}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>
