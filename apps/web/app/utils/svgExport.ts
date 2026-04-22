export interface ExportMeta {
  projectName: string
  dateRange: string | null
  healthSignals?: Array<{ label: string, severity: string }>
  localeStrings?: {
    more?: string
  }
}

interface ExportThemeColors {
  bg: string
  text: string
  title: string
  subtitle: string
  legendBg: string
  separator: string
  fallback: string
}

function getExportColors(isDark: boolean): ExportThemeColors {
  return isDark
    ? {
        bg: '#0f172a',
        text: '#e2e8f0',
        title: '#f1f5f9',
        subtitle: '#94a3b8',
        legendBg: 'rgba(15,23,42,0.85)',
        separator: '#334155',
        fallback: '#999',
      }
    : {
        bg: '#ffffff',
        text: '#334155',
        title: '#0f172a',
        subtitle: '#64748b',
        legendBg: 'rgba(241,245,249,0.85)',
        separator: '#e2e8f0',
        fallback: '#999',
      }
}

export function serializeSvgWithLegend(
  svgNode: SVGSVGElement,
  contributors: string[],
  colorMap: Map<string, string>,
  meta?: ExportMeta,
  isDark = true,
): string {
  const theme = getExportColors(isDark)
  const clone = svgNode.cloneNode(true) as SVGSVGElement

  // Read coordinate space from viewBox (CSS pixels), NOT width/height attributes
  // (which are DPR-scaled pixel values like 2752x1006 on 2x displays)
  const viewBox = svgNode.getAttribute('viewBox')
  let svgW: number, svgH: number
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/)
    svgW = Number(parts[2]) || 800
    svgH = Number(parts[3]) || 400
  }
  else {
    svgW = Number(svgNode.getAttribute('width')) || 800
    svgH = Number(svgNode.getAttribute('height')) || 400
  }

  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bgRect.setAttribute('width', String(svgW))
  bgRect.setAttribute('height', String(svgH))
  bgRect.setAttribute('fill', theme.bg)
  clone.insertBefore(bgRect, clone.firstChild)

  // Inline explicit font styling for standalone use
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = `
      text { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 12px; fill: ${theme.text}; }
      .export-legend text { font-size: 14px; }
      .export-title text { font-size: 14px; font-weight: 600; fill: ${theme.title}; }
      .export-title .subtitle { font-size: 11px; font-weight: 400; fill: ${theme.subtitle}; }
      .export-health text { font-size: 10px; }
    `
  clone.insertBefore(style, clone.firstChild)

  // Remove paint-order stroke from all text elements (causes visual artifacts on dark bg)
  clone.querySelectorAll('text[style*="paint-order"]').forEach((el) => {
    el.removeAttribute('style')
  })

  // Title section at top-left
  if (meta) {
    const titleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    titleGroup.setAttribute('class', 'export-title')

    const projectName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    projectName.setAttribute('x', '16')
    projectName.setAttribute('y', '18')
    projectName.textContent = meta.projectName
    titleGroup.appendChild(projectName)

    if (meta.dateRange) {
      const dateRange = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      dateRange.setAttribute('x', '16')
      dateRange.setAttribute('y', '34')
      dateRange.setAttribute('class', 'subtitle')
      dateRange.textContent = meta.dateRange
      titleGroup.appendChild(dateRange)
    }

    clone.appendChild(titleGroup)
  }

  // Build legend
  const topContributors = contributors.slice(0, 10)
  const moreCount = contributors.length - topContributors.length

  const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  legendGroup.setAttribute('class', 'export-legend')

  const padding = 16
  const lineHeight = 18
  const swatchSize = 12
  const gap = 4
  const legendWidth = 160

  // Calculate legend height including health section
  const healthSignals = meta?.healthSignals ?? []
  const healthHeight = healthSignals.length > 0 ? padding + healthSignals.length * (lineHeight) : 0
  const legendHeight = padding * 2 + topContributors.length * (swatchSize + gap) - gap + (moreCount > 0 ? lineHeight : 0) + healthHeight

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', String(legendWidth))
  bg.setAttribute('height', String(legendHeight))
  bg.setAttribute('rx', '4')
  bg.setAttribute('ry', '4')
  bg.setAttribute('fill', theme.legendBg)
  legendGroup.appendChild(bg)

  topContributors.forEach((name, i) => {
    const y = padding + i * (swatchSize + gap)

    const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    swatch.setAttribute('x', String(padding))
    swatch.setAttribute('y', String(y))
    swatch.setAttribute('width', String(swatchSize))
    swatch.setAttribute('height', String(swatchSize))
    swatch.setAttribute('fill', colorMap.get(name) || theme.fallback)
    legendGroup.appendChild(swatch)

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', String(padding + swatchSize + 8))
    label.setAttribute('y', String(y + swatchSize - 1))
    label.textContent = name
    legendGroup.appendChild(label)
  })

  let nextY = padding + topContributors.length * (swatchSize + gap)

  if (moreCount > 0) {
    const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    moreText.setAttribute('x', String(padding))
    moreText.setAttribute('y', String(nextY + swatchSize - 1))
    const moreTemplate = meta?.localeStrings?.more ?? '+{count} more'
    moreText.textContent = moreTemplate.replace('{count}', String(moreCount))
    legendGroup.appendChild(moreText)
    nextY += lineHeight
  }

  // Health summary section in legend
  if (healthSignals.length > 0) {
    const separator = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    separator.setAttribute('x1', String(padding))
    separator.setAttribute('x2', String(legendWidth - padding))
    separator.setAttribute('y1', String(nextY))
    separator.setAttribute('y2', String(nextY))
    separator.setAttribute('stroke', theme.separator)
    separator.setAttribute('stroke-width', '0.5')
    legendGroup.appendChild(separator)
    nextY += padding / 2

    const severityColors: Record<string, string> = {
      warning: '#fbbf24',
      positive: '#34d399',
      info: '#38bdf8',
    }

    for (const signal of healthSignals) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('cx', String(padding + 4))
      dot.setAttribute('cy', String(nextY + 4))
      dot.setAttribute('r', '3')
      dot.setAttribute('fill', severityColors[signal.severity] || '#94a3b8')
      legendGroup.appendChild(dot)

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(padding + 14))
      text.setAttribute('y', String(nextY + 8))
      text.textContent = signal.label
      legendGroup.appendChild(text)
      nextY += lineHeight
    }
  }

  // Place legend below the chart, expand SVG height to fit
  const totalHeight = svgH + legendHeight + 24
  const legendY = svgH + 8
  clone.setAttribute('height', String(totalHeight))
  bgRect.setAttribute('height', String(totalHeight))
  // Sync viewBox to include legend (original viewBox only covers chart area)
  clone.setAttribute('viewBox', `0 0 ${svgW} ${totalHeight}`)
  // Reset width to viewBox coordinate space (not DPR-scaled)
  clone.setAttribute('width', String(svgW))
  legendGroup.setAttribute('transform', `translate(16, ${legendY})`)
  clone.appendChild(legendGroup)

  return new XMLSerializer().serializeToString(clone)
}

export function downloadStreamgraphSvg(
  svgNode: SVGSVGElement | null,
  filename: string,
  contributors: string[],
  colorMap: Map<string, string>,
  meta?: ExportMeta,
  isDark = true,
) {
  if (!svgNode) {
    console.warn('[svgExport] No SVG node available')
    return
  }

  const source = serializeSvgWithLegend(svgNode, contributors, colorMap, meta, isDark)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
