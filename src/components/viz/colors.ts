// Chart colours (dark surface). Categorical slots 1–3 of the reference palette,
// validated against zinc-900 (#18181b): CVD ΔE ≥ 9.4, contrast ≥ 3:1.
export const SERIES = {
  model: '#3987e5', // blue
  tool: '#d95926', // orange
  wait: '#199e70', // aqua
} as const

/** Single hue for magnitude-only bars. */
export const MAGNITUDE = '#3987e5'
