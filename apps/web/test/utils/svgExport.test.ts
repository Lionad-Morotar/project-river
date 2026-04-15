// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { downloadStreamgraphSvg, serializeSvgWithLegend } from '../../app/utils/svgExport'

const createObjectURL = vi.fn(() => 'blob:test')
const revokeObjectURL = vi.fn()
URL.createObjectURL = createObjectURL
URL.revokeObjectURL = revokeObjectURL

const clickSpy = vi.fn()
HTMLAnchorElement.prototype.click = clickSpy

describe('svgExport', () => {
  it('serializes with style and legend', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '800')
    svg.setAttribute('height', '400')

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    svg.appendChild(rect)

    const colorMap = new Map<string, string>([
      ['alice', 'hsl(160, 75%, 55%)'],
      ['bob', 'hsl(220, 45%, 55%)'],
    ])
    const result = serializeSvgWithLegend(svg, ['alice', 'bob'], colorMap)

    expect(result).toContain('<style>')
    expect(result).toContain('font-family: Inter, ui-sans-serif, system-ui, sans-serif')
    expect(result).toContain('export-legend')
  })

  it('does not throw and exits early when svgNode is null', () => {
    createObjectURL.mockClear()
    clickSpy.mockClear()

    expect(() => downloadStreamgraphSvg(null, 'test.svg', [], new Map())).not.toThrow()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
