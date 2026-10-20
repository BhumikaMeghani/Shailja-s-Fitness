import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import seed from '../../../convex/wellnessSeed.json'
import {
  CONTENT_VERSION, ROUTE_POSES, SYMPTOMS, BP_GOALS, classifyBp, validateBpInput,
  prepareBpRecommendation, routeForCategory, completeBpRecommendation, validBpCatalog,
  immediateBpSafety, type BpInput, type BpCatalog, type BpRoute,
} from './bpEngine'

const base: BpInput = { systolic: 118, diastolic: 76, weight: 72, weightUnit: 'kg',
  symptoms: [], exerciseRestricted: false, goal: 'general_wellness' }
const catalog = (route: BpRoute): BpCatalog => ({
  route, version: CONTENT_VERSION, reviewStatus: 'pending_professional_review',
  poses: seed.poses[route], diet: seed.diet[route], safetyMessage: seed.routeSafety[route],
})
function generate(patch: Partial<BpInput> = {}) {
  const value = validateBpInput({ ...base, ...patch })
  if (!value.ok) throw new Error(JSON.stringify(value.errors))
  const result = prepareBpRecommendation(value.input)
  return result.status === 'ok' ? completeBpRecommendation(result, catalog(routeForCategory(result.bpCategory))) : result
}

describe('adult BP and weight engine', () => {
  it.each([
    [118, 76, 'normal'], [125, 78, 'elevated'], [135, 85, 'high_stage_1'],
    [150, 95, 'high_stage_2'], [88, 58, 'low'], [185, 100, 'severe'], [125, 122, 'severe'],
    [90, 60, 'normal'], [119, 79, 'normal'], [120, 79, 'elevated'], [129, 79, 'elevated'],
    [130, 79, 'high_stage_1'], [120, 80, 'high_stage_1'], [139, 89, 'high_stage_1'],
    [140, 89, 'high_stage_2'], [130, 90, 'high_stage_2'], [180, 120, 'high_stage_2'],
    [181, 120, 'severe'], [180, 121, 'severe'], [89, 60, 'low'], [110, 59, 'low'],
    [135, 55, 'high_stage_1'], [150, 55, 'high_stage_2'], [185, 55, 'severe'],
  ] as const)('routes %s/%s as %s', (systolic, diastolic, category) => {
    const result = generate({ systolic, diastolic })
    expect(result.bpCategory).toBe(category)
    expect(result.recommendations).toHaveLength(category === 'severe' ? 0 : 3)
    if (result.status === 'ok') expect(result.recommendations.map(p => p.id)).toEqual(ROUTE_POSES[routeForCategory(category)])
  })

  it('gives high/severe precedence over low across all supported plausible integer readings', () => {
    for (let sys = 50; sys <= 260; sys++) for (let dia = 30; dia <= 160 && dia < sys; dia++) {
      const expected = sys > 180 || dia > 120 ? 'severe' : sys >= 140 || dia >= 90 ? 'high_stage_2' :
        sys >= 130 || dia >= 80 ? 'high_stage_1' : sys < 90 || dia < 60 ? 'low' : sys >= 120 ? 'elevated' : 'normal'
      expect(classifyBp(sys, dia)).toBe(expected)
    }
  })

  it('stops the routine for consult symptoms only; every other combination shows poses', () => {
    for (const [systolic, diastolic] of [[118, 76], [125, 78], [135, 85], [150, 95], [88, 58], [185, 100]]) {
      for (const symptom of SYMPTOMS.filter(s => s.emergency)) {
        const result = generate({ systolic, diastolic, symptoms: [symptom.id], exerciseRestricted: true })
        expect(result.status).toBe('emergency')
        expect(result.recommendations).toEqual([])
        expect(result.dietGuidance).toBeNull()
        expect(result.consultSymptoms).toEqual([symptom.id])
      }
    }
    const mixed = generate({ systolic: 118, diastolic: 76, symptoms: ['dizziness', 'blurred_vision'] })
    expect(mixed.status).toBe('emergency')
    expect(mixed.consultSymptoms).toEqual(['blurred_vision'])
    // Non-gating symptoms, including chest pain, still get the route poses.
    for (const symptom of SYMPTOMS.filter(s => !s.emergency)) {
      const low = generate({ systolic: 88, diastolic: 58, symptoms: [symptom.id] })
      expect(low.status).toBe('ok')
      expect(low.consultSymptoms).toEqual([])
      expect(low.recommendations).toHaveProperty('length', 3)
      const high = generate({ systolic: 150, diastolic: 95, symptoms: [symptom.id] })
      expect(high.status).toBe('ok')
      expect(high.recommendations).toHaveProperty('length', 3)
    }
  })

  it('keeps restricted exercise and severe readings gated; consult symptoms take precedence', () => {
    for (const [systolic, diastolic] of [[118, 76], [125, 78], [135, 85], [150, 95], [88, 58]]) {
      expect(generate({ systolic, diastolic, exerciseRestricted: true }).status).toBe('exercise_restricted')
    }
    expect(generate({ systolic: 185, exerciseRestricted: true }).status).toBe('severe')
    expect(generate({ systolic: 185 }).safetyMessage).toContain('at least one minute')
    expect(immediateBpSafety({ ...base, symptoms: ['severe_breathlessness'], systolic: NaN })).toContain('Consult your doctor immediately')
    expect(immediateBpSafety({ ...base, symptoms: ['chest_pain'], systolic: NaN })).toBe('')
  })

  it('requires all inputs and rejects malformed/implausible values without guessing', () => {
    for (const key of ['systolic', 'diastolic', 'weight', 'weightUnit']) {
      const value: Record<string, unknown> = { ...base }
      delete value[key]
      expect(validateBpInput(value).ok).toBe(false)
    }
    for (const field of ['systolic', 'diastolic', 'weight']) {
      for (const value of [undefined, null, true, false, '', '118', [], {}, Infinity, -Infinity, NaN, -1, 0, 99999]) {
        expect(validateBpInput({ ...base, [field]: value }).ok).toBe(false)
      }
    }
    for (const patch of [{ systolic: 75 }, { diastolic: 118 }, { weight: 19 }, { weight: 401 },
      { weight: 40, weightUnit: 'lb' }, { weight: 900, weightUnit: 'lb' }, { weightUnit: 'stone' },
      { symptoms: 'chest_pain' }, { symptoms: ['unknown'] }, { symptoms: [true] },
      { exerciseRestricted: 'false' }, { goal: '__proto__' }, { goal: 'weight_loss' }]) {
      expect(validateBpInput({ ...base, ...patch }).ok).toBe(false)
    }
    expect(validateBpInput(null).ok).toBe(false)
    expect(validateBpInput([]).ok).toBe(false)
    const defaults = validateBpInput({ systolic: 118, diastolic: 76, weight: 72, weightUnit: 'kg' })
    expect(defaults.ok && defaults.input.goal).toBe('general_wellness')
  })

  it('weight, units and goals never change classification, poses or diet route; no height needed', () => {
    for (const [systolic, diastolic] of [[118, 76], [125, 78], [135, 85], [150, 95], [88, 58]]) {
      const reference = generate({ systolic, diastolic })
      for (const [weight, weightUnit] of [[20, 'kg'], [400, 'kg'], [158.7, 'lb']] as const) {
        for (const goal of Object.keys(BP_GOALS) as BpInput['goal'][]) {
          const result = generate({ systolic, diastolic, weight, weightUnit, goal })
          expect(result.bpCategory).toBe(reference.bpCategory)
          expect(result.recommendations).toEqual(reference.recommendations)
          expect(result.dietGuidance).toEqual(reference.dietGuidance)
          expect(result.weightGuidance).toContain(`${weight} ${weightUnit}`)
          expect(result.weightGuidance).toContain(BP_GOALS[goal].guidance)
          expect(JSON.stringify(result).toLowerCase()).not.toContain('bmi')
        }
      }
    }
  })

  it('validates fixed three-card/four-step content and all local original/fallback assets', () => {
    for (const route of ['normal', 'low', 'high'] as const) {
      const content = catalog(route)
      expect(validBpCatalog(content, route)).toBe(true)
      for (const pose of content.poses) for (const path of [pose.image.src, pose.image.fallback]) {
        expect(existsSync(`public${path}`)).toBe(true)
        expect(readFileSync(`public${path}`, 'utf8')).toContain('<svg')
        expect(pose.image.license).toContain('CC0-1.0')
      }
      expect(validBpCatalog({ ...content, poses: content.poses.slice(1) }, route)).toBe(false)
      expect(validBpCatalog({ ...content, version: 'unknown' }, route)).toBe(false)
      expect(validBpCatalog({ ...content, poses: [...content.poses].reverse() }, route)).toBe(false)
    }
    const stopped = prepareBpRecommendation({ ...base, symptoms: ['severe_breathlessness'] })
    expect(completeBpRecommendation(stopped, catalog('normal')).recommendations).toEqual([])
    expect(() => completeBpRecommendation(prepareBpRecommendation(base), catalog('high'))).toThrow('unavailable')
  })
})
