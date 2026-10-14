<script lang="ts">
  interface Props {
    stages: { id: string; label: string }[]
    currentStage: string
    actions?: { id: string; label: string; primary?: boolean; onClick: () => void }[]
  }

  let { stages, currentStage, actions = [] }: Props = $props()
</script>

<div
  class="is-flex is-flex-wrap-wrap is-align-items-center is-justify-content-space-between p-3 mb-5 has-background-white-bis"
  style="gap: 0.75rem; border-bottom: 1px solid var(--bulma-border)"
>
  <div class="buttons are-small mb-0">
    {#each actions as action}
      <button onclick={action.onClick} class="button {action.primary ? 'is-primary' : 'is-light'}">
        <span>{action.label}</span>
      </button>
    {/each}
  </div>

  <div class="erp-status-track">
    {#each stages as stage, idx}
      {@const isActive = stage.id === currentStage}
      <div class="erp-status-stage {isActive ? 'is-active' : ''}">
        <span class="mr-1">{idx + 1}.</span>
        <span>{stage.label}</span>
      </div>
    {/each}
  </div>
</div>
