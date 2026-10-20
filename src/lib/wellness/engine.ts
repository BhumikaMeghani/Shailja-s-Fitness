/**
 * Rule-based plan generation for Shailja’s Personalised Yoga & Nutrition.
 *
 * The engine never invents content: it validates and normalises answers,
 * runs safety checks first, filters and ranks reviewed library entries by
 * goal-tag overlap, assembles a seven-day schedule with recovery, and
 * selects grouped food tips. Name and email are never personalisation
 * signals.
 */

import { yogaLibrary } from './yogaLibrary'
import { foodLibrary } from './foodLibrary'
import { GOAL_LABELS, goalIdFromLabel } from './goals'
import type {
  FoodSelection,
  FoodTip,
  GoalId,
  PlanActivity,
  PlanDay,
  SafetyFlag,
  SafetyNotice,
  WellnessAnswers,
  WellnessPlan,
  WellnessPlanResult,
  YogaActivity,
} from './types'

/* ------------------------------------------------------------------ */
/* Matching rules (10) — documentation of the behaviour below          */
/* ------------------------------------------------------------------ */

export const MATCHING_RULES: readonly string[] = [
  'M1 · Validate answers and normalise goal labels to the stable goal tags; reject an implausible age instead of guessing.',
  'M2 · An empty goal selection falls back to General wellness so everyone receives a usable plan.',
  'M3 · Name and email identify the visitor only. They never affect which yoga or food content is selected.',
  'M4 · Safety checks run before any content is selected; overriding rules can defer the plan entirely.',
  'M5 · Yoga entries are matched by goal-tag overlap and ranked by how many selected goals they serve. Beginner-accessible, reviewed entries are preferred because experience is not collected.',
  'M6 · Yoga entries that conflict with selected goals (loading or intensity flags) are filtered out, e.g. no knee-loading work when knee discomfort is selected.',
  'M7 · The seven-day schedule combines compatible warm-up, practice, breath and rest entries, keeps daily time manageable by a safe default limit, avoids unnecessary repetition and includes explicit recovery.',
  'M8 · If too few safe, relevant activities remain, the engine shows a smaller, gentler plan instead of padding it with unsuitable content.',
  'M9 · Food tips are matched by goal-tag overlap: the balanced-eating foundation always applies, a few goal-specific Do and Limit/Avoid tips are added per goal, and duplicates are removed.',
  'M10 · The engine never diagnoses, claims a cure, prescribes calories, strict meal schedules, supplements or detoxes, and never encourages moving through pain.',
]

/* ------------------------------------------------------------------ */
/* Safety rules (12)                                                   */
/* ------------------------------------------------------------------ */

export const SAFETY_RULES: readonly string[] = [
  'S1 · Run safety checks before selecting any activities; safety always outranks plan fullness.',
  'S2 · A selected goal is not a medical diagnosis. Nothing in a plan may claim to cure or treat a condition.',
  'S3 · Severe, sudden, persistent or unexplained symptoms (including headache red flags) must be assessed by a clinician and take precedence over routine plan generation.',
  'S4 · Knee discomfort is handled conservatively: activities flagged for knee loading are excluded, and the user is never encouraged to move through pain.',
  'S5 · Younger users (under 16) need an adult’s/guardian’s involvement; the plan is scaled gentler and flagged clearly.',
  'S6 · Older adults (66+) receive gentler sequencing: high-intensity and inversion work is avoided and transitions are unhurried.',
  'S7 · An age outside the plausible range defers the plan rather than guessing what the user meant.',
  'S8 · Injury, recent surgery, pregnancy or postpartum status, medical conditions or exercise restrictions cannot be detected by this form, so every plan advises confirming suitability with a qualified professional.',
  'S9 · If a safety override makes normal exercise inappropriate, return a deferral with guidance instead of a plan.',
  'S10 · Plans must include recovery days; daily rest content stays low-intensity by design.',
  'S11 · Name, email and age are used only as stated: identification, contact, and age-appropriate presentation. They are never used to infer health needs.',
  'S12 · Library content and rules are a draft; a qualified yoga professional and a nutrition professional must review them before public use, and every plan carries that notice.',
]

/* ------------------------------------------------------------------ */
/* Safe defaults (inputs the current form does not collect)            */
/* ------------------------------------------------------------------ */

const DEFAULT_MAX_DAY_MINUTES = 40 // No time limit is collected; a modest default keeps sessions manageable.
const MIN_AGE = 10
const MAX_AGE = 100
const FOUNDATION_LIMIT = 10
const GOAL_TIP_LIMIT = 8
const COMFORTABLE_POOL = 9 // activities needed for the full, varied schedule

/** Flags that make an entry unsuitable for the general reserve pool. */
const CAUTIOUS_FLAGS: Set<SafetyFlag> = new Set(['intense_core', 'high_intensity', 'inversion', 'deep_backbend'])

/* ------------------------------------------------------------------ */
/* Step 1–2 · Collect, validate and normalise answers                  */
/* ------------------------------------------------------------------ */

export class ValidationError extends Error {}

export function normaliseGoals(rawGoals: string[]): GoalId[] {
  const ids: GoalId[] = []
  for (const raw of rawGoals) {
    const id = /^\w+$/.test(raw) ? (GOAL_LABELS[raw as GoalId] ? (raw as GoalId) : null) : goalIdFromLabel(raw)
    if (id && !ids.includes(id)) ids.push(id)
  }
  // M2 · General Wellness fallback for an empty selection.
  return ids.length ? ids : ['general_wellness']
}

/* ------------------------------------------------------------------ */
/* Step 3 · Safety checks                                              */
/* ------------------------------------------------------------------ */

function safetyNotices(answers: WellnessAnswers, selectedGoals: GoalId[]): SafetyNotice[] {
  const notices: SafetyNotice[] = []
  notices.push({
    id: 'not-medical',
    level: 'info',
    title: 'General wellness support only',
    message: 'This plan is everyday wellness guidance, not a medical assessment. A selected goal is not a diagnosis, and no pose or food here is a treatment or cure. Stop any movement that causes pain and avoid pushing through discomfort.',
  })
  notices.push({
    id: 'confirm-suitability',
    level: 'info',
    title: 'Before you begin',
    message: 'The form does not ask about injuries, recent surgery, pregnancy or postpartum status, medical conditions or exercise restrictions. If any of these apply to you, please confirm with a qualified professional before following the plan.',
  })
  if (answers.age < 16) {
    notices.push({
      id: 'age-younger',
      level: 'caution',
      title: 'For younger practitioners',
      message: 'Because you are under 16, please involve a parent, guardian or teacher. Follow the gentler options, keep sessions short, and stop if anything feels uncomfortable.',
    })
  }
  if (answers.age >= 66) {
    notices.push({
      id: 'age-older',
      level: 'caution',
      title: 'Adjusted for older adults',
      message: 'High-intensity movements and inverted positions have been left out. Use wall or chair support near balance work, rise slowly, and keep everything unhurried.',
    })
  }
  if (selectedGoals.includes('knee_discomfort')) {
    notices.push({
      id: 'knee-care',
      level: 'caution',
      title: 'Knee care built in',
      message: 'Activities that place notable load on the knees have been excluded. Bend only as far as is comfortable, keep weight out of joint creases, and never move into pain. For an ongoing or worsening knee concern, have it assessed by a clinician before practicing.',
    })
  }
  if (selectedGoals.includes('headache_head_tension')) {
    notices.push({
      id: 'headache-care',
      level: 'caution',
      title: 'About headaches and head tension',
      message: 'Gentle neck, breath and rest content can support day-to-day comfort, but it is not a headache treatment. A severe, sudden, unusually persistent or unexplained headache — or a headache with other new symptoms — needs medical assessment before your wellness plan. Seek guidance promptly.',
    })
  }
  if (selectedGoals.includes('anxiety_restlessness')) {
    notices.push({
      id: 'anxiety-care',
      level: 'info',
      title: 'Restlessness and anxiety',
      message: 'The breath and rest content can help you feel settled in the moment. They are not a treatment for an anxiety condition; a mental-health professional remains the right support for that.',
    })
  }
  notices.push({
    id: 'draft-review',
    level: 'info',
    title: 'Preview library',
    message: 'This plan is assembled from a content library still awaiting sign-off by a qualified yoga professional and a nutrition professional before public launch.',
  })
  return notices
}

/* ------------------------------------------------------------------ */
/* Step 4 · Match yoga content                                         */
/* ------------------------------------------------------------------ */

interface ScoredActivity {
  activity: YogaActivity
  overlap: number
}

/** M6 · flags that conflict with user-selected goals or safe age defaults. */
function conflictingFlags(selectedGoals: GoalId[], age: number): Set<SafetyFlag> {
  const excluded = new Set<SafetyFlag>()
  if (selectedGoals.includes('knee_discomfort')) {
    excluded.add('knee_load')
    excluded.add('intense_core') // sudden deep core loading tends to grip the knees too
  }
  if (age >= 66) {
    excluded.add('high_intensity')
    excluded.add('inversion')
    excluded.add('balance_care')
  }
  return excluded
}

function matchYoga(selectedGoals: GoalId[], age: number): ScoredActivity[] {
  const excluded = conflictingFlags(selectedGoals, age)
  return yogaLibrary
    .filter(activity => activity.reviewed) // review status gate
    .filter(activity => !activity.safetyFlags.some(flag => excluded.has(flag)))
    .map(activity => ({
      activity,
      overlap: activity.goalTags.filter(tag => selectedGoals.includes(tag)).length,
    }))
    .filter(scored => scored.overlap > 0) // M5 · tag overlap required
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap
      // Prefer beginner-accessible options when experience is not collected.
      const accessibility = (s: ScoredActivity) => (s.activity.level === 'beginner' ? 0 : s.activity.level === 'gentle' ? 1 : 2)
      const gentle = accessibility(a) - accessibility(b)
      if (gentle !== 0) return gentle
      return a.activity.durationMinutes - b.activity.durationMinutes
    })
}

/* ------------------------------------------------------------------ */
/* Step 5 · Build the seven-day schedule                               */
/* ------------------------------------------------------------------ */

const DAY_TEMPLATES: { focus: string; recovery?: boolean; categories: Array<YogaActivity['category']> }[] = [
  { focus: 'Ease in gently', categories: ['warmup', 'practice', 'breath'] },
  { focus: 'Steady movement', categories: ['warmup', 'practice'] },
  { focus: 'Unwind and breathe', categories: ['breath', 'practice'] },
  { focus: 'Recovery and rest', recovery: true, categories: ['rest'] },
  { focus: 'Strength in softness', categories: ['warmup', 'practice', 'breath'] },
  { focus: 'Building rhythm', categories: ['practice', 'breath'] },
  { focus: 'Slow wind-down', recovery: true, categories: ['rest', 'breath'] },
]

function reasonFor(activity: YogaActivity, goals: GoalId[]): string {
  const served = activity.goalTags.filter(tag => goals.includes(tag)).map(tag => GOAL_LABELS[tag])
  return served.length ? `Chosen for: ${served.join(' · ')}.` : 'A gentle reviewed addition to keep the week balanced.'
}

function buildSchedule(pool: ScoredActivity[], selectedGoals: GoalId[]): PlanDay[] {
  const smallerPlan = pool.length < COMFORTABLE_POOL
  // Fallback pool for essential slots (breath / rest): goal overlap is preferred
  // on these days but must not leave a recovery day empty.
  const reservePool = yogaLibrary
    .filter(activity => activity.reviewed && activity.durationMinutes <= 20)
    .filter(activity => !activity.safetyFlags.some(flag => CAUTIOUS_FLAGS.has(flag)))
    .map(activity => ({ activity, overlap: activity.goalTags.filter(tag => selectedGoals.includes(tag)).length }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap
      const accessibility = (s: ScoredActivity) => (s.activity.level === 'beginner' ? 0 : s.activity.level === 'gentle' ? 1 : 2)
      return accessibility(a) - accessibility(b)
    })

  const used = new Set<string>()
  const pickNext = (category: YogaActivity['category'], allowedPools: ScoredActivity[][], chosen: PlanActivity[]): ScoredActivity | null => {
    let fallback: ScoredActivity | null = null
    for (const allowedPool of allowedPools) {
      for (const scored of allowedPool) {
        const { activity } = scored
        if (activity.category !== category) continue
        // Keep total daily minutes manageable (safe default — no time limit is collected).
        const minutesSoFar = chosen.reduce((sum, entry) => sum + entry.activity.durationMinutes, 0)
        if (minutesSoFar + activity.durationMinutes > DEFAULT_MAX_DAY_MINUTES) continue
        // M7 · avoid unnecessary repetition: prefer never-used entries.
        if (used.has(activity.id)) {
          fallback ??= scored
          continue
        }
        return scored
      }
    }
    return fallback
  }

  const days: PlanDay[] = []
  DAY_TEMPLATES.forEach((template, index) => {
    // M8 · a smaller plan rather than padding with unsuitable content.
    const categories = smallerPlan
      ? template.recovery ? (['rest'] as const) : template.categories.slice(0, 1)
      : template.categories
    const activities: PlanActivity[] = []
    for (const category of categories) {
      // Essential slots may dip into the reserve pool; content slots stay strict.
      const allowedPools = (category === 'breath' || category === 'rest')
        ? [pool, reservePool]
        : [pool]
      const scored = pickNext(category, allowedPools, activities)
      if (!scored) continue
      used.add(scored.activity.id)
      activities.push({ activity: scored.activity, reason: reasonFor(scored.activity, selectedGoals) })
    }
    days.push({
      day: index + 1,
      focus: template.focus,
      recoveryDay: Boolean(template.recovery),
      totalMinutes: activities.reduce((sum, entry) => sum + entry.activity.durationMinutes, 0),
      activities,
    })
  })
  return days
}

/* ------------------------------------------------------------------ */
/* Step 6 · Match food tips                                            */
/* ------------------------------------------------------------------ */

function matchFood(selectedGoals: GoalId[]): FoodSelection {
  // M9 · reviewed tips only, then split the foundation from goal-specific picks.
  const reviewed = foodLibrary.filter(tip => tip.reviewed)
  const foundation = reviewed.filter(
    tip => tip.tag === 'do' && tip.goalTags.length === 1 && tip.goalTags[0] === 'general_wellness',
  ).slice(0, FOUNDATION_LIMIT)

  const seen = new Set<string>(foundation.map(tip => tip.id))
  const doTips: FoodTip[] = []
  const limitTips: FoodTip[] = []
  const avoidTips: FoodTip[] = []
  let goalSpecific = 0

  const add = (tip: FoodTip) => {
    if (seen.has(tip.id) || goalSpecific >= GOAL_TIP_LIMIT) return
    seen.add(tip.id)
    goalSpecific += 1
    if (tip.tag === 'do') doTips.push(tip)
    else if (tip.tag === 'limit') limitTips.push(tip)
    else avoidTips.push(tip)
  }

  const ranked = [...selectedGoals].sort((a, b) => {
    // Keep General wellness first; other goals keep their selection order.
    if (a === 'general_wellness') return -1
    if (b === 'general_wellness') return 1
    return 0
  })
  for (const goal of ranked) {
    // A couple of goal-specific Do tips, then one Limit or Avoid tip.
    reviewed.filter(tip => tip.tag === 'do' && tip.goalTags.includes(goal))
      .slice(0, 2)
      .forEach(add)
    reviewed.filter(tip => tip.tag !== 'do' && tip.goalTags.includes(goal))
      .slice(0, 1)
      .forEach(add)
  }
  return { foundation, doTips, limitTips, avoidTips }
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

function defaultsNote(selectedGoals: GoalId[], age: number, poolSize: number): string {
  const parts = [
    'Experience level, weekly days and session length are not collected by this form, so safe defaults were used: beginner-accessible entries first, sessions kept at or under '
      + `${DEFAULT_MAX_DAY_MINUTES} minutes, and two recovery days.`,
  ]
  if (selectedGoals[0] === 'general_wellness') {
    parts.push('No goals were ticked, so the agreed General wellness fallback was applied.')
  }
  if (age < 16 || age >= 66) parts.push(`Age ${age} triggered the age-appropriate gentler pathway.`)
  if (selectedGoals.includes('knee_discomfort')) parts.push('Knee-loading activities were removed before assembly.')
  if (poolSize < COMFORTABLE_POOL) parts.push('Fewer relevant activities remained after filtering, so a deliberately smaller plan is shown rather than an unsuitable one.')
  return parts.join(' ')
}

export function generateWellnessPlan(input: {
  name: string
  email: string
  age: number | string
  goals: string[]
}): WellnessPlanResult {
  // Step 2 · Validate and normalise.
  const rawAge = String(input.age).trim()
  if (!rawAge || !/^\d+$/.test(rawAge)) throw new ValidationError('Please enter your age as a number of whole years.')
  const age = Math.round(Number(rawAge))
  if (age < MIN_AGE || age > MAX_AGE) {
    // S7 · Deferral instead of guessing.
    return {
      status: 'defer',
      defaultsNote: 'The age entered is outside the range this preview is designed for.',
      notices: [
        {
          id: 'age-defer',
          level: 'defer',
          title: 'This plan is not available for this age',
          message: `Please enter an age between ${MIN_AGE} and ${MAX_AGE}. For children or specific circumstances, working directly with a qualified yoga professional is the safer route.`,
        },
      ],
    }
  }
  const selectedGoals = normaliseGoals(input.goals)
  const answers: WellnessAnswers = {
    name: input.name.trim(),
    email: input.email.trim(),
    age,
    goals: selectedGoals,
  }

  // Step 3 · Safety checks come before content selection.
  const notices = safetyNotices(answers, selectedGoals)
  const deferred = notices.find(notice => notice.level === 'defer')
  if (deferred) {
    return { status: 'defer', notices, defaultsNote: 'A safety override paused normal plan generation.' }
  }

  // Step 4 · Find matching yoga content.
  const pool = matchYoga(selectedGoals, age)

  // Step 5 · Build the seven-day schedule.
  const days = buildSchedule(pool, selectedGoals)

  // Step 6 · Match food tips.
  const food = matchFood(selectedGoals)

  const plan: WellnessPlan = {
    status: 'plan',
    selectedGoals,
    days,
    food,
    notices,
    defaultsNote: defaultsNote(selectedGoals, age, pool.map(entry => entry.activity.id).length),
  }

  // Step 7 · Display. Result handed back to the caller for rendering.
  return plan
}
