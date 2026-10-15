/**
 * Builds an A4 PDF from the printable report sheet in the browser.
 *
 * Each element marked `data-pdf-block` is captured on its own and laid onto pages:
 * - Figures, headings, and equation blocks stay whole; a block that does not fit moves to the
 *   next page.
 * - Tables taller than a third of a page may continue on the next page, only between rows and
 *   never leaving a few orphan rows behind, as in the paper.
 * - `data-pdf-block="heading"` moves to the next page together with the start of the next block,
 *   and `data-pdf-break-before` starts a block on a new page.
 * Pages are images, so the PDF text is not selectable.
 */

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 16
const FOOTER = 8
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER
const PAGE_CONTENT = CONTENT_BOTTOM - MARGIN
const BLOCK_GAP = 6
const HEADING_GAP = 3
/** A table only starts at the foot of a page if at least this much of it fits there. */
const MIN_TABLE_START = 30
/** A split table carries at least this much over, so no orphan rows land on the next page. */
const MIN_TABLE_END = 30
/** Tables shorter than this are never split; they move to the next page whole. */
const MIN_SPLIT_HEIGHT = 90

export interface LayoutBlock {
  /** Height in millimetres. */
  height: number
  heading: boolean
  breakBefore?: boolean
  /** Offsets (mm from the block top) where the block may continue on a new page, e.g. row ends. */
  breaks?: number[]
}

export interface Segment {
  page: number
  y: number
  /** Part of the block shown on this page, in mm from the block top. */
  from: number
  to: number
}

/** Plans which part of each block goes on which page; exported for tests. */
export function layoutBlocks(blocks: LayoutBlock[]): Segment[][] {
  const result: Segment[][] = []
  let page = 1
  let y = MARGIN
  const newPage = () => {
    page += 1
    y = MARGIN
  }

  blocks.forEach((block, index) => {
    const segments: Segment[] = []
    const splittable = (block.breaks?.length ?? 0) > 0 && block.height >= MIN_SPLIT_HEIGHT
    const next = blocks[index + 1]

    if (block.breakBefore && y > MARGIN) newPage()
    if (block.heading && next) {
      // Keep a heading with the start of what it introduces.
      const nextStart = (next.breaks?.length ?? 0) > 0 ? Math.min(next.height, MIN_TABLE_START) : Math.min(next.height, PAGE_CONTENT)
      if (y > MARGIN && y + block.height + HEADING_GAP + nextStart > CONTENT_BOTTOM) newPage()
    }

    let from = 0
    while (from < block.height) {
      const room = CONTENT_BOTTOM - y
      const rest = block.height - from
      if (rest <= room) {
        segments.push({ page, y, from, to: block.height })
        y += rest
        break
      }
      // Find the last allowed break that fits in the room left on this page.
      const fits = splittable
        ? (block.breaks ?? []).filter((b) => b > from && b - from <= room && block.height - b >= MIN_TABLE_END)
        : []
      const cut = fits.length > 0 ? fits[fits.length - 1] : undefined
      if (cut !== undefined && (cut - from >= MIN_TABLE_START || y === MARGIN)) {
        segments.push({ page, y, from, to: cut })
        from = cut
        newPage()
        continue
      }
      if (y > MARGIN) {
        newPage()
        continue
      }
      // Taller than a whole page with no usable break: cut at the page bottom.
      segments.push({ page, y, from, to: from + room })
      from += room
      newPage()
    }

    result.push(segments)
    y += block.heading ? HEADING_GAP : BLOCK_GAP
  })
  return result
}

/** Row ends of the table inside a block, in CSS pixels from the block top (last row excluded). */
function rowBreaks(element: HTMLElement): number[] {
  const top = element.getBoundingClientRect().top
  const rows = Array.from(element.querySelectorAll("tbody tr"))
  return rows.slice(0, -1).map((row) => row.getBoundingClientRect().bottom - top)
}

export async function saveReportPdf(root: HTMLElement, fileName: string, footerText: string): Promise<void> {
  const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")])
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-block]"))
  if (elements.length === 0) throw new Error("The report has no content to save.")

  // Millimetres per CSS pixel, so the sheet's own width maps onto the page width.
  const scale = CONTENT_WIDTH / root.clientWidth
  const blocks = elements.map((element) => ({
    element,
    width: Math.min(CONTENT_WIDTH, element.offsetWidth * scale),
    height: element.offsetHeight * scale,
    heading: element.dataset.pdfBlock === "heading",
    breakBefore: element.dataset.pdfBreakBefore !== undefined,
    breaks: rowBreaks(element).map((offset) => offset * scale),
  }))
  const layout = layoutBlocks(blocks)

  // Embedding fonts once instead of per block keeps the capture fast.
  const fontEmbedCSS = await getFontEmbedCSS(root)
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true })
  let currentPage = 1

  for (const [index, block] of blocks.entries()) {
    const segments = layout[index] ?? []
    if (segments.length === 0) continue
    const canvas = await toCanvas(block.element, { pixelRatio: 2, backgroundColor: "#ffffff", fontEmbedCSS })
    const pxPerMm = canvas.height / block.height
    const x = MARGIN + (CONTENT_WIDTH - block.width) / 2

    for (const segment of segments) {
      while (currentPage < segment.page) {
        doc.addPage()
        currentPage += 1
      }
      const sourceY = Math.round(segment.from * pxPerMm)
      const sourceHeight = Math.max(1, Math.round((segment.to - segment.from) * pxPerMm))
      const part = document.createElement("canvas")
      part.width = canvas.width
      part.height = sourceHeight
      const context = part.getContext("2d")
      if (!context) throw new Error("The browser could not prepare the PDF page.")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, part.width, part.height)
      context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)
      // JPEG at 2x resolution keeps text sharp and encodes far faster than PNG.
      doc.addImage(part.toDataURL("image/jpeg", 0.85), "JPEG", x, segment.y, block.width, segment.to - segment.from)
    }
  }

  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(footerText, MARGIN, PAGE_HEIGHT - MARGIN + 4, { maxWidth: CONTENT_WIDTH - 30 })
    doc.text(`Page ${page} of ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN + 4, { align: "right" })
  }
  doc.save(fileName)
}
