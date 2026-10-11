import { expect, it } from "vitest"

import { rateScale } from "./ResponseRateBreakdown"

it("picks a shared axis with room after the longest bar", () => {
  expect(rateScale(5.8)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] })
  expect(rateScale(15.7)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] })
  expect(rateScale(0)).toEqual({ max: 1, ticks: [0, 1] })
  expect(rateScale(100)).toEqual({ max: 120, ticks: [0, 20, 40, 60, 80, 100, 120] })
})
