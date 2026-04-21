<script setup lang="ts">
/**
 * Git River — 基于 Canvas 的 ASCII 字符河流背景
 *
 * 河流从左向右流动，使用噪声函数生成自然的蜿蜒形态。
 * 字符密度映射到水深/浪高：' ' → '.' → ':' → '-' → '=' → '+' → '*' → '#' → '%' → '@' → '░' → '▒' → '▓' → '█'
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null

/* ─── Character density ramp (low → high) ─── */
const DENSITY = [
  ' ',
  '·',
  ':',
  '-',
  '=',
  '+',
  '*',
  '#',
  '%',
  '@',
  '░',
  '▒',
  '▓',
  '█',
]

/* ─── Simple value-noise with smooth interpolation ─── */
function fract(x: number): number {
  return x - Math.floor(x)
}

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.758) * 43758.5453123
  return fract(n)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function noise2D(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(fract(x))
  const fy = smooth(fract(y))

  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)

  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)
}

/* Fractal Brownian Motion — layered noise */
function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency, seed + i)
    amplitude *= 0.5
    frequency *= 2.3
  }
  return value
}

/* ─── River field computation ─── */
function riverField(
  col: number,
  row: number,
  cols: number,
  rows: number,
  time: number,
): { intensity: number, isFoam: boolean, swirl: number } {
  const nx = col / cols
  const ny = row / rows
  const t = time * 0.0004

  // Main river path — 蜿蜒的主干
  const pathSeed = 1
  const pathNoise = fbm(nx * 3 + t * 0.5, ny * 2, 3, pathSeed)
  const riverCenter = 0.5 + (pathNoise - 0.5) * 0.75

  // River width varies along the flow
  const widthSeed = 2
  const widthNoise = fbm(nx * 2 - t * 0.3, ny * 4, 2, widthSeed)
  const riverWidth = 0.22 + widthNoise * 0.16

  // Distance from river center (normalized)
  const dist = Math.abs(ny - riverCenter)
  const normalizedDist = dist / riverWidth

  // Swirl — 漩涡效果（局部旋转噪声）
  const swirlSeed = 3
  const angle = Math.atan2(ny - riverCenter, nx - 0.5) * 3 + t * 2
  const swirlNoise = fbm(
    nx * 5 + Math.cos(angle) * 0.3,
    ny * 5 + Math.sin(angle) * 0.3,
    3,
    swirlSeed,
  )

  // Base intensity from river shape
  let intensity = 0

  if (normalizedDist < 1.0) {
    // Inside river body
    const depthProfile = Math.cos(normalizedDist * Math.PI * 0.5)
    const flowNoise = fbm(nx * 4 + t, ny * 6, 3, 4)
    intensity = depthProfile * 0.7 + flowNoise * 0.3

    // Deeper in center, shallower at edges
    intensity = intensity * (1 - normalizedDist * 0.3)
  }
  else if (normalizedDist < 2.0) {
    // Shoreline transition — wider fade to fill screen
    const shore = 1 - (normalizedDist - 1.0)
    intensity = shore * 0.12 * fbm(nx * 6 + t, ny * 8, 2, 5)
  }

  // Add swirl perturbation
  intensity += swirlNoise * 0.08
  intensity = Math.max(0, Math.min(1, intensity))

  // Foam detection — high-intensity peaks at surface
  const foamNoise = fbm(nx * 8 + t * 1.5, ny * 10 - t, 2, 6)
  const isFoam = intensity > 0.65 && foamNoise > 0.6 && normalizedDist < 0.85

  // Swirl factor for color variation
  const swirl = swirlNoise

  return { intensity, isFoam, swirl }
}

/* ─── Color palette (dark mode charcoal bg) ─── */
function getColor(intensity: number, isFoam: boolean, swirl: number, isDark: boolean): string {
  if (isDark) {
    // Dark mode — 青色/蓝色河流在炭灰背景上
    if (isFoam) {
      // Foam / whitecaps — bright and crisp
      const alpha = 0.75 + swirl * 0.2
      return `rgba(230, 245, 255, ${alpha})`
    }
    if (intensity < 0.15) {
      // Deep water — visible base glow
      const a = 0.22 + intensity * 5
      return `rgba(70, 160, 210, ${a})`
    }
    if (intensity < 0.4) {
      // Mid water — vivid cyan/teal
      const t = (intensity - 0.15) / 0.25
      const r = lerp(70, 90, t)
      const g = lerp(160, 210, t)
      const b = lerp(210, 245, t)
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${0.5 + t * 0.4})`
    }
    // Shallow / fast water — bright cyan highlights
    const t = (intensity - 0.4) / 0.6
    const r = lerp(90, 170, t)
    const g = lerp(210, 245, t)
    const b = lerp(245, 255, t)
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${0.7 + t * 0.25})`
  }
  else {
    // Light mode — 深蓝河流在浅色背景上
    if (isFoam) {
      const alpha = 0.35 + swirl * 0.2
      return `rgba(100, 160, 220, ${alpha})`
    }
    if (intensity < 0.15) {
      const a = intensity * 1.8
      return `rgba(60, 100, 150, ${a})`
    }
    if (intensity < 0.4) {
      const t = (intensity - 0.15) / 0.25
      const r = lerp(60, 50, t)
      const g = lerp(100, 130, t)
      const b = lerp(150, 190, t)
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${0.25 + t * 0.25})`
    }
    const t = (intensity - 0.4) / 0.6
    const r = lerp(50, 30, t)
    const g = lerp(130, 170, t)
    const b = lerp(190, 230, t)
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${0.4 + t * 0.25})`
  }
}

/* ─── Main render loop ─── */
let lastTime = 0
const FONT_SIZE = 14
const COL_WIDTH = 8.4 // monospace char width at 14px
const ROW_HEIGHT = 16

function render(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const isDark = document.documentElement.classList.contains('dark')

  // Clear with background color (slight trail for motion blur feel)
  ctx.fillStyle = isDark ? '#1e1e20' : '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const cols = Math.ceil(width / COL_WIDTH) + 1
  const rows = Math.ceil(height / ROW_HEIGHT) + 1

  ctx.font = `${FONT_SIZE}px "SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", monospace`
  ctx.textBaseline = 'top'

  // Character variation for flowing effect
  const charPhase = Math.floor(time * 0.002) % 3

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const { intensity, isFoam, swirl } = riverField(col, row, cols, rows, time)

      if (intensity < 0.015)
        continue // Skip empty areas

      // Map intensity to character index
      let charIdx = Math.floor(intensity * (DENSITY.length - 1))
      charIdx = Math.max(0, Math.min(charIdx, DENSITY.length - 1))

      // Add subtle character variation for flowing feel
      if (!isFoam && intensity > 0.1 && intensity < 0.7) {
        const variation = Math.floor(swirl * 2.5 + charPhase) % 2
        charIdx = Math.max(0, Math.min(charIdx + variation - 1, DENSITY.length - 1))
      }

      // Foam uses higher-density chars
      if (isFoam) {
        charIdx = DENSITY.length - 1 - Math.floor(swirl * 3)
        charIdx = Math.max(DENSITY.length - 4, charIdx)
      }

      const char = DENSITY[charIdx]!
      const color = getColor(intensity, isFoam, swirl, isDark)

      ctx.fillStyle = color
      ctx.fillText(char, col * COL_WIDTH, row * ROW_HEIGHT + 1)
    }
  }
}

/* ─── Lifecycle ─── */
let ctx: CanvasRenderingContext2D | null = null

function resize() {
  const canvas = canvasRef.value
  if (!canvas)
    return
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    ctx.textRendering = 'optimizeSpeed'
  }
}

function animate(time: number) {
  if (!ctx) {
    rafId = requestAnimationFrame(animate)
    return
  }

  // Skip frames for performance (target ~30fps)
  if (time - lastTime < 33) {
    rafId = requestAnimationFrame(animate)
    return
  }
  lastTime = time

  render(ctx, window.innerWidth, window.innerHeight, time)
  rafId = requestAnimationFrame(animate)
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  rafId = requestAnimationFrame(animate)
})

onUnmounted(() => {
  if (rafId)
    cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="fixed inset-0 pointer-events-none"
    style="z-index: 0; image-rendering: pixelated;"
  />
</template>
