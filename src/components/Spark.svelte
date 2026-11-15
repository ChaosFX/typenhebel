<script lang="ts">
  // Tempoverlauf eines Abschnitts als kleine Fläche
  let { vals }: { vals: number[] } = $props();
  const W = 300;
  const H = 60;
  const d = $derived.by(() => {
    if (vals.length < 2) return '';
    const mx = Math.max(...vals);
    const mn = Math.min(...vals);
    const rg = Math.max(1, mx - mn);
    const flat = mx - mn < 1;
    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * W;
        const y = flat ? H / 2 : H - 8 - ((v - mn) / rg) * (H - 18);
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      })
      .join(' ');
  });
</script>

{#if d}
  <svg class="spark" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-label="Tempoverlauf">
    <defs
      ><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"
        ><stop offset="0" stop-color="var(--accent)" stop-opacity=".28" /><stop
          offset="1"
          stop-color="var(--accent)"
          stop-opacity="0"
        /></linearGradient
      ></defs
    >
    <path d="{d} L{W} {H} L0 {H} Z" fill="url(#sg)" />
    <path
      {d}
      fill="none"
      stroke="var(--accent)"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
{/if}
