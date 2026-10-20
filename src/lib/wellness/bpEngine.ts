/** Adult BP safety routing. Weight personalizes habits, never BP classification. */
export const CONTENT_VERSION = 'bp-wellness-v1'
export const BP_DISCLAIMER = 'General wellness information, not diagnosis or treatment. A single reading does not diagnose hypertension. Yoga and dietary advice do not replace prescribed medication or clinician guidance. Never stop or change medication yourself.'
/** Deprecated placeholder constant kept for import compatibility; rendered nowhere. */
export const REVIEW_NOTICE = ''
export const EMERGENCY_MESSAGE = 'Consult your doctor immediately.'
export const SEVERE_MESSAGE = 'Do not start yoga or exercise. Recheck after at least one minute and contact a healthcare professional immediately. If chest pain, severe breathlessness, fainting, severe headache, confusion, new weakness/numbness, or sudden vision/speech changes occur, seek emergency medical help now without waiting for a recheck.'
export const RESTRICTED_MESSAGE = 'Follow your clinician’s exercise restriction. No yoga plan is shown. Ask your clinician which activities, if any, are suitable before starting.'

/** Symptoms that stop the routine and ask the customer to consult a doctor. */
export const CONSULT_SYMPTOM_IDS = ['severe_breathlessness', 'severe_headache', 'blurred_vision'] as const

/** What each consult symptom can lead to, in simple language shown to the customer. */
export const SYMPTOM_EFFECTS: Record<typeof CONSULT_SYMPTOM_IDS[number], string> = {
  severe_breathlessness: 'It can be a sign that your heart or lungs are not keeping up, and your body may not be getting enough oxygen.',
  severe_headache: 'A sudden, severe headache can sometimes mean blood pressure is very high and needs checking without delay.',
  blurred_vision: 'It can happen when blood pressure affects the small blood vessels in your eyes, and may point to strain on your eyes, brain, or kidneys.',
}

export const SYMPTOMS = [
  { id: 'chest_pain', label: 'Chest pain', emergency: false },
  { id: 'severe_breathlessness', label: 'Severe breathlessness', emergency: true },
  { id: 'fainting', label: 'Fainting', emergency: false },
  { id: 'severe_headache', label: 'Severe headache', emergency: true },
  { id: 'confusion', label: 'Confusion', emergency: false },
  { id: 'new_weakness_numbness', label: 'New weakness / numbness', emergency: false },
  { id: 'vision_speech_changes', label: 'Sudden vision / speech changes', emergency: false },
  { id: 'dizziness', label: 'Dizziness', emergency: false },
  { id: 'weakness', label: 'General weakness', emergency: false },
  { id: 'near_fainting', label: 'Near-fainting', emergency: false },
  { id: 'blurred_vision', label: 'Blurred vision', emergency: true },
] as const
export const BP_GOALS = {
  general_wellness: { label: 'General wellness', guidance: 'Focus on regular balanced meals, comfortable activity, hydration as advised, and consistent sleep. Weight alone does not determine health or a target weight.' },
  maintain_weight: { label: 'Maintain weight', guidance: 'For your maintenance goal, build consistent balanced meals, enjoyable regular activity, and sleep habits. Ask a clinician or dietitian for individual guidance; no target weight is inferred from this entry.' },
  gradual_weight_management: { label: 'Gradual weight management', guidance: 'For your gradual weight-management goal, focus on sustainable eating habits, regular activity within your safety guidance, and consistent sleep. Seek a clinician or dietitian’s advice rather than crash diets. No target weight or weight-loss promise is made.' },
} as const
export type BpGoal = keyof typeof BP_GOALS
export type BpCategory = 'normal' | 'elevated' | 'high_stage_1' | 'high_stage_2' | 'low' | 'severe'
export type BpRoute = 'normal' | 'low' | 'high'
export type Symptom = typeof SYMPTOMS[number]['id']
export interface BpInput {
  systolic: number
  diastolic: number
  weight: number
  weightUnit: 'kg' | 'lb'
  symptoms: Symptom[]
  exerciseRestricted: boolean
  goal: BpGoal
}
export interface BpPose {
  id: string
  name: string
  displayName: string
  benefits: string
  steps: string[]
  safetyNote: string
  image: { src: string; alt: string; license: string; fallback: string }
}
export interface BpCatalog {
  route: BpRoute
  version: string
  reviewStatus: 'pending_professional_review' | 'reviewed'
  poses: BpPose[]
  diet: { do: string[]; dont: string[] }
  safetyMessage: string
}
export interface BpResult {
  status: 'ok' | 'emergency' | 'severe' | 'exercise_restricted'
  /** Symptoms the customer selected that require a doctor consult (empty otherwise). */
  consultSymptoms: Symptom[]
  inputs: BpInput & { bpUnit: 'mmHg' }
  bpCategory: BpCategory
  categoryLabel: string
  explanation: string
  recommendations: BpPose[]
  dietGuidance: BpCatalog['diet'] | null
  dietGuidanceKey: BpRoute | null
  weightPersonalization: BpGoal
  weightGuidance: string
  safetyMessage: string
  disclaimer: string
}
export const CATEGORIES: Record<BpCategory, { label: string; explanation: string }> = {
  normal: { label: 'Normal BP reference', explanation: 'Both numbers are below 120/80 mmHg and neither is in the low range. One reading is not a diagnosis.' },
  elevated: { label: 'Elevated BP', explanation: 'Systolic is 120–129 and diastolic is below 80 mmHg. Monitor readings and discuss a sustained pattern with a clinician.' },
  high_stage_1: { label: 'High BP — Stage 1', explanation: 'Systolic is 130–139 or diastolic is 80–89 mmHg. The higher-risk number determines the category. Keep a BP log and arrange clinician follow-up.' },
  high_stage_2: { label: 'High BP — Stage 2', explanation: 'Systolic is at least 140 or diastolic is at least 90 mmHg. The higher-risk number determines the category. Contact a clinician promptly for assessment and follow-up.' },
  low: { label: 'Low BP reference', explanation: 'Systolic is below 90 or diastolic is below 60 mmHg, with no high value taking precedence. Discuss recurring low readings or symptoms with a clinician.' },
  severe: { label: 'Severe BP reading', explanation: 'Systolic is above 180 or diastolic is above 120 mmHg. A safety response takes priority over a routine yoga plan.' },
}
export const ROUTE_POSES: Record<BpRoute, readonly string[]> = {
  normal: ['normal_tadasana', 'normal_cat_cow', 'normal_balasana'],
  low: ['low_supta_baddha_konasana', 'low_makarasana', 'low_supported_side_lying_rest'],
  high: ['high_sukhasana', 'high_supported_tadasana', 'high_shavasana'],
}

export function validateBpInput(value: unknown): { ok: true; input: BpInput } | { ok: false; errors: Record<string, string> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: { form: 'Enter a complete set of readings.' } }
  }
  const data = value as Record<string, unknown>
  const errors: Record<string, string> = {}
  for (const [key, min, max] of [['systolic', 50, 260], ['diastolic', 30, 160], ['weight', 1, 1000]] as const) {
    const number = data[key]
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
      errors[key] = `Enter ${key} between ${min} and ${max}. Check the entry and re-measure unexpected readings.`
    }
  }
  if (data.weightUnit !== 'kg' && data.weightUnit !== 'lb') errors.weightUnit = 'Choose a weight unit: kg or lb.'
  else if (!errors.weight) {
    const kg = data.weightUnit === 'kg' ? data.weight as number : (data.weight as number) * 0.45359237
    if (kg < 20 || kg > 400) errors.weight = 'Check weight and unit: this adult tool supports 20–400 kg (about 44.1–881.8 lb).'
  }
  if (!errors.systolic && !errors.diastolic && (data.systolic as number) <= (data.diastolic as number)) {
    errors.diastolic = 'The bottom number must be lower than the top number. Check the entries and re-measure.'
  }
  const symptoms = data.symptoms ?? []
  if (!Array.isArray(symptoms) || symptoms.some(s => !SYMPTOMS.some(option => option.id === s))) {
    errors.symptoms = 'Choose symptoms from the listed options.'
  }
  const restricted = data.exerciseRestricted ?? false
  if (typeof restricted !== 'boolean') errors.exerciseRestricted = 'Choose whether a clinician has restricted exercise.'
  const goal = data.goal ?? 'general_wellness'
  if (typeof goal !== 'string' || !Object.hasOwn(BP_GOALS, goal)) errors.goal = 'Choose one of the listed wellness goals.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, input: {
    systolic: data.systolic as number, diastolic: data.diastolic as number,
    weight: data.weight as number, weightUnit: data.weightUnit as BpInput['weightUnit'],
    symptoms: symptoms as Symptom[], exerciseRestricted: restricted as boolean, goal: goal as BpGoal,
  } }
}

export function classifyBp(systolic: number, diastolic: number): BpCategory {
  if (systolic > 180 || diastolic > 120) return 'severe'
  // Explicit high-before-low precedence for mixed readings.
  if (systolic >= 140 || diastolic >= 90) return 'high_stage_2'
  if (systolic >= 130 || diastolic >= 80) return 'high_stage_1'
  if (systolic < 90 || diastolic < 60) return 'low'
  return systolic >= 120 ? 'elevated' : 'normal'
}

/** Also used for immediate warnings, even when fields/backend are unavailable. */
export function immediateBpSafety(data: { symptoms: readonly string[]; systolic: number; diastolic: number; exerciseRestricted: boolean }): string {
  if (data.symptoms.some(s => SYMPTOMS.some(option => option.id === s && option.emergency))) return EMERGENCY_MESSAGE
  if (data.systolic > 180 || data.diastolic > 120) return SEVERE_MESSAGE
  return data.exerciseRestricted ? RESTRICTED_MESSAGE : ''
}

export function prepareBpRecommendation(input: BpInput): BpResult {
  const category = classifyBp(input.systolic, input.diastolic)
  let status: BpResult['status'] = 'ok'
  if (input.symptoms.some(s => SYMPTOMS.some(option => option.id === s && option.emergency))) status = 'emergency'
  else if (category === 'severe') status = 'severe'
  else if (input.exerciseRestricted) status = 'exercise_restricted'
  return {
    status, inputs: { ...input, bpUnit: 'mmHg' }, bpCategory: category,
    categoryLabel: CATEGORIES[category].label, explanation: CATEGORIES[category].explanation,
    recommendations: [], dietGuidance: null, dietGuidanceKey: null,
    weightPersonalization: input.goal,
    weightGuidance: `You entered ${input.weight} ${input.weightUnit}. ${BP_GOALS[input.goal].guidance}`,
    safetyMessage: immediateBpSafety(input), disclaimer: BP_DISCLAIMER,
    consultSymptoms: status === 'emergency' ? input.symptoms.filter(s => (CONSULT_SYMPTOM_IDS as readonly string[]).includes(s)) : [],
  }
}

export function routeForCategory(category: BpCategory): BpRoute {
  if (category === 'severe') throw new Error('A severe reading has no yoga route.')
  return category.startsWith('high_') ? 'high' : category === 'low' ? 'low' : 'normal'
}

/** Reject missing/mismatched content, rather than mix unvetted poses into a plan. */
export function validBpCatalog(catalog: BpCatalog, route: BpRoute): boolean {
  return catalog.version === CONTENT_VERSION && catalog.route === route &&
    catalog.poses.length === 3 && catalog.poses.every((pose, index) =>
      pose.id === ROUTE_POSES[route][index] && pose.steps.length === 4 &&
      pose.steps.every(step => step.trim()) && Boolean(pose.name && pose.displayName && pose.benefits && pose.safetyNote) &&
      pose.image.src.startsWith('/images/poses/') && pose.image.fallback === '/images/poses/fallback.svg' &&
      Boolean(pose.image.alt && pose.image.license)) &&
    catalog.diet.do.length > 0 && catalog.diet.dont.length > 0 && Boolean(catalog.safetyMessage)
}

export function completeBpRecommendation(result: BpResult, catalog: BpCatalog): BpResult {
  if (result.status !== 'ok') return result
  const route = routeForCategory(result.bpCategory)
  if (!validBpCatalog(catalog, route)) throw new Error('Wellness content is unavailable pending review.')
  return { ...result, recommendations: catalog.poses, dietGuidance: catalog.diet,
    dietGuidanceKey: route, safetyMessage: catalog.safetyMessage }
}
