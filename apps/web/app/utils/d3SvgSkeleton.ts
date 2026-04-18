import type { D3AreaGenerator, D3BrushXBehavior, D3ScaleLinear, D3ScaleUtc, D3ZoomBehavior } from './d3ChartTypes'
import { brushX as d3BrushX } from 'd3-brush'
import { select } from 'd3-selection'
import { zoom as d3Zoom } from 'd3-zoom'
import { BRUSH_BG, BRUSH_GAP, BRUSH_HEIGHT, BRUSH_STROKE, GRID_COLOR, HIGHLIGHT_COLOR, MARGIN } from './d3ChartTypes'

export interface D3State {
  svgNode: SVGSVGElement | null
  svgSelection: ReturnType<typeof select> | null
  gChartSelection: ReturnType<typeof select> | null
  gBrushGroupSelection: ReturnType<typeof select> | null
  gYAxisGridSelection: ReturnType<typeof select> | null
  gYAxisLabelsSelection: ReturnType<typeof select> | null
  gXAxisSelection: ReturnType<typeof select> | null
  gXAxisEl: SVGGElement | null
  clipRectSelection: ReturnType<typeof select> | null
  gAnnotationsSelection: ReturnType<typeof select> | null
  gLabelsSelection: ReturnType<typeof select> | null
  brushGroup: SVGGElement | null
  xBase: D3ScaleUtc | null
  xScale: D3ScaleLinear | null
  yScale: D3ScaleLinear | null
  zoomBehavior: D3ZoomBehavior | null
  brushBehavior: D3BrushXBehavior | null
  areaGenerator: D3AreaGenerator | null
  hitAreaGenerator: D3AreaGenerator | null
  monthHighlight: SVGRectElement | null
  crosshairGroup: ReturnType<typeof select> | null
  hoverHighlightEl: ReturnType<typeof select> | null
}

export function createEmptyD3State(): D3State {
  return {
    svgNode: null,
    svgSelection: null,
    gChartSelection: null,
    gBrushGroupSelection: null,
    gYAxisGridSelection: null,
    gYAxisLabelsSelection: null,
    gXAxisSelection: null,
    gXAxisEl: null,
    clipRectSelection: null,
    gAnnotationsSelection: null,
    gLabelsSelection: null,
    brushGroup: null,
    xBase: null,
    xScale: null,
    yScale: null,
    zoomBehavior: null,
    brushBehavior: null,
    areaGenerator: null,
    hitAreaGenerator: null,
    monthHighlight: null,
    crosshairGroup: null,
    hoverHighlightEl: null,
  }
}

export function initSvgSkeleton(
  container: HTMLElement,
  width: number,
  height: number,
  callbacks: {
    onZoom: (event: any) => void
    onBrushStartEnd: (event: any) => void
    onBrushMove: (event: any) => void
  },
  savedTransform?: any,
): D3State {
  const state = createEmptyD3State()

  const d3Container = select(container)
  d3Container.selectAll('*').remove()

  const svg = d3Container
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto; user-select: none; -webkit-user-select: none;')

  state.svgNode = svg.node() as SVGSVGElement
  state.svgSelection = svg

  const chartWidth = width - MARGIN.left - MARGIN.right
  const chartHeight = height - MARGIN.top - MARGIN.bottom - BRUSH_HEIGHT - BRUSH_GAP

  // defs / clipPath
  const clipRect = svg.append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', MARGIN.left)
    .attr('y', MARGIN.top)
    .attr('width', chartWidth)
    .attr('height', chartHeight)
  state.clipRectSelection = clipRect

  // Chart group (clipped)
  state.gChartSelection = svg.append('g')
    .attr('clip-path', 'url(#clip)')

  // Dark background for chart area (transparent, for pointer events)
  state.gChartSelection.append('rect')
    .attr('class', 'chart-bg')
    .attr('x', MARGIN.left)
    .attr('y', MARGIN.top)
    .attr('width', chartWidth)
    .attr('height', chartHeight)
    .attr('fill', 'transparent')

  // Grid lines container
  state.gChartSelection.append('g').attr('class', 'grid-lines')

  // Month highlight overlay
  const highlightSel = state.gChartSelection.append('rect')
    .attr('class', 'month-highlight')
    .attr('fill', HIGHLIGHT_COLOR)
    .attr('y', MARGIN.top)
    .attr('height', chartHeight)
    .style('display', 'none')
    .style('pointer-events', 'none')
  state.monthHighlight = highlightSel.node() as SVGRectElement

  // Layers container (paths will be added via data-join)
  state.gChartSelection.append('g').attr('class', 'layers')

  // Annotations container (vertical spike markers)
  state.gAnnotationsSelection = state.gChartSelection.append('g').attr('class', 'annotations')

  // Inline labels container (contributor names at widest points)
  state.gLabelsSelection = state.gChartSelection.append('g').attr('class', 'labels')

  // Crosshair lines (X + Y guide lines following cursor)
  const crosshair = state.gChartSelection.append('g').attr('class', 'crosshair')
  crosshair.append('line')
    .attr('class', 'crosshair-h')
    .attr('stroke', '#64748b')
    .attr('stroke-width', 0.5)
    .attr('stroke-dasharray', '4,3')
    .style('display', 'none')
    .style('pointer-events', 'none')
  crosshair.append('line')
    .attr('class', 'crosshair-v')
    .attr('stroke', '#64748b')
    .attr('stroke-width', 0.5)
    .attr('stroke-dasharray', '4,3')
    .style('display', 'none')
    .style('pointer-events', 'none')

  state.crosshairGroup = state.gChartSelection.select('.crosshair')

  state.gChartSelection.append('path')
    .attr('class', 'hover-highlight')
    .attr('fill', 'none')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('pointer-events', 'none')
    .style('opacity', 0)
  state.hoverHighlightEl = state.gChartSelection.select('.hover-highlight')

  // X-axis group
  state.gXAxisSelection = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${MARGIN.top + chartHeight})`)
  state.gXAxisEl = state.gXAxisSelection.node() as SVGGElement

  // Y-axis grid (tick lines across chart)
  state.gYAxisGridSelection = svg.append('g')
    .attr('class', 'y-axis-grid')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

  // Y-axis labels
  state.gYAxisLabelsSelection = svg.append('g')
    .attr('class', 'y-axis-labels')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

  // Brush group
  state.gBrushGroupSelection = svg.append('g')
    .attr('class', 'brush-group')
    .attr('transform', `translate(0, ${height - BRUSH_HEIGHT})`)

  // Brush background rect
  state.gBrushGroupSelection.append('rect')
    .attr('class', 'brush-bg')
    .attr('x', MARGIN.left)
    .attr('width', chartWidth)
    .attr('height', BRUSH_HEIGHT)
    .attr('fill', BRUSH_BG)
    .attr('rx', 4)

  // Brush mini layers container
  state.gBrushGroupSelection.append('g').attr('class', 'brush-layers')

  // Separator line between chart and brush
  state.gBrushGroupSelection.append('line')
    .attr('class', 'brush-separator')
    .attr('x1', MARGIN.left)
    .attr('x2', MARGIN.left + chartWidth)
    .attr('y1', -BRUSH_GAP / 2)
    .attr('y2', -BRUSH_GAP / 2)
    .attr('stroke', GRID_COLOR)
    .attr('stroke-width', 1)

  // Setup zoom behavior
  state.zoomBehavior = d3Zoom()
    .scaleExtent([1, 50])
    .extent([[MARGIN.left, 0], [width - MARGIN.right, MARGIN.top + chartHeight]])
    .translateExtent([[MARGIN.left, -Infinity], [width - MARGIN.right, Infinity]])
    .on('zoom', callbacks.onZoom)

  svg.call(state.zoomBehavior)
    // prevent scroll-to-zoom on the page
    .on('wheel.zoom', null)

  // Restore zoom transform after resize re-render
  if (savedTransform && state.zoomBehavior) {
    svg.call(state.zoomBehavior.transform, savedTransform)
  }

  // Setup brush behavior
  state.brushBehavior = d3BrushX()
    .extent([[MARGIN.left, 0.5], [width - MARGIN.right, BRUSH_HEIGHT - 0.5]])
    .on('start end', callbacks.onBrushStartEnd)
    .on('brush end', callbacks.onBrushMove)

  const brushGroupSel = state.gBrushGroupSelection.append('g')
    .attr('class', 'brush')
    .call(state.brushBehavior)

  state.brushGroup = brushGroupSel.node() as SVGGElement

  // Style brush handles
  brushGroupSel.selectAll('.selection').attr('fill', 'rgba(59,130,246,0.1)').attr('stroke', BRUSH_STROKE)
  brushGroupSel.selectAll('.handle').attr('fill', '#94a3b8').attr('rx', 2)

  return state
}
