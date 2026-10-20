import type { GoalId } from './types'

/**
 * The 12 stable goal tags, in questionnaire order. Checkbox labels map to
 * these IDs during validation/normalisation (Matching rule 1).
 */
export interface GoalTag {
  id: GoalId
  label: string
}

export const GOAL_TAGS: readonly GoalTag[] = [
  { id: 'general_wellness', label: 'General wellness' },
  { id: 'flexibility_stiffness', label: 'Flexibility and stiffness' },
  { id: 'stress_relaxation', label: 'Stress relief and relaxation' },
  { id: 'better_sleep', label: 'Better sleep' },
  { id: 'posture_mobility', label: 'Posture and mobility' },
  { id: 'neck_shoulder_tension', label: 'Neck and shoulder tension' },
  { id: 'energy_vitality', label: 'Energy and daily vitality' },
  { id: 'womens_wellness', label: 'Women’s wellness' },
  { id: 'strength_balance', label: 'Strength and balance' },
  { id: 'anxiety_restlessness', label: 'Anxiety and restlessness' },
  { id: 'headache_head_tension', label: 'Headache and head tension' },
  { id: 'knee_discomfort', label: 'Knee discomfort' },
] as const

export const GOAL_LABELS: Record<GoalId, string> = Object.fromEntries(
  GOAL_TAGS.map(tag => [tag.id, tag.label]),
) as Record<GoalId, string>

/** Maps a checkbox label to its stable ID, with a couple of tolerant variants. */
export function goalIdFromLabel(label: string): GoalId | null {
  const normalised = label.trim().toLowerCase()
  const found = GOAL_TAGS.find(tag => tag.label.toLowerCase() === normalised)
  if (found) return found.id
  const stripped = normalised.replace(/[^a-z0-9]+/g, '')
  return GOAL_TAGS.find(tag => tag.id.replace(/_/g, '') === stripped)?.id ?? null
}
