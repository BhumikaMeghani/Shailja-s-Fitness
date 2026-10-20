import { describe, expect, it } from 'vitest'
import type { GoalId } from './types'
import { ADDITIONAL_GOAL_PRICE_PAISE, calculatePlanPrice, EMPTY_SELECTION_FALLBACK_GOAL, FIRST_GOAL_PRICE_PAISE, formatInr } from './pricing'
import { GOAL_TAGS } from './goals'

const goals = GOAL_TAGS.map(tag => tag.id) as GoalId[]

/** README 4.2 pricing table: selected goals → expected INR total. */
const priceTable: Array<[number, number]> = [
  [1, 800], [2, 1000], [3, 1200], [4, 1400], [5, 1600],
  [6, 1800], [8, 2200], [10, 2600], [12, 3000],
]

describe('agreed pricing rules', () => {
  it('use ₹800 for the first goal plus ₹200 per additional goal', () => {
    expect(FIRST_GOAL_PRICE_PAISE).toBe(80000)
    expect(ADDITIONAL_GOAL_PRICE_PAISE).toBe(20000)
    for (const [selected, expected] of priceTable) {
      // + ₹200 × (n − 1), never derived from anything else.
      expect(80000 + 20000 * (selected - 1)).toBe(expected * 100)
      const price = calculatePlanPrice(goals.slice(0, selected))
      expect(price.chargedGoalCount).toBe(selected)
      expect(price.totalAmountPaise).toBe(expected * 100)
      expect(price.usedFallback).toBe(false)
    }
  })

  it('maps an empty selection to general_wellness at the one-goal price', () => {
    const price = calculatePlanPrice([])
    expect(price.usedFallback).toBe(true)
    expect(price.chargedGoalCount).toBe(1)
    expect(price.totalAmountPaise).toBe(80000)
    expect(price.additionalGoalCount).toBe(0)
    expect(EMPTY_SELECTION_FALLBACK_GOAL).toBe('general_wellness')
  })

  it('de-duplicates goal IDs before pricing so repeats cannot change the total', () => {
    const price = calculatePlanPrice(['better_sleep', 'better_sleep', 'posture_mobility'])
    expect(price.selectedGoalCount).toBe(2)
    expect(price.duplicatesRemoved).toBe(1)
    expect(price.chargedGoalCount).toBe(2)
    expect(price.totalAmountPaise).toBe(100000)
  })

  it('formats whole-paise amounts as INR display values', () => {
    expect(formatInr(80000)).toBe('₹800')
    expect(formatInr(100000)).toBe('₹1,000')
    expect(formatInr(300000)).toBe('₹3,000')
  })
})
