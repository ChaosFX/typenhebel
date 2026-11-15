<script lang="ts">
  // Natives <dialog> als Modal; `open` steuert showModal()/close(), Esc schließt wie gewohnt.
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';

  interface Props extends HTMLDialogAttributes {
    open: boolean;
    /** Nach dem Öffnen: Element, das den Fokus bekommen soll */
    initialFocus?: () => HTMLElement | null | undefined;
    onclosed?: () => void;
    children: Snippet;
  }
  let { open = $bindable(), initialFocus, onclosed, children, ...rest }: Props = $props();
  let dlg: HTMLDialogElement;

  $effect(() => {
    if (open && !dlg.open) {
      dlg.showModal();
      initialFocus?.()?.focus();
    } else if (!open && dlg.open) dlg.close();
  });
</script>

<dialog
  bind:this={dlg}
  {...rest}
  onclose={() => {
    open = false;
    onclosed?.();
  }}
>
  {@render children()}
</dialog>
