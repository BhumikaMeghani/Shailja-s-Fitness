/** The six bookable yoga plans. Each runs for 30 days; price is independent
 * of the Online / Studio / Private class format, which is chosen in booking. */
export interface YogaPlan {
  name: string
  price_paise: number
}

export const YOGA_PLANS: YogaPlan[] = [
  { name: 'Normal Yoga', price_paise: 150000 },
  { name: 'Therapeutic Yoga', price_paise: 250000 },
  { name: 'Kids Yoga', price_paise: 200000 },
  { name: 'Corporate Sessions', price_paise: 300000 },
  { name: 'Transformational Yoga', price_paise: 500000 },
  { name: 'Pregnancy Yoga', price_paise: 450000 },
]

export function planByName(name: string | null | undefined): YogaPlan | null {
  return YOGA_PLANS.find(plan => plan.name === name) ?? null
}

/** Prices are in paise; plans are quoted in whole rupees (₹1,500 style). */
export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export const PLAN_DURATION_DAYS = 30
