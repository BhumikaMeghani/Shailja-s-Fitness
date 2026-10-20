/**
 * Shared types for the rule-based Personalised Yoga & Nutrition feature.
 * The libraries are content catalogs; the engine (engine.ts) does all
 * selection and assembly. Content is a draft pending professional review.
 */

/** The 12 stable goal IDs that connect questionnaire checkboxes to library content. */
export type GoalId =
  | 'general_wellness'
  | 'flexibility_stiffness'
  | 'stress_relaxation'
  | 'better_sleep'
  | 'posture_mobility'
  | 'neck_shoulder_tension'
  | 'energy_vitality'
  | 'womens_wellness'
  | 'strength_balance'
  | 'anxiety_restlessness'
  | 'headache_head_tension'
  | 'knee_discomfort'

/** Beginner-accessible options are preferred because experience is not collected. */
export type Level = 'beginner' | 'gentle' | 'moderate'

/**
 * Content safety vocabulary. The engine uses these to filter activities that
 * conflict with a user's stated concerns (e.g. knee_load out when knee
 * discomfort is selected).
 */
export type SafetyFlag =
  | 'knee_load'
  | 'wrist_load'
  | 'inversion'
  | 'deep_backbend'
  | 'intense_core'
  | 'balance_care'
  | 'high_intensity'

export interface YogaActivity {
  id: string
  name: string
  purpose: string
  /** Stable goal IDs this activity can serve. */
  goalTags: GoalId[]
  level: Level
  durationMinutes: number
  equipment: string
  /** How the activity slot is used when assembling the 7-day schedule. */
  category: 'warmup' | 'practice' | 'breath' | 'rest'
  /** Step-by-step instructions. */
  steps: string[]
  /** Form / breathing cue. */
  breathCue: string
  /** Easier modification. */
  modification: string
  /** Cautions for the user. Never medical claims. */
  cautions: string[]
  /** Empty array means no special loading/safety concern. */
  safetyFlags: SafetyFlag[]
  /** Unreviewed entries are filtered out until a professional signs off. */
  reviewed: boolean
}

export type FoodTag = 'do' | 'limit' | 'avoid'

export interface FoodTip {
  id: string
  text: string
  /** Practical, culturally suitable examples (e.g. local staple foods). */
  examples?: string
  goalTags: GoalId[]
  tag: FoodTag
  /** Optional safety-facing note shown with the tip. */
  safetyNote?: string
  reviewed: boolean
}

/* ------------------------------------------------------------------ */
/* Answers and results                                                 */
/* ------------------------------------------------------------------ */

export interface WellnessAnswers {
  name: string
  email: string
  age: number
  goals: GoalId[]
}

export type NoticeLevel = 'info' | 'caution' | 'defer'

export interface SafetyNotice {
  id: string
  level: NoticeLevel
  title: string
  message: string
}

export interface PlanActivity {
  activity: YogaActivity
  reason: string
}

export interface PlanDay {
  day: number
  focus: string
  totalMinutes: number
  activities: PlanActivity[]
  recoveryDay: boolean
}

export interface FoodSelection {
  /** Basic balanced-eating guidance everyone receives. */
  foundation: FoodTip[]
  doTips: FoodTip[]
  limitTips: FoodTip[]
  avoidTips: FoodTip[]
}

export interface WellnessPlan {
  status: 'plan'
  /** Normalised goal IDs actually used for matching. */
  selectedGoals: GoalId[]
  days: PlanDay[]
  food: FoodSelection
  notices: SafetyNotice[]
  /** Short summary of safe defaults the engine applied. */
  defaultsNote: string
}

/**
 * No normal exercise plan is generated automatically when safety rules
 * say a regular plan may not be appropriate.
 */
export interface WellnessDeferral {
  status: 'defer'
  notices: SafetyNotice[]
  defaultsNote: string
}

export type WellnessPlanResult = WellnessPlan | WellnessDeferral

export function isPlan(result: WellnessPlanResult): result is WellnessPlan {
  return result.status === 'plan'
}
