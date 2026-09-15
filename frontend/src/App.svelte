<script lang="ts">
  import { onMount } from 'svelte'
  import Navbar from './lib/components/Navbar.svelte'
  import AppSwitcher from './lib/components/AppSwitcher.svelte'
  import DashboardApp from './apps/DashboardApp.svelte'
  import SalesApp from './apps/SalesApp.svelte'
  import ProcurementApp from './apps/ProcurementApp.svelte'
  import InventoryApp from './apps/InventoryApp.svelte'
  import ManufacturingApp from './apps/ManufacturingApp.svelte'
  import FinanceApp from './apps/FinanceApp.svelte'
  import TreasuryApp from './apps/TreasuryApp.svelte'
  import OrganizationApp from './apps/OrganizationApp.svelte'
  import {
    clearAuthSession,
    login,
    logout,
    readAuthSession,
    restoreSession,
    type AuthSession,
  } from './lib/api.js'
  import type { ActiveAppId } from './lib/types.js'

  let session = $state<AuthSession | null>(readAuthSession())
  let activeApp = $state<ActiveAppId>('dashboard')
  let isSwitcherOpen = $state(false)
  let username = $state('')
  let password = $state('')
  let authError = $state('')
  let isLoggingIn = $state(false)

  onMount(() => {
    if (session) return
    restoreSession()
      .then((restored) => {
        if (restored) session = restored
      })
      .catch(() => undefined)
  })

  $effect(() => {
    const handleSessionExpired = () => {
      session = null
      isSwitcherOpen = false
      authError = '登入已過期，請重新登入。'
    }
    window.addEventListener('flasherp:session-expired', handleSessionExpired)
    return () => window.removeEventListener('flasherp:session-expired', handleSessionExpired)
  })

  async function handleLogin(event: SubmitEvent) {
    event.preventDefault()
    authError = ''
    isLoggingIn = true
    try {
      session = await login(username, password)
      password = ''
    } catch (error) {
      authError = error instanceof Error ? error.message : '登入失敗'
    } finally {
      isLoggingIn = false
    }
  }

  async function handleLogout() {
    await logout()
    clearAuthSession()
    session = null
    isSwitcherOpen = false
  }

  function toggleSwitcher() {
    isSwitcherOpen = !isSwitcherOpen
  }

  function closeSwitcher() {
    isSwitcherOpen = false
  }

  function selectApp(app: ActiveAppId) {
    activeApp = app
    isSwitcherOpen = false
  }
</script>

{#if !session}
  <main class="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-900">
    <form
      onsubmit={handleLogin}
      class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl space-y-6"
    >
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">FlashERP</p>
        <h1 class="mt-2 text-2xl font-black text-slate-900">登入企業後台</h1>
        <p class="mt-2 text-sm text-slate-500">使用系統管理員提供的本地帳號登入。</p>
      </div>

      <label class="block space-y-1.5 text-sm font-medium text-slate-700">
        帳號
        <input
          bind:value={username}
          autocomplete="username"
          required
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>

      <label class="block space-y-1.5 text-sm font-medium text-slate-700">
        密碼
        <input
          bind:value={password}
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>

      {#if authError}
        <p class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{authError}</p>
      {/if}

      <button
        type="submit"
        disabled={isLoggingIn}
        class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
      >
        {isLoggingIn ? '登入中…' : '登入'}
      </button>
    </form>
  </main>
{:else}
  <div class="min-h-screen flex flex-col bg-slate-100 text-slate-900 font-sans">
    <Navbar
      {activeApp}
      {isSwitcherOpen}
      user={session.user}
      onToggleSwitcher={toggleSwitcher}
      onLogout={handleLogout}
    />

    <AppSwitcher
      {activeApp}
      isOpen={isSwitcherOpen}
      onSelectApp={selectApp}
      onClose={closeSwitcher}
    />

    <main class="flex-1 overflow-y-auto">
      {#if activeApp === 'dashboard'}
        <DashboardApp />
      {:else if activeApp === 'sales'}
        <SalesApp />
      {:else if activeApp === 'procurement'}
        <ProcurementApp />
      {:else if activeApp === 'inventory'}
        <InventoryApp />
      {:else if activeApp === 'manufacturing'}
        <ManufacturingApp />
      {:else if activeApp === 'finance'}
        <FinanceApp />
      {:else if activeApp === 'treasury'}
        <TreasuryApp />
      {:else if activeApp === 'organization'}
        <OrganizationApp />
      {/if}
    </main>

    <footer class="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[11px] text-slate-500 select-none">
      <span>FlashERP v0.1.0 • Single Enterprise Modular Monolith</span>
      <span>PostgreSQL + TypeORM + Svelte 5 • Apache-2.0 License</span>
    </footer>
  </div>
{/if}
