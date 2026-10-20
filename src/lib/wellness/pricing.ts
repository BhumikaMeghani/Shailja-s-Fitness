/**
 * Agreed prototype pricing for the Personalised Yoga Plan:
 * the General wellness plan is the default included for everyone at ₹800,
 * and every other ticked plan adds ₹200 on top. Amounts are kept in paise —
 * the smallest INR currency unit — so they can be carried into a real
 * payment integration unchanged.
 *
 * Pricing depends only on validated goal IDs. It never considers name,
 * email, age or match scores, and the empty selection costs only the
 * default General wellness plan (₹800) rather than ₹0.
 */

import type { GoalId } from './types'

/** The plan everyone gets by default; its checkbox stays locked on. */
export const DEFAULT_PLAN_ID: GoalId = 'general_wellness'
export const DEFAULT_PLAN_PRICE_PAISE = 80000
export const ADD_ON_PLAN_PRICE_PAISE = 20000
/** Back-compat alias for the default plan ID. */
export const EMPTY_SELECTION_FALLBACK_GOAL: GoalId = DEFAULT_PLAN_ID

export interface PlanPrice {
  /** The always-included default plan (general_wellness). */
  defaultPlanId: GoalId
  /** Uniquely selected add-on goal IDs, in selection order. */
  addOnPlanIds: GoalId[]
  addOnPlanCount: number
  /** Fixed base price of the default plan. */
  baseAmountPaise: number
  /** Count of duplicate IDs collapsed before pricing. */
  duplicatesRemoved: number
  addOnAmountPaise: number
  totalAmountPaise: number
}

/**
 * De-duplicates the selection and prices it: ₹800 for the always-included
 * General wellness default plan plus ₹200 for each other unique plan.
 * The ticked plans (not the score or anything else) drive the amount,
 * mirroring the server-side rule for a future real payment flow.
 */
export function calculatePlanPrice(selectedGoalIds: GoalId[]): PlanPrice {
  const unique = [...new Set(selectedGoalIds)]
  const addOns = unique.filter(id => id !== DEFAULT_PLAN_ID)
  const addOnAmountPaise = addOns.length * ADD_ON_PLAN_PRICE_PAISE

  return {
    defaultPlanId: DEFAULT_PLAN_ID,
    addOnPlanIds: addOns,
    addOnPlanCount: addOns.length,
    baseAmountPaise: DEFAULT_PLAN_PRICE_PAISE,
    duplicatesRemoved: selectedGoalIds.length - unique.length,
    addOnAmountPaise,
    totalAmountPaise: DEFAULT_PLAN_PRICE_PAISE + addOnAmountPaise,
  }
}

/** Formats a paise amount as an unambiguous INR display value, e.g. ₹1,000. */
export function formatInr(amountPaise: number): string {
  if (!Number.isInteger(amountPaise)) throw new RangeError('Price amounts must be whole paise.')
  return `₹${Math.round(amountPaise / 100).toLocaleString('en-IN')}`
}
