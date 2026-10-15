import { expect, it } from "vitest"

import { layoutBlocks } from "./report-pdf"

// A4 content runs from y = 16 mm to y = 273 mm (297 − 16 margin − 8 footer), so 257 mm per page.

it("keeps unsplittable blocks whole and moves them to a new page when they do not fit", () => {
  expect(layoutBlocks([
    { height: 120, heading: false },
    { height: 100, heading: false },
    { height: 80, heading: false },
  ])).toEqual([
    [{ page: 1, y: 16, from: 0, to: 120 }],
    [{ page: 1, y: 142, from: 0, to: 100 }],
    [{ page: 2, y: 16, from: 0, to: 80 }],
  ])
})

it("continues a table on the next page at the last row that fits", () => {
  const [, table] = layoutBlocks([
    { height: 180, heading: false },
    { height: 120, heading: false, breaks: [20, 40, 60, 80, 100] },
  ])
  // The first block ends at 196 mm; after the 6 mm gap, 202 to 273 leaves 71 mm, so rows up to 60 fit.
  expect(table).toEqual([
    { page: 1, y: 202, from: 0, to: 60 },
    { page: 2, y: 16, from: 60, to: 120 },
  ])
})

it("does not start a table at the foot of a page with only a sliver of it", () => {
  const [, table] = layoutBlocks([
    { height: 240, heading: false },
    { height: 120, heading: false, breaks: [10, 20, 60] },
  ])
  expect(table).toEqual([{ page: 2, y: 16, from: 0, to: 120 }])
})

it("moves a heading to the next page with the block it introduces", () => {
  const [, heading, figure] = layoutBlocks([
    { height: 230, heading: false },
    { height: 8, heading: true },
    { height: 60, heading: false },
  ])
  expect(heading).toEqual([{ page: 2, y: 16, from: 0, to: 8 }])
  expect(figure).toEqual([{ page: 2, y: 27, from: 0, to: 60 }])
})

it("starts a block marked break-before on a new page", () => {
  const layout = layoutBlocks([
    { height: 20, heading: false },
    { height: 10, heading: true, breakBefore: true },
    { height: 20, heading: false },
  ])
  expect(layout.map((segments) => segments[0]?.page)).toEqual([1, 2, 2])
})

it("cuts a block taller than a page at the page bottom when it has no row breaks", () => {
  const [block] = layoutBlocks([{ height: 300, heading: false }])
  expect(block).toEqual([
    { page: 1, y: 16, from: 0, to: 257 },
    { page: 2, y: 16, from: 257, to: 300 },
  ])
})

it("moves a short table whole instead of splitting off its last rows", () => {
  const [, table] = layoutBlocks([
    { height: 200, heading: false },
    { height: 70, heading: false, breaks: [20, 30, 40, 50, 60] },
  ])
  expect(table).toEqual([{ page: 2, y: 16, from: 0, to: 70 }])
})

it("never leaves fewer than 30 mm of a split table for the next page", () => {
  const [, table] = layoutBlocks([
    { height: 100, heading: false },
    { height: 180, heading: false, breaks: [40, 80, 120, 160] },
  ])
  // 122 to 273 leaves 151 mm; a cut at 160 would strand 20 mm, so it cuts at 120.
  expect(table).toEqual([
    { page: 1, y: 122, from: 0, to: 120 },
    { page: 2, y: 16, from: 120, to: 180 },
  ])
})
