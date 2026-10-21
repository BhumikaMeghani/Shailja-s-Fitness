/**
 * Pose photos for the Personalised Yoga Plan, keyed by `YogaActivity.id`.
 * Free-license photographs sourced from Wikimedia Commons and stored locally
 * in `public/yoga-poses/` so the plan, and its PDF/Word export, work offline
 * and without third-party hotlinking. The engine itself stays image-free:
 * the dialog component looks these up by id at render time.
 */
export interface YogaPoseImage {
  src: string
  alt: string
}

const POSE_ALTS = {
  y01: 'Seated meditation posture with hands resting on the lap',
  y02: 'Person seated cross-legged in an upright, calm meditation pose',
  y03: 'Person on hands and knees arching the back in the Cat shape',
  y04: 'Person standing tall with palms pressed together at the chest',
  y05: 'Person in a wide-legged standing side stretch',
  y06: 'Person in a deep standing forward fold, reaching to the floor',
  y07: 'Person kneeling on a mat with one leg extended back as a warm-up stretch',
  y08: 'Person seated cross-legged with the shoulders rolled open',
  y09: 'Person in a deep standing forward bend, hands flat on the floor',
  y10: 'Person lying on the back drawing one knee gently toward the chest',
  y11: 'Back view of a person standing and stretching upward for the spine',
  y12: 'Person lying back and hugging a knee to the chest',
  y13: 'Person standing tall and elongated in Mountain Pose',
  y14: 'Person balancing on one leg in Tree Pose',
  y15: 'Person in a strong wide-legged Warrior stance with arms reaching out',
  y16: 'Group practicing Sun Salutations in a bright yoga studio',
  y17: 'Person holding a bent-arm low push-up with arms close to the ribs',
  y18: 'Person sinking into a deep chair-pose squat',
  y19: 'Person holding a deep yoga squat with hands resting on the floor',
  y20: 'Person in a low lunge resting on the back knee',
  y21: 'Person folded forward with soft knees and hands on the floor',
  y22: 'Person in Downward-Facing Dog with hips high and hands pressing in',
  y23: 'Person with chest lifted in the Cobra-Sphinx backbend',
  y24: 'Person resting in a supported reclined chest-opening pose',
  y25: 'Group seated forward-folding toward the legs in a class',
  y26: 'Person in a seated gentle spinal twist',
  y27: 'Person lying back holding the knees in comfortably',
  y28: 'Person seated with the soles of the feet together and hands on the feet',
  y29: 'Person reclined with relaxed arms and bent knees in an open rest pose',
  y30: 'Person reclining into a deep pigeon-inspired hip stretch',
  y31: 'Person folded forward into Child’s Pose on a mat',
  y32: 'Person on one hand and knee extending the opposite leg',
  y33: 'Person holding a straight plank on hands and toes',
  y34: 'Person balanced on one hand with feet stacked in Side Plank',
  y35: 'Person in Boat Pose with shoulders and legs lifted toward each other',
  y36: 'Person lying on the back with a hand on the chest, breathing calmly',
  y37: 'Person in a plank-like hold on a mat at home',
  y38: 'Standing with the arms wrapped in the Eagle-arm lift',
  y39: 'Person gently holding the side of the neck while tilting the head',
  y40: 'Person lying with the legs supported high on a raised surface',
  y41: 'Person reclined flat with relaxed arms in a calm rest pose',
  y42: 'Group outdoors practicing standing stretches with arms overhead',
  y43: 'Person hinged forward with one leg lifted straight behind (Warrior III)',
  y44: 'Person balancing in Tree Pose on a mat indoors',
  y45: 'Group stretching upward in an early-morning outdoor class',
  y46: 'Group resting and rising in an early-morning stretch by the sea',
  y47: 'Person standing at a work counter stretching wrists and hands',
  y48: 'Person standing on a mat beside a chair, ready to practice',
  y49: 'Person in a downward-dog-like bend on a beach mat',
  y50: 'Group resting reclined with support under the knees in a calm studio',
  y51: 'Lying on the back with one leg raised and hands holding the foot',
  y52: 'Person in a careful shoulder-stand-style inversion',
  y53: 'Person in a bridge lift on the back with hips raised',
  y54: 'Person resting on the back with a hand on the chest, eyes closed',
  y55: 'Woman seated with eyes closed in a lotus-style meditation seat',
  y56: 'Person seated cross-legged practicing slow nose breathing',
  y57: 'Person seated on a mat meditating quietly with folded hands',
  y58: 'Person seated cross-legged with fingers at the nose during pranayama',
  y59: 'Person seated in a group class with eyes closed, breathing gently',
  y60: 'Group practicing brisk seated pranayama together in a hall',
  y61: 'Group seated together in a hall practicing slow breathing',
  y62: 'Person seated cross-legged in a relaxed outdoor pranayama session',
  y63: 'Group standing with arms stretched overhead toward the sky',
  y64: 'People resting flat on the back with long, quiet breaths',
  y65: 'Group resting on their backs in Savasana on mats',
  y66: 'Instructor guiding people resting deep on mats (Yoga Nidra-style)',
  y67: 'A calm, softly lit rest space with floor mats and cushions',
  y68: 'People folded forward resting on mats in the outdoors',
  y69: 'Person rotating the waist gently while standing',
  y70: 'Group lying at ease on mats across a hall',
  y71: 'Person resting flat on the back in dim, quiet surroundings',
  y72: 'Person resting comfortably on a cushioned mat with the knees bent',
} satisfies Record<string, string>

export const yogaPoseImages = Object.fromEntries(
  Object.entries(POSE_ALTS).map(([id, alt]) => [id, { src: `/yoga-poses/${id}.jpg`, alt }]),
) as Record<string, YogaPoseImage>

/** Category-level illustration fallbacks (same set the BP tool uses). */
const CATEGORY_FALLBACK: Record<'warmup' | 'practice' | 'breath' | 'rest', YogaPoseImage> = {
  warmup: { src: '/images/poses/cat-cow.svg', alt: 'Pose illustration unavailable — follow the steps below with a qualified instructor.' },
  practice: { src: '/images/poses/tadasana.svg', alt: 'Pose illustration unavailable — follow the steps below with a qualified instructor.' },
  breath: { src: '/images/poses/seated.svg', alt: 'Breathing illustration unavailable — follow the steps below.' },
  rest: { src: '/images/poses/corpse.svg', alt: 'Rest illustration unavailable — follow the steps below.' },
}

export function poseImageFor(activity: { id: string; category: 'warmup' | 'practice' | 'breath' | 'rest' }): YogaPoseImage {
  return yogaPoseImages[activity.id] ?? CATEGORY_FALLBACK[activity.category]
}
