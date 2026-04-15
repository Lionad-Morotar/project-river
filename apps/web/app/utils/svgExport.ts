export function serializeSvgWithLegend(
  svgNode: SVGSVGElement,
  contributors: string[],
  colorMap: Map<string, string>,
): string {
  const clone = svgNode.cloneNode(true) as SVGSVGElement

  // Inline explicit font styling for standalone use
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = `
      text { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 12px; fill: #e2e8f0; }
      .export-legend text { font-size: 14px; }
    `
  clone.prepend(style)

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
  const legendHeight = padding * 2 + topContributors.length * (swatchSize + gap) - gap + (moreCount > 0 ? lineHeight : 0)

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', String(legendWidth))
  bg.setAttribute('height', String(legendHeight))
  bg.setAttribute('rx', '4')
  bg.setAttribute('ry', '4')
  bg.setAttribute('fill', 'rgba(15,23,42,0.85)')
  legendGroup.appendChild(bg)

  topContributors.forEach((name, i) => {
    const y = padding + i * (swatchSize + gap)

    const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    swatch.setAttribute('x', String(padding))
    swatch.setAttribute('y', String(y))
    swatch.setAttribute('width', String(swatchSize))
    swatch.setAttribute('height', String(swatchSize))
    swatch.setAttribute('fill', colorMap.get(name) || '#999')
    legendGroup.appendChild(swatch)

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', String(padding + swatchSize + 8))
    label.setAttribute('y', String(y + swatchSize - 1))
    label.textContent = name
    legendGroup.appendChild(label)
  })

  if (moreCount > 0) {
    const y = padding + topContributors.length * (swatchSize + gap)
    const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    moreText.setAttribute('x', String(padding))
    moreText.setAttribute('y', String(y + swatchSize - 1))
    moreText.textContent = `+${moreCount} more`
    legendGroup.appendChild(moreText)
  }

  const svgWidth = Number(svgNode.getAttribute('width')) || 800
  const legendX = svgWidth - legendWidth - 16
  legendGroup.setAttribute('transform', `translate(${legendX}, 16)`)
  clone.appendChild(legendGroup)

  return new XMLSerializer().serializeToString(clone)
}

export function downloadStreamgraphSvg(
  svgNode: SVGSVGElement | null,
  filename: string,
  contributors: string[],
  colorMap: Map<string, string>,
) {
  if (!svgNode) {
    console.warn('[svgExport] No SVG node available')
    return
  }

  const source = serializeSvgWithLegend(svgNode, contributors, colorMap)
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
