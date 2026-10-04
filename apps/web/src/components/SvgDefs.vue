<template>
  <!-- Shared SVG patterns: header zigzag, promo edges, no-photo tribal tiles. -->
  <svg width="0" height="0" style="position: absolute" aria-hidden="true">
    <defs>
      <pattern id="zz" width="16" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 8L4 2L8 8L12 2L16 8" fill="none" style="stroke: var(--accent)" stroke-width="2" />
      </pattern>
      <pattern id="ec" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L7 1L14 10Z" style="fill: var(--section-deal)" /></pattern>
      <pattern id="es" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L7 1L14 10Z" style="fill: var(--section-popular)" /></pattern>
      <pattern id="pa" width="14" height="12" patternUnits="userSpaceOnUse">
        <path d="M2 9L7 3L12 9" fill="none" stroke="#F6EFE2" stroke-opacity=".6" stroke-width="2" />
      </pattern>
      <pattern id="pt" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 13L7 3L14 13Z" fill="#9C3A1F" fill-opacity=".55" /></pattern>
      <pattern id="pz" width="20" height="14" patternUnits="userSpaceOnUse">
        <path d="M0 11L5 3L10 11L15 3L20 11" fill="none" stroke="#1B1512" stroke-opacity=".55" stroke-width="2" />
      </pattern>
    </defs>
  </svg>
</template>
