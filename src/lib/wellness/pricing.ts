/**
 * Agreed prototype pricing for the Personalised Yoga Plan
 * (README section 4.1): ₹800 for the first selected goal plus ₹200 for each
 * additional goal. Amounts are kept in paise — the smallest INR currency
 * unit — so they can be carried into a real payment integration unchanged.
 *
 * Pricing depends only on validated goal IDs. It never considers name,
 * email, age or match scores, and the empty selection falls back to the
 * general_wellness one-goal price rather than ₹0.
 */

import type { GoalId } from './types'

export const FIRST_GOAL_PRICE_PAISE = 80000
export const ADDITIONAL_GOAL_PRICE_PAISE = 20000
/** Charged when nothing is selected (README 3.4 empty-selection rule). */
export const EMPTY_SELECTION_FALLBACK_GOAL: GoalId = 'general_wellness'

export interface PlanPrice {
  /** Unique valid goal IDs actually selected by the user (0 when empty). */
  selectedGoalCount: number
  /** Count used for pricing; at least 1 because of the fallback rule. */
  chargedGoalCount: number
  /** True when the empty-selection fallback was applied. */
  usedFallback: boolean
  /** Number of duplicate IDs collapsed before pricing. */
  duplicatesRemoved: number
  baseAmountPaise: number
  additionalGoalCount: number
  additionalAmountPaise: number
  totalAmountPaise: number
}

/**
 * De-duplicates the selection, applies the empty-selection fallback and
 * prices the result. The count (not the score or anything else) drives the
 * amount, mirroring the server-side rule for a future real payment flow.
 */
export function calculatePlanPrice(selectedGoalIds: GoalId[]): PlanPrice {
  const unique = [...new Set(selectedGoalIds)]
  const usedFallback = unique.length === 0
  const charged = usedFallback ? [EMPTY_SELECTION_FALLBACK_GOAL] : unique
  const chargedGoalCount = charged.length

  const baseAmountPaise = FIRST_GOAL_PRICE_PAISE
  const additionalGoalCount = Math.max(0, chargedGoalCount - 1)
  const additionalAmountPaise = additionalGoalCount * ADDITIONAL_GOAL_PRICE_PAISE

  return {
    selectedGoalCount: unique.length,
    chargedGoalCount,
    usedFallback,
    duplicatesRemoved: selectedGoalIds.length - unique.length,
    baseAmountPaise,
    additionalGoalCount,
    additionalAmountPaise,
    totalAmountPaise: baseAmountPaise + additionalAmountPaise,
  }
}

/** Formats a paise amount as an unambiguous INR display value, e.g. ₹1,000. */
export function formatInr(amountPaise: number): string {
  if (!Number.isInteger(amountPaise)) throw new RangeError('Price amounts must be whole paise.')
  return `₹${Math.round(amountPaise / 100).toLocaleString('en-IN')}`
}
