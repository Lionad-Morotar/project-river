import type { brushX as d3BrushX } from 'd3-brush'
import type { scaleLinear, scaleUtc } from 'd3-scale'
import type { area as d3Area } from 'd3-shape'
import type { zoom as d3Zoom } from 'd3-zoom'

export type D3ScaleLinear = ReturnType<typeof scaleLinear>
export type D3ScaleUtc = ReturnType<typeof scaleUtc>
export type D3AreaGenerator = ReturnType<typeof d3Area<any>>
export type D3BrushXBehavior = ReturnType<typeof d3BrushX>
export type D3ZoomBehavior = ReturnType<typeof d3Zoom>

export const MARGIN = { top: 24, right: 24, bottom: 24, left: 48 }
export const BRUSH_HEIGHT = 50
export const BRUSH_GAP = 16
export const MIN_THICKNESS_PX = 2
export const HIT_AREA_PX = 6
export const MAX_SPIKE_MARKERS = 5
export const MAX_CONTRIBUTOR_LABELS = 8
