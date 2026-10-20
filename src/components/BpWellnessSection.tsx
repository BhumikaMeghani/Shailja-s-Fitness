import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, loadBootstrap } from '~/lib/api'
import {
  BP_DISCLAIMER, BP_GOALS, EMERGENCY_MESSAGE, REVIEW_NOTICE, SEVERE_MESSAGE, SYMPTOMS,
  immediateBpSafety, validateBpInput, type BpGoal, type BpPose, type BpResult, type Symptom,
} from '~/lib/wellness/bpEngine'

const INITIAL = { systolic: '', diastolic: '', weight: '', weightUnit: '', goal: 'general_wellness' as BpGoal,
  symptoms: [] as Symptom[], exerciseRestricted: false }

export default function BpWellnessSection() {
  const [form, setForm] = useState(INITIAL)
  const [touched, setTouched] = useState<string[]>([])
  const [result, setResult] = useState<BpResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const resultRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const payload = { ...form,
    systolic: form.systolic.trim() ? Number(form.systolic) : NaN,
    diastolic: form.diastolic.trim() ? Number(form.diastolic) : NaN,
    weight: form.weight.trim() ? Number(form.weight) : NaN,
  }
  const validated = validateBpInput(payload)
  const errors = validated.ok ? {} : validated.errors
  const safety = immediateBpSafety(payload)

  useEffect(() => () => { revision.current++ }, [])
  useEffect(() => {
    if (!result) return
    titleRef.current?.focus({ preventScroll: true })
    resultRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }, [result])

  function change(patch: Partial<typeof form>) {
    revision.current++
    setBusy(false)
    setResult(null)
    setError('')
    setForm(current => ({ ...current, ...patch }))
  }
  function reset() {
    change(INITIAL)
    setTouched([])
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !validated.ok) return
    const current = ++revision.current
    setBusy(true)
    setResult(null)
    setError('')
    try {
      // Refresh CSRF/session without retaining any readings in shared state.
      await loadBootstrap()
      if (current !== revision.current) return
      const next = await api<BpResult>('/api/wellness/recommend', validated.input as unknown as Record<string, unknown>)
      if (current === revision.current) setResult(next)
    } catch (failure) {
      if (current === revision.current) {
        setError(`${failure instanceof Error ? failure.message : 'Guidance is unavailable.'} No plan has been generated. For concerning readings or symptoms, seek medical help rather than waiting.`)
      }
    } finally {
      if (current === revision.current) setBusy(false)
    }
  }
  const errorFor = (name: string) => touched.includes(name) ? errors[name] : undefined
  const titles = {
    ok: result?.categoryLabel, emergency: 'Seek emergency medical help now', severe: 'Severe BP reading',
    low_bp_safety: 'Low BP with symptoms — pause and seek advice',
    exercise_restricted: 'Follow your clinician’s exercise restriction',
  }

  return (
    <section className="section wrap bp-wellness" id="programs" aria-labelledby="bp-heading">
      <div className="section-heading">
        <div><div className="eyebrow">A MINDFUL START, MADE FOR YOU</div><h2 id="bp-heading">Know your numbers.<br /><em>Move with care.</em></h2></div>
        <p>Blood pressure guides your gentle yoga route. Weight and your chosen goal inform everyday wellness guidance — never a diagnosis.</p>
      </div>
      <div className="bp-notice">
        <strong>General wellness only · Adults 18+</strong>
        <p>{BP_DISCLAIMER} This tool is not designed for children or pregnancy.</p>
        <p><strong>{REVIEW_NOTICE}</strong></p>
      </div>
      <div className="bp-layout">
        <form id="bp-form" className="bp-form" onSubmit={submit} onReset={reset} noValidate>
          <fieldset>
            <legend>01 / Your current readings</legend>
            <p className="bp-help">All three numbers and a weight unit are required. Use a recent resting BP reading.</p>
            <div className="bp-inputs">
              {([
                ['systolic', 'Systolic BP', 'Top number · mmHg', '118', 50, 260],
                ['diastolic', 'Diastolic BP', 'Bottom number · mmHg', '76', 30, 160],
                ['weight', 'Weight', 'Used without health labels', '72', 1, 1000],
              ] as const).map(([name, label, help, placeholder, min, max]) => (
                <div key={name}>
                  <label htmlFor={`bp-${name}`}>{label}<small>{help}</small></label>
                  <input id={`bp-${name}`} name={name} type="number" inputMode="decimal" required min={min} max={max} step="any"
                    value={form[name]} placeholder={`e.g. ${placeholder}`} onChange={event => change({ [name]: event.target.value })}
                    onBlur={() => setTouched(current => [...current, name, ...(name !== 'weight' ? ['diastolic'] : [])])}
                    aria-invalid={Boolean(errorFor(name))} aria-describedby={`bp-${name}-error`} />
                  <span className="bp-error" id={`bp-${name}-error`}>{errorFor(name)}</span>
                </div>
              ))}
              <div>
                <label htmlFor="bp-unit">Weight unit<small>Choose kg or lb</small></label>
                <select id="bp-unit" name="weightUnit" value={form.weightUnit} required
                  onChange={event => change({ weightUnit: event.target.value })}
                  onBlur={() => setTouched(current => [...current, 'weightUnit', 'weight'])}
                  aria-invalid={Boolean(errorFor('weightUnit'))} aria-describedby="bp-weightUnit-error">
                  <option value="">Select unit</option><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option>
                </select>
                <span id="bp-weightUnit-error" className="bp-error">{errorFor('weightUnit')}</span>
              </div>
            </div>
          </fieldset>
          <fieldset>
            <legend>02 / Safety check <small>Optional, but important</small></legend>
            <p className="bp-help">Select any symptoms you have now. Leave unchecked only if they do not apply.</p>
            <div className="bp-symptoms">
              {SYMPTOMS.map(symptom => (
                <label key={symptom.id}>
                  <input type="checkbox" name="symptoms" value={symptom.id} checked={form.symptoms.includes(symptom.id)}
                    onChange={event => change({ symptoms: event.target.checked ? [...form.symptoms, symptom.id] : form.symptoms.filter(s => s !== symptom.id) })} />
                  {symptom.label}
                </label>
              ))}
            </div>
            <label className="bp-restriction"><input type="checkbox" name="exerciseRestricted" checked={form.exerciseRestricted}
              onChange={event => change({ exerciseRestricted: event.target.checked })} />A clinician has restricted my exercise</label>
          </fieldset>
          <label htmlFor="bp-goal">Your goal<small>Optional · No target weight is inferred</small></label>
          <select id="bp-goal" name="goal" value={form.goal} onChange={event => change({ goal: event.target.value as BpGoal })}>
            {Object.entries(BP_GOALS).map(([key, goal]) => <option key={key} value={key}>{goal.label}</option>)}
          </select>
          {safety && <div id="bp-live-safety" className="bp-safety" role="alert">{safety}</div>}
          {error && <p id="bp-request-error" className="bp-error" role="alert">{error}</p>}
          <div className="bp-actions"><button id="bp-generate" className="button" type="submit" disabled={!validated.ok || busy} aria-busy={busy}>
            {busy ? 'Preparing your guidance…' : 'Generate my guidance'} <span aria-hidden="true">→</span>
          </button><button className="text-link" type="reset">Clear readings</button></div>
          <p className="bp-help">{validated.ok ? 'Ready. Safety checks come before any yoga recommendations.' : 'Enter valid BP, weight, and a unit to continue.'}</p>
          <p className="bp-help">Your readings are processed for this response only. They are not saved to your account, Convex, or browser storage.</p>
          <noscript>This tool needs JavaScript. For concerning readings or symptoms, contact a healthcare professional instead.</noscript>
        </form>
        <aside className="bp-measurement" aria-labelledby="bp-measurement-title">
          <span aria-hidden="true" className="bp-measurement-symbol">◎</span><h3 id="bp-measurement-title">A moment for an accurate reading.</h3>
          <ol>
            <li>Sit quietly for five minutes, with your back supported and feet flat.</li>
            <li>Use a correctly sized upper-arm cuff; keep your arm at heart level.</li>
            <li>When possible, avoid exercise, caffeine, and smoking for 30 minutes beforehand.</li>
            <li>Take two readings about one minute apart and record both. Enter one complete reading here.</li>
          </ol>
          <p><strong>Don’t wait on this tool in an emergency.</strong> {EMERGENCY_MESSAGE}</p>
          <p>Readings above 180 systolic or above 120 diastolic: {SEVERE_MESSAGE}</p>
          <p>Supported entry ranges: systolic 50–260, diastolic 30–160 mmHg; weight 20–400 kg (about 44.1–881.8 lb). These detect entry errors, not healthy ranges. Re-measure unexpected readings and seek medical advice.</p>
        </aside>
      </div>
      <div id="bp-results" className="bp-results" ref={resultRef} aria-live="polite">
        {result && <>
          <header className="bp-result-heading"><div className="eyebrow">YOUR WELLNESS GUIDANCE</div><h3 ref={titleRef} tabIndex={-1}>{titles[result.status]}</h3></header>
          <div className="bp-safety" role={result.status !== 'ok' ? 'alert' : undefined}>{result.safetyMessage}</div>
          <div className="bp-reading"><p>{result.categoryLabel} · {result.inputs.systolic}/{result.inputs.diastolic} mmHg · {result.inputs.weight} {result.inputs.weightUnit}</p><p>{result.explanation}</p></div>
          {result.status === 'ok' && <>
            <p className="bp-weight-guidance">{result.weightGuidance}</p>
            <div className="bp-pose-grid">{result.recommendations.map((pose, index) => <PoseCard key={pose.id} pose={pose} index={index} />)}</div>
            {result.dietGuidance && <section className="bp-diet" aria-labelledby="bp-diet-heading">
              <h3 id="bp-diet-heading">Everyday nourishment</h3>
              <div className="bp-diet-columns">{(['do', 'dont'] as const).map(key => <div key={key}><h4>{key === 'do' ? 'Do’s' : 'Don’ts'}</h4><ul>{result.dietGuidance![key].map(tip => <li key={tip}>{tip}</li>)}</ul></div>)}</div>
            </section>}
          </>}
          <p className="bp-disclaimer">{result.disclaimer}</p><p className="bp-disclaimer">{result.reviewNotice}</p>
        </>}
      </div>
      <details className="bp-references">
        <summary>Adult BP references &amp; how this tool works</summary>
        <p>Normal: below 120/80. Elevated: systolic 120–129 and diastolic below 80. Stage 1: systolic 130–139 or diastolic 80–89. Stage 2: systolic at least 140 or diastolic at least 90. Severe: systolic above 180 or diastolic above 120. Low reference: systolic below 90 or diastolic below 60. Severe and high values take precedence over low values.</p>
        <p>Weight does not change the BP category, yoga set, or diet route. No height is collected, and no body-size diagnosis or target weight is inferred. The optional goal selects general habit guidance only. Fixed three-pose sets come from the versioned Convex content library. Original illustrations are not a substitute for qualified instruction.</p>
        <ul>
          <li><a href="https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings">American Heart Association: understanding BP readings</a></li>
          <li><a href="https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know">AHA: 2025 guideline key points</a></li>
          <li><a href="https://www.nhs.uk/conditions/low-blood-pressure-hypotension/">NHS: low blood pressure</a></li>
          <li><a href="https://www.nccih.nih.gov/health/hypertension-high-blood-pressure">NCCIH: hypertension and complementary approaches</a></li>
        </ul>
      </details>
    </section>
  )
}

function PoseCard({ pose, index }: { pose: BpPose; index: number }) {
  const [failed, setFailed] = useState(false)
  return <article className="bp-pose-card" data-pose={pose.id}>
    <img src={failed ? pose.image.fallback : pose.image.src} width={480} height={300}
      alt={failed ? `Illustration unavailable for ${pose.name}. Read the steps below with a qualified instructor.` : pose.image.alt}
      onError={() => { if (!failed) setFailed(true) }} />
    <div className="bp-pose-copy">
      <span className="eyebrow">0{index + 1} / GENTLE PRACTICE</span><h4>{pose.name}</h4><p className="bp-pose-common">{pose.displayName}</p>
      <p>{pose.benefits}</p><ol>{pose.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="bp-pose-safety"><strong>Safety: </strong>{pose.safetyNote}</p>
    </div>
  </article>
}
