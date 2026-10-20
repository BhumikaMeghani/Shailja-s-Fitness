import { describe, expect, it } from 'vitest'
import type { GoalId } from './types'
import {
  ADD_ON_PLAN_PRICE_PAISE,
  calculatePlanPrice,
  DEFAULT_PLAN_ID,
  DEFAULT_PLAN_PRICE_PAISE,
  formatInr,
} from './pricing'
import { GOAL_TAGS } from './goals'

const goals = GOAL_TAGS.map(tag => tag.id) as GoalId[]

/** Pricing table: selected add-on plans → expected INR total. */
const priceTable: Array<[number, number]> = [
  [0, 800], [1, 1000], [2, 1200], [3, 1400], [4, 1600],
  [5, 1800], [7, 2200], [9, 2600], [11, 3000],
]

describe('agreed pricing rules', () => {
  it('charges ₹800 for the default General wellness plan plus ₹200 per add-on plan', () => {
    expect(DEFAULT_PLAN_ID).toBe('general_wellness')
    expect(DEFAULT_PLAN_PRICE_PAISE).toBe(80000)
    expect(ADD_ON_PLAN_PRICE_PAISE).toBe(20000)
    for (const [addOns, expected] of priceTable) {
      // + ₹200 × add-ons, never derived from anything else.
      expect(80000 + 20000 * addOns).toBe(expected * 100)
      const price = calculatePlanPrice(goals.slice(1, 1 + addOns))
      expect(price.addOnPlanCount).toBe(addOns)
      expect(price.totalAmountPaise).toBe(expected * 100)
    }
  })

  it('prices an empty selection as the default plan at ₹800', () => {
    const price = calculatePlanPrice([])
    expect(price.addOnPlanCount).toBe(0)
    expect(price.baseAmountPaise).toBe(80000)
    expect(price.totalAmountPaise).toBe(80000)
  })

  it('never charges the default plan again when it is part of the selection', () => {
    const price = calculatePlanPrice(['general_wellness', 'better_sleep', 'general_wellness'])
    expect(price.addOnPlanIds).toEqual(['better_sleep'])
    expect(price.addOnPlanCount).toBe(1)
    expect(price.totalAmountPaise).toBe(100000)
  })

  it('de-duplicates add-on IDs before pricing so repeats cannot change the total', () => {
    const price = calculatePlanPrice(['better_sleep', 'better_sleep', 'posture_mobility'])
    expect(price.addOnPlanCount).toBe(2)
    expect(price.duplicatesRemoved).toBe(1)
    expect(price.totalAmountPaise).toBe(120000)
  })

  it('formats whole-paise amounts as INR display values', () => {
    expect(formatInr(80000)).toBe('₹800')
    expect(formatInr(100000)).toBe('₹1,000')
    expect(formatInr(300000)).toBe('₹3,000')
  })
})
