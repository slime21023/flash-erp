<script lang="ts">
  let bankAccounts = $state([
    { id: 'BA-01', bank: '台灣銀行 (營業部)', accountNo: '003-004-123456', currency: 'TWD', bookBalance: 3200000, bankBalance: 3200000 },
    { id: 'BA-02', bank: '玉山銀行 (台北分行)', accountNo: '808-112-987654', currency: 'TWD', bookBalance: 1300000, bankBalance: 1300000 },
  ])

  let isReconciled = $state(true)
</script>

<div class="max-w-7xl mx-auto p-6 space-y-6">
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <span class="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">出納資金與銀行對帳 (Treasury)</span>
      <h2 class="text-xl font-extrabold text-slate-900">企業銀行帳戶與自動對帳調節</h2>
      <p class="text-xs text-slate-500">支援單據沖銷核銷與規則式銀行對帳單自動撮合</p>
    </div>

    <div class="flex items-center space-x-2">
      <span class="px-3 py-1.5 rounded-lg border bg-cyan-50 border-cyan-300 text-cyan-800 text-xs font-semibold">
        自動對帳規則引擎就緒
      </span>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each bankAccounts as ba}
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-bold text-sm text-slate-900">{ba.bank}</h3>
            <p class="font-mono text-xs text-slate-500">{ba.accountNo}</p>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{ba.currency}</span>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div>
            <span class="text-slate-400">系統帳面餘額</span>
            <p class="font-bold text-slate-900">NT$ {ba.bookBalance.toLocaleString()}</p>
          </div>
          <div>
            <span class="text-slate-400">銀行對帳單餘額</span>
            <p class="font-bold text-slate-900">NT$ {ba.bankBalance.toLocaleString()}</p>
          </div>
        </div>

        <div class="pt-2 flex items-center justify-between text-[11px] text-emerald-600 font-semibold">
          <span>✓ 對帳狀態：無未達帳與差額</span>
          <span class="text-slate-400">調節表已平</span>
        </div>
      </div>
    {/each}
  </div>
</div>
