<script lang="ts">
  interface Props {
    stages: { id: string; label: string }[]
    currentStage: string
    actions?: { id: string; label: string; primary?: boolean; onClick: () => void }[]
  }

  let { stages, currentStage, actions = [] }: Props = $props()
</script>

<div class="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
  <!-- Left: Action buttons -->
  <div class="flex items-center space-x-2">
    {#each actions as action}
      <button
        onclick={action.onClick}
        class="px-3 py-1.5 text-xs font-semibold rounded-md shadow-xs transition flex items-center space-x-1 {action.primary ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'}"
      >
        <span>{action.label}</span>
      </button>
    {/each}
  </div>

  <!-- Right: Odoo-style chevron status bar -->
  <div class="flex items-center overflow-x-auto text-xs font-medium border border-slate-200 rounded-md divide-x divide-slate-200 bg-slate-50">
    {#each stages as stage, idx}
      {@const isActive = stage.id === currentStage}
      <div
        class="px-3 py-1 transition-colors flex items-center space-x-1.5 {isActive ? 'bg-indigo-600 text-white font-bold' : 'text-slate-500 bg-slate-50'}"
      >
        <span class="text-[10px] opacity-75">{idx + 1}.</span>
        <span>{stage.label}</span>
      </div>
    {/each}
  </div>
</div>
