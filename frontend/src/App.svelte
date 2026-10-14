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
  import { login, logout, readAuthSession, restoreSession, type AuthSession } from './lib/api.js'
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
  <main class="hero is-fullheight is-light">
    <form onsubmit={handleLogin} class="hero-body is-justify-content-center is-align-items-center">
      <div class="box" style="width: min(100%, 28rem)">
        <div class="mb-5">
          <p class="erp-eyebrow">FlashERP</p>
          <h1 class="title is-4 mb-2">登入企業後台</h1>
          <p class="subtitle is-6 mb-0">使用系統管理員提供的本地帳號登入。</p>
        </div>

        <div class="field">
          <label class="label" for="login-username">帳號</label>
          <div class="control">
            <input
              id="login-username"
              bind:value={username}
              autocomplete="username"
              required
              class="input"
            >
          </div>
        </div>

        <div class="field">
          <label class="label" for="login-password">密碼</label>
          <div class="control">
            <input
              id="login-password"
              bind:value={password}
              type="password"
              autocomplete="current-password"
              required
              class="input"
            >
          </div>
        </div>

        {#if authError}
          <div class="notification is-danger is-light py-3" role="alert">{authError}</div>
        {/if}

        <button type="submit" disabled={isLoggingIn} class="button is-primary is-fullwidth">
          {isLoggingIn ? '登入中…' : '登入'}
        </button>
      </div>
    </form>
  </main>
{:else}
  <div class="erp-shell is-flex is-flex-direction-column">
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

    <main class="erp-main">
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

    <footer class="erp-footer is-flex is-justify-content-space-between is-align-items-center">
      <span>FlashERP v0.1.0 · Single Enterprise Modular Monolith</span>
      <span>PostgreSQL + TypeORM + Svelte 5 · Apache-2.0 License</span>
    </footer>
  </div>
{/if}
