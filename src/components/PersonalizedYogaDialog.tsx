import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  MATCHING_RULES,
  SAFETY_RULES,
  ValidationError,
  generateWellnessPlan,
} from '~/lib/wellness/engine'
import { GOAL_LABELS, GOAL_TAGS } from '~/lib/wellness/goals'
import {
  calculatePlanPrice,
  formatInr,
  type PlanPrice,
} from '~/lib/wellness/pricing'
import {
  isPlan,
  type GoalId,
  type SafetyNotice,
  type WellnessPlan,
  type WellnessPlanResult,
} from '~/lib/wellness/types'

interface PersonalizedYogaDialogProps {
  openRequest: { seq: number } | null
  onOpenChange: (open: boolean) => void
}

type Stage = 'goals-form' | 'result'

const FOOD_GROUPS = [
  { key: 'doTips', label: 'Do', hint: 'Gentle additions that support your goals' },
  { key: 'limitTips', label: 'Limit', hint: 'Keep these occasional rather than daily' },
  { key: 'avoidTips', label: 'Avoid', hint: 'Worth stepping around for your wellbeing' },
] as const

/**
 * Prototype payment mode: the plan is generated behind a locked/blurred
 * preview and a clearly labelled demo button unlocks it locally. No payment
 * provider, card/UPI collection or real transaction is involved, and a
 * page refresh simply returns the plan to its locked state.
 */
const PAYMENT_MODE = 'demo' as const

export default function PersonalizedYogaDialog({ openRequest, onOpenChange }: PersonalizedYogaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [age, setAge] = useState('')
  const [selectedGoals, setSelectedGoals] = useState<GoalId[]>([])
  const [stage, setStage] = useState<Stage>('goals-form')
  const [error, setError] = useState('')
  const [result, setResult] = useState<WellnessPlanResult | null>(null)
  const [touchHasStarted, setTouchHasStarted] = useState(false)
  const [paymentMode, setPaymentMode] = useState<typeof PAYMENT_MODE | null>(null)
  /** Only the demo-payment action transitions the generated plan to unlocked. */
  const [isPlanUnlocked, setIsPlanUnlocked] = useState(false)
  const unlockButtonRef = useRef<HTMLButtonElement>(null)
  const planPrice = useMemo(
    () => (result && isPlan(result) ? calculatePlanPrice(result.selectedGoals) : null),
    [result],
  )
  const planLocked = Boolean(result && isPlan(result) && paymentMode === PAYMENT_MODE && !isPlanUnlocked)

  const goalToggled = (id: GoalId) => {
    setTouchHasStarted(true)
    setSelectedGoals(current => (current.includes(id) ? current.filter(goalId => goalId !== id) : [...current, id]))
  }

  const open = () => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    setError('')
  }

  const close = () => dialogRef.current?.close()

  const onDialogClose = () => {
    onOpenChange(false)
    returnFocusRef.current?.focus()
  }

  useEffect(() => {
    if (openRequest) open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest])

  // The lock overlay must clearly carry the next action for keyboard users.
  useEffect(() => {
    if (stage === 'result' && planLocked) unlockButtonRef.current?.focus()
  }, [planLocked, stage])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    // Name and email are collected only for identification and contact;
    // the engine intentionally ignores them when matching content.
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName) return setError('Please tell us your name so we can greet you properly.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return setError('Please enter a valid email address.')
    setTouchHasStarted(true)
    try {
      const planResult = generateWellnessPlan({
        name: trimmedName,
        email: trimmedEmail,
        age,
        goals: selectedGoals,
      })
      setResult(planResult)
      // A fresh plan is always locked again: only its own demo-payment
      // action unlocks it (README 4.5). Safety deferrals are never priced.
      setPaymentMode(isPlan(planResult) ? PAYMENT_MODE : null)
      setIsPlanUnlocked(false)
      setStage('result')
      dialogRef.current?.scrollTo({ top: 0 })
    } catch (submitError) {
      setError(submitError instanceof ValidationError ? submitError.message : 'The plan could not be prepared. Please check your answers and try again.')
    }
  }

  const unlockPlan = () => {
    if (paymentMode !== PAYMENT_MODE || isPlanUnlocked) return // idempotent; no duplicate orders
    setIsPlanUnlocked(true)
  }

  const restart = () => {
    setResult(null)
    setStage('goals-form')
    setError('')
    setPaymentMode(null)
    setIsPlanUnlocked(false)
    dialogRef.current?.scrollTo({ top: 0 })
  }

  const greetingName = useMemo(() => name.trim().split(/\s+/)[0] || 'friend', [name])
  // Live questionnaire pricing, recalculated from the goal IDs alone.
  const estimate = useMemo(() => calculatePlanPrice(selectedGoals), [selectedGoals])

  const noticeStyle = (level: SafetyNotice['level']) =>
    level === 'defer' ? 'wellness-notice defer' : level === 'caution' ? 'wellness-notice caution' : 'wellness-notice'

  return (
    <dialog ref={dialogRef} className="wellness-shell" aria-labelledby="wellness-title" onClose={onDialogClose}>
      <div className="booking-shell">
        <header className="booking-header">
          <a className="brand compact" href="#" tabIndex={-1}>
            <img src="/brand.svg" width={30} height={38} alt="" />
            <span>Shailja’s <strong>Fitness</strong></span>
          </a>
          <button className="icon-button" aria-label="Close personalised plan" onClick={close}>×</button>
        </header>

        <div className="booking-body">
          {stage === 'goals-form' && (
            <>
              <div className="eyebrow">PERSONALISED YOGA &amp; NUTRITION</div>
              <h2 id="wellness-title">A gentle plan, shaped around you.</h2>
              <p>
                Answer four small questions and we’ll assemble a 7‑day yoga plan plus food do’s and
                don’ts from our wellness library. Everyday wellness support — never a diagnosis or a
                treatment plan. Pricing is based on your goals: <strong>₹800</strong> for your first
                selected goal and <strong>₹200</strong> for each additional goal, updated live below.
              </p>

              {/* Manual validation keeps answers athlete-friendly and lets the
                  engine defer politely for out-of-range ages (README §10). */}
              <form className="wellness-form" onSubmit={submit} noValidate>
                <div className="wellness-grid-2">
                  <div className="field">
                    <label htmlFor="wellness-name">Your name</label>
                    <input
                      id="wellness-name"
                      type="text"
                      autoComplete="name"
                      required
                      maxLength={80}
                      placeholder="e.g. Aarav"
                      value={name}
                      onChange={event => setName(event.target.value)}
                    />
                    <small>Used only to identify and greet you. It does not shape your plan or its price.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="wellness-email">Email address</label>
                    <input
                      id="wellness-email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      placeholder="you@example.com"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                    />
                    <small>Only for contacting you about your plan, if needed. It does not shape your plan or its price.</small>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="wellness-age">Age</label>
                  <input
                    id="wellness-age"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={100}
                    step={1}
                    required
                    placeholder="Between 10 and 100"
                    value={age}
                    onChange={event => setAge(event.target.value)}
                  />
                  <small>Age helps us present gentler options where appropriate. It is never used to guess a health condition or change your price.</small>
                </div>

                <fieldset className="wellness-goals">
                  <legend>What are you looking for? <span aria-hidden="true">·</span> choose one or more</legend>
                  <div className="goal-grid">
                    {GOAL_TAGS.map(tag => (
                      <label key={tag.id} className={`goal-option${selectedGoals.includes(tag.id) ? ' selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedGoals.includes(tag.id)}
                          onChange={() => goalToggled(tag.id)}
                        />
                        {tag.label}
                      </label>
                    ))}
                  </div>
                  <small>
                    {touchHasStarted
                      ? selectedGoals.length
                        ? `${selectedGoals.length} goal${selectedGoals.length > 1 ? 's' : ''} selected.`
                        : 'Nothing selected yet. Leave everything unticked and we’ll charge the General wellness plan (₹800).'
                      : 'You can also leave all options unticked — we’ll start you with the General wellness plan at ₹800.'}
                  </small>
                  {/* Live price summary, recalculated as goals are ticked or unticked. */}
                  <PriceSummary price={estimate} ariaLive />
                </fieldset>

                {error && <p className="booking-error wellness-error" role="alert">{error}</p>}

                <div className="order-review" role="note" aria-label="Order review">
                  <h3>Review your order</h3>
                  <p>
                    {selectedGoals.length
                      ? `For: ${selectedGoals.map(id => GOAL_LABELS[id]).join(' · ')}.`
                      : 'For: General wellness (our fallback when no goal is chosen).'}
                  </p>
                  <p className="order-total">Total {formatInr(estimate.totalAmountPaise)}</p>
                  <p className="booking-micro">
                    Includes your personalised 7‑day yoga plan with instructions, modifications and
                    cautions, plus goal‑related food guidance. Everyday wellness support — a selected
                    goal is not a diagnosis, and no pose or food claim is medical advice.
                  </p>
                </div>

                <div className="booking-actions">
                  <button type="button" className="back-button" onClick={close}>← Not now</button>
                  <button className="button" type="submit">Generate plan <span>→</span></button>
                </div>
              </form>

              <details className="wellness-about">
                <summary>How this plan is generated &amp; kept safe</summary>
                <p className="booking-micro">
                  A rule-based engine matches your goals against a reviewed yoga and food library — no AI,
                  no guessing. Name and email never influence the selection. This is a prototype: the
                  payment step is a clearly labelled demo and no real money is collected.
                </p>
                <h3 className="wellness-rules-heading">Matching rules</h3>
                <ul className="wellness-rules">{MATCHING_RULES.map(rule => <li key={rule}>{rule}</li>)}</ul>
                <h3 className="wellness-rules-heading">Safety rules</h3>
                <ul className="wellness-rules">{SAFETY_RULES.map(rule => <li key={rule}>{rule}</li>)}</ul>
              </details>
            </>
          )}

          {stage === 'result' && result && result.status === 'defer' && (
            <>
              <div className="success-icon" style={{ background: '#efe2c3', color: '#8a6420' }}>◷</div>
              <h2 id="wellness-title">We’re pausing here — with care.</h2>
              {result.notices.map(notice => (
                <div key={notice.id} className={noticeStyle(notice.level)}>
                  <strong>{notice.title}</strong>
                  <p>{notice.message}</p>
                </div>
              ))}
              <p className="booking-micro">{result.defaultsNote}</p>
              <p className="booking-micro">
                No plan or payment step is offered here: safety guidance always comes before personalisation,
                and a demo payment can never turn a paused plan into a purchase.
              </p>
              <div className="result-actions">
                <button className="button" onClick={restart}>Check my answers again</button>
                <button className="button secondary" onClick={close}>Back to the studio ↗</button>
              </div>
            </>
          )}

          {stage === 'result' && result && isPlan(result) && planPrice && (
            <>
              <div className="eyebrow">YOUR PERSONALISED PLAN</div>
              <h2 id="wellness-title">Here’s a first week for you, {greetingName}.</h2>
              <p>
                Built from your goals:{' '}
                {result.selectedGoals.map(goalId => GOAL_LABELS[goalId]).join(' · ')}
              </p>

              {result.notices.map(notice => (
                <div key={notice.id} className={noticeStyle(notice.level)}>
                  <strong>{notice.title}</strong>
                  <p>{notice.message}</p>
                </div>
              ))}
              <p className="booking-micro">Demo payment · prototype — no real money is collected.</p>

              <div className="plan-stage">
                {planLocked && (
                  <div className="plan-lock-overlay" role="alertdialog" aria-labelledby="plan-lock-title" aria-describedby="plan-lock-desc">
                    <span className="plan-lock-icon" aria-hidden="true">🔒</span>
                    <h3 id="plan-lock-title" tabIndex={-1}>Your personalised plan is ready</h3>
                    <p id="plan-lock-desc">
                      {planPrice.chargedGoalCount} goal{planPrice.chargedGoalCount > 1 ? 's' : ''} →
                      {' '}{planPrice.chargedGoalCount > 1 ? `₹800 first goal + ₹200 × ${planPrice.additionalGoalCount} additional` : '₹800 for your first goal'} =
                      {' '}<strong>{formatInr(planPrice.totalAmountPaise)}</strong>
                    </p>
                    <button ref={unlockButtonRef} className="button" onClick={unlockPlan}>
                      Complete demo payment and unlock plan <span aria-hidden="true">→</span>
                    </button>
                    <small>
                      Safe prototype step: no card, UPI or bank details are asked and no real
                      transaction happens — clicking simply unlocks the preview below.
                    </small>
                  </div>
                )}
                <div className="plan-body">
                  {!planLocked && (
                    <p className="demo-success" role="status">
                      Demo payment successful. Your plan is unlocked.
                    </p>
                  )}
                  {/* The paid content is blurred and non-interactive until the demo payment completes. */}
                  <div className={planLocked ? 'plan-content-lock' : undefined} inert={planLocked || undefined}>
                    <ol className="plan-days">
                      {result.days.map(dayPlan => (
                        <li key={dayPlan.day} className={`plan-day${dayPlan.recoveryDay ? ' recovery' : ''}`}>
                          <header className="plan-day-head">
                            <span className="plan-day-number">Day {dayPlan.day}</span>
                            <strong>{dayPlan.focus}</strong>
                            <span className="plan-day-total">
                              {dayPlan.recoveryDay ? 'Recovery' : `≈ ${dayPlan.totalMinutes} min`}
                            </span>
                          </header>
                          {dayPlan.activities.length ? (
                            <ul className="plan-activities">
                              {dayPlan.activities.map(entry => (
                                <li key={entry.activity.id} className="plan-activity">
                                  <details>
                                    <summary>
                                      <strong>{entry.activity.name}</strong>
                                      <span>{entry.activity.purpose} · {entry.activity.durationMinutes} min</span>
                                    </summary>
                                    <dl className="activity-detail">
                                      <dt>Purpose</dt><dd>{entry.activity.purpose}</dd>
                                      <dt>Duration</dt><dd>{entry.activity.durationMinutes} minutes</dd>
                                      <dt>Equipment</dt><dd>{entry.activity.equipment}</dd>
                                      <dt>Level</dt><dd className="capitals">{entry.activity.level}</dd>
                                      <dt>Steps</dt>
                                      <dd>
                                        <ol className="activity-steps">
                                          {entry.activity.steps.map((step, index) => <li key={index}>{step}</li>)}
                                        </ol>
                                      </dd>
                                      <dt>Form &amp; breathing</dt><dd>{entry.activity.breathCue}</dd>
                                      <dt>Easier modification</dt><dd>{entry.activity.modification}</dd>
                                      <dt>Cautions</dt>
                                      <dd>
                                        <ul className="activity-cautions">
                                          {entry.activity.cautions.map((caution, index) => <li key={index}>{caution}</li>)}
                                        </ul>
                                      </dd>
                                      <dt>Included for</dt><dd className="capitals">{entry.reason.replace('Chosen for: ', '').replace(/\.$/, '')}</dd>
                                    </dl>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="booking-micro">A rest day. Let your body absorb the week.</p>
                          )}
                        </li>
                      ))}
                    </ol>

                    <section className="food-section" aria-labelledby="food-heading">
                      <h3 id="food-heading">Food do’s and don’ts</h3>
                      <p>Flexible everyday guidance related to your goals. Nothing here prescribes calories or strict meal timings.</p>

                      <h4 className="food-group-heading">Everyday balanced eating</h4>
                      <ul className="food-tips">
                        {result.food.foundation.map(tip => <TipLine key={tip.id} tip={tip} group="Do" />)}
                      </ul>

                      {FOOD_GROUPS.map(group => {
                        const tips = result.food[group.key]
                        if (!tips.length) return null
                        return (
                          <div key={group.key}>
                            <h4 className="food-group-heading">{group.label} <small>{group.hint}</small></h4>
                            <ul className="food-tips">
                              {tips.map(tip => <TipLine key={tip.id} tip={tip} group={group.label} />)}
                            </ul>
                          </div>
                        )
                      })}
                    </section>
                  </div>

                  {!planLocked && (
                    <div className="result-actions">
                      <button className="button secondary" onClick={restart}>Generate another plan</button>
                      <button className="button" onClick={close}>Back to wellness ↗</button>
                    </div>
                  )}
                </div>
              </div>
              {!planLocked && (
                <p className="booking-micro">
                  Choice tips were matched by goal tags only; space is kept for the foods and routines you already enjoy.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="booking-footer">
          <span aria-hidden="true">♧</span> Wellness support, not medical advice. Your details stay protected.
        </footer>
      </div>
    </dialog>
  )
}

/** Compact live price summary (README 4.3: count + breakdown + total, always visible). */
function PriceSummary({ price, ariaLive = false }: { price: PlanPrice; ariaLive?: boolean }) {
  return (
    <div className="wellness-price" aria-live={ariaLive ? 'polite' : undefined}>
      <h3>Price summary</h3>
      <ul>
        <li>
          <span>{price.usedFallback ? 'General wellness (default)' : 'First selected goal'}</span>
          <span>{formatInr(price.baseAmountPaise)}</span>
        </li>
        <li>
          <span>Additional goals ({price.additionalGoalCount} × ₹200)</span>
          <span>{formatInr(price.additionalAmountPaise)}</span>
        </li>
        <li className="wellness-price-total">
          <span>
            {price.usedFallback
              ? 'Total · 1 goal (fallback)'
              : `Total · ${price.selectedGoalCount} goal${price.selectedGoalCount > 1 ? 's' : ''} selected`}
          </span>
          <span>{formatInr(price.totalAmountPaise)}</span>
        </li>
      </ul>
      <small>Updates as you tick or untick goals. This prototype collects no money.</small>
    </div>
  )
}

function TipLine({ tip, group }: { tip: { text: string; examples?: string; safetyNote?: string }; group: string }) {
  return (
    <li className="food-tip">
      <span className={`food-badge ${group.toLowerCase()}`}>{group}</span>
      <span>
        {tip.text}
        {tip.examples && <small className="food-examples">{tip.examples}</small>}
        {tip.safetyNote && <small className="food-safety">{tip.safetyNote}</small>}
      </span>
    </li>
  )
}
