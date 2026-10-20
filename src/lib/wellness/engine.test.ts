import { describe, expect, it } from 'vitest'
import { generateWellnessPlan, ValidationError, MATCHING_RULES, SAFETY_RULES } from './engine'
import { GOAL_TAGS } from './goals'
import { yogaLibrary } from './yogaLibrary'
import { foodLibrary } from './foodLibrary'
import { isPlan, type WellnessPlanResult } from './types'

const baseAnswers = { name: 'Shailja', email: 'shailja@example.com', age: '32', goals: [] as string[] }

function plan(input: Partial<typeof baseAnswers> = {}) {
  const result: WellnessPlanResult = generateWellnessPlan({ ...baseAnswers, ...input })
  if (!isPlan(result)) throw new Error(`Expected a plan, got a deferral: ${JSON.stringify(result.notices)}`)
  return result
}

describe('libraries', () => {
  it('match the agreed catalog sizes', () => {
    expect(yogaLibrary).toHaveLength(72)
    expect(foodLibrary).toHaveLength(60)
    expect(GOAL_TAGS).toHaveLength(12)
    expect(MATCHING_RULES).toHaveLength(10)
    expect(SAFETY_RULES).toHaveLength(12)
  })

  it('connect every goal tag to reviewed, beginner-accessible yoga content', () => {
    for (const tag of GOAL_TAGS) {
      const qualifying = yogaLibrary.filter(activity =>
        activity.goalTags.includes(tag.id)
        && activity.reviewed
        && activity.level !== 'moderate'
        && (activity.category === 'practice' || activity.category === 'warmup'),
      )
      expect(qualifying.length, `no accessible yoga entry for ${tag.id}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('connect every goal tag to reviewed food tips', () => {
    for (const tag of GOAL_TAGS) {
      const qualifying = foodLibrary.filter(tip => tip.goalTags.includes(tag.id) && tip.reviewed)
      expect(qualifying.length, `no food tip for ${tag.id}`).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('validation and normalisation', () => {
  it('requires a numeric age and throws a plain-language error', () => {
    expect(() => plan({ age: '' })).toThrow(ValidationError)
    expect(() => plan({ age: 'not-a-number' })).toThrow(ValidationError)
  })

  it('defers for ages outside the designed range instead of guessing', () => {
    for (const age of ['5', '9', '101', '150']) {
      const result = generateWellnessPlan({ ...baseAnswers, age })
      expect(result.status).toBe('defer')
    }
  })

  it('discards unknown and duplicate goal labels and maps labels to stable IDs', () => {
    const result = plan({ goals: ['Knee discomfort', 'morning vibes', 'Knee discomfort'] })
    expect(result.selectedGoals).toContain('knee_discomfort')
    expect(result.selectedGoals).toHaveLength(1)
  })

  it('falls back to general wellness when nothing is selected', () => {
    const result = plan({ goals: [] })
    expect(result.selectedGoals).toEqual(['general_wellness'])
  })

  it('never lets name or email change the plan', () => {
    const reference = plan({ goals: ['Better sleep', 'Knee discomfort'] })
    const differentIdentity = plan({ name: 'Someone Else', email: 'other@example.com', goals: ['Better sleep', 'Knee discomfort'] })
    expect(differentIdentity.days.map(day => day.activities.map(entry => entry.activity.id)))
      .toEqual(reference.days.map(day => day.activities.map(entry => entry.activity.id)))
    expect(differentIdentity.food).toEqual(reference.food)
  })
})

describe('safety rules', () => {
  it('excludes knee-loading content for knee discomfort', () => {
    const result = plan({ goals: ['Knee discomfort'] })
    const ids = new Set(result.days.flatMap(day => day.activities.map(entry => entry.activity.id)))
    for (const activity of yogaLibrary.filter(item => ids.has(item.id))) {
      expect(activity.safetyFlags).not.toContain('knee_load')
    }
    const kneeNotice = result.notices.find(notice => notice.id === 'knee-care')
    expect(kneeNotice?.level).toBe('caution')
  })

  it('surfaces headache red-flag guidance and the not-a-treatment framing', () => {
    const result = plan({ goals: ['Headache and head tension'] })
    const headache = result.notices.find(notice => notice.id === 'headache-care')
    expect(headache?.level).toBe('caution')
    expect(headache?.message).toMatch(/medical assessment/i)
    expect(result.notices.some(notice => notice.id === 'not-medical')).toBe(true)
  })

  it('adjusts safely for older adults and younger users', () => {
    const elder = plan({ age: '70', goals: ['Strength and balance'] })
    expect(elder.notices.some(notice => notice.id === 'age-older')).toBe(true)
    for (const dayPlan of elder.days) {
      for (const entry of dayPlan.activities) {
        expect(entry.activity.safetyFlags).not.toContain('inversion')
        expect(entry.activity.safetyFlags).not.toContain('high_intensity')
      }
    }
    const teen = plan({ age: '14' })
    expect(teen.notices.some(notice => notice.id === 'age-younger')).toBe(true)
  })

  it('always explains what the information is used for', () => {
    const result = plan()
    const confirmation = result.notices.find(notice => notice.id === 'confirm-suitability')
    expect(confirmation?.message).toMatch(/pregnancy/i)
  })
})

describe('the 7-day schedule', () => {
  it('assembles seven days with rest or recovery included', () => {
    const result = plan({ goals: ['Stress relief and relaxation', 'Better sleep', 'General wellness'] })
    expect(result.days).toHaveLength(7)
    expect(result.days.filter(dayPlan => dayPlan.recoveryDay).length).toBeGreaterThanOrEqual(2)
    for (const dayPlan of result.days) {
      expect(dayPlan.totalMinutes).toBeLessThanOrEqual(40)
      expect(dayPlan.activities.length, `day ${dayPlan.day} is empty`).toBeGreaterThan(0)
    }
    expect(result.days[3].focus).toMatch(/[Rr]ecovery/)
  })

  it('avoids unnecessary repetition across normal days', () => {
    const result = plan({ goals: ['Flexibility and stiffness', 'Posture and mobility', 'Neck and shoulder tension'] })
    const normalDayIds = result.days.filter(dayPlan => !dayPlan.recoveryDay).flatMap(dayPlan => dayPlan.activities.map(entry => entry.activity.id))
    expect(new Set(normalDayIds).size).toBeGreaterThan(normalDayIds.length - 2)
  })

  it('keeps every plan activity reviewed, gentle, and explained', () => {
    const goals = ['Energy and daily vitality', 'Women’s wellness']
    const result = plan({ goals })
    let reserveFallbacks = 0
    for (const dayPlan of result.days) {
      for (const entry of dayPlan.activities) {
        // Reviewed content only, and always explained.
        expect(entry.activity.reviewed).toBe(true)
        expect(entry.reason).toMatch(/Chosen for:|gentle reviewed addition/)
        if (!entry.activity.goalTags.some(tag => result.selectedGoals.includes(tag))) {
          // The only allowed zero-overlap picks are gentle breath/rest placeholders.
          reserveFallbacks += 1
          expect(['breath', 'rest']).toContain(entry.activity.category)
          expect(entry.activity.level).not.toBe('moderate')
        }
      }
    }
    // Only the gentle essential slots (≤6 per week) may ever fall back.
    expect(reserveFallbacks).toBeLessThanOrEqual(6)
  })
})

describe('food tips', () => {
  it('gives everyone the balanced-eating foundation plus goal-specific picks', () => {
    const result = plan({ goals: ['Better sleep', 'Anxiety and restlessness'] })
    expect(result.food.foundation.length).toBeGreaterThan(3)
    expect(result.food.doTips.some(tip => tip.goalTags.includes('better_sleep'))).toBe(true)
    expect([...result.food.limitTips, ...result.food.avoidTips].length).toBeGreaterThan(0)
  })

  it('removes duplicate tips across goals and groups', () => {
    const result = plan({ goals: ['Stress relief and relaxation', 'Better sleep', 'Better sleep', 'Knee discomfort', 'Energy and daily vitality'] })
    const all = [...result.food.foundation, ...result.food.doTips, ...result.food.limitTips, ...result.food.avoidTips].map(tip => tip.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('never prescribes limit/avoid tips stronger than safety framing allows', () => {
    const result = plan({ goals: ['Better sleep'] })
    for (const tip of [...result.food.limitTips, ...result.food.avoidTips]) {
      expect(tip.text).not.toMatch(/calorie|supplement|detox/i)
    }
  })
})
