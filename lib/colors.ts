import type { CategoryDefinition } from './types'

// Extended color palette with distinct, well-separated hues
const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#eab308', // yellow
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#22c55e', // green
  '#a855f7', // purple
  '#f43f5e', // rose
  '#64748b', // slate
  '#78716c', // stone
  '#0891b2', // cyan-600
]

export function paletteColor(index: number): string {
  return COLORS[index % COLORS.length]
}

// Track assigned colors to ensure uniqueness within a session
const assignedColors = new Map<string, string>()

// Better hash function with prime number multiplication for more distribution
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash * 33) ^ char) >>> 0
  }
  return hash
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().replace('#', '')
  if (trimmed.length === 3) {
    return trimmed
      .split('')
      .map((char) => char + char)
      .join('')
  }

  return trimmed
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex)

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null
  }

  const value = Number.parseInt(normalized, 16)

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`
}

function mixHexColors(colorA: string, colorB: string, weight = 0.5): string {
  const a = hexToRgb(colorA)
  const b = hexToRgb(colorB)

  if (!a || !b) {
    return colorA
  }

  return rgbToHex(
    a.r * (1 - weight) + b.r * weight,
    a.g * (1 - weight) + b.g * weight,
    a.b * (1 - weight) + b.b * weight
  )
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color)

  if (!rgb) {
    return color
  }

  const clampedAlpha = Math.max(0, Math.min(1, alpha))
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clampedAlpha})`
}

export function getMutedChartColor(color: string, isDark: boolean): string {
  if (!isDark) {
    return color
  }

  return mixHexColors(color, '#94a3b8', 0.3)
}

export function getCategoryColor(category: string): string {
  const key = category.toLowerCase().trim()

  // Return cached color if already assigned
  if (assignedColors.has(key)) {
    return assignedColors.get(key)!
  }

  // Find an unused color if possible
  const usedColors = new Set(assignedColors.values())
  const hash = hashString(key)

  // Try to find an unused color starting from the hash position
  for (let i = 0; i < COLORS.length; i++) {
    const colorIndex = (hash + i) % COLORS.length
    const color = COLORS[colorIndex]
    if (!usedColors.has(color)) {
      assignedColors.set(key, color)
      return color
    }
  }

  // All colors used, fall back to hash-based selection
  const color = COLORS[hash % COLORS.length]
  assignedColors.set(key, color)
  return color
}

export function getCategoryColors(categories: string[]): Record<string, string> {
  const colorMap: Record<string, string> = {}
  categories.forEach((category) => {
    colorMap[category] = getCategoryColor(category)
  })
  return colorMap
}

// Fixes colors from the categories tab: its color column, else the palette by position.
// Categories missing from the list keep the hash-based assignment.
export function setCategoryPalette(categories: CategoryDefinition[]): void {
  assignedColors.clear()
  categories.forEach(({ name, color }, index) => {
    assignedColors.set(name.toLowerCase().trim(), color ?? paletteColor(index))
  })
}

// Reset assigned colors (useful for testing or when data changes)
export function resetCategoryColors(): void {
  assignedColors.clear()
}
