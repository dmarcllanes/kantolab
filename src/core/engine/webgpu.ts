// Lightweight WebGPU capability check, used to warn users before they try to
// download a model their hardware can't run.

export interface GpuProfile {
  supported: boolean
  vendor?: string
  architecture?: string
  /** Largest single GPU buffer, in bytes — a rough proxy for usable VRAM. */
  maxBufferSize?: number
  shaderF16?: boolean
  reason?: string
}

interface MinimalGpuAdapter {
  features: { has(name: string): boolean }
  limits: { maxBufferSize: number }
  info?: { vendor?: string; architecture?: string }
}

interface MinimalGpu {
  requestAdapter(): Promise<MinimalGpuAdapter | null>
}

export async function profileGpu(): Promise<GpuProfile> {
  const gpu = (navigator as Navigator & { gpu?: MinimalGpu }).gpu
  if (!gpu) return { supported: false, reason: 'This browser does not expose WebGPU.' }
  const adapter = await gpu.requestAdapter()
  if (!adapter) return { supported: false, reason: 'No WebGPU adapter available.' }
  return {
    supported: true,
    vendor: adapter.info?.vendor,
    architecture: adapter.info?.architecture,
    maxBufferSize: adapter.limits.maxBufferSize,
    shaderF16: adapter.features.has('shader-f16'),
  }
}
