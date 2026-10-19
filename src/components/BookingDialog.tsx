import { useEffect, useRef, useState } from 'react'
import {
  api,
  loadBootstrap,
  setCsrf,
  type BootstrapData,
  type BookingResult,
} from '~/lib/api'
import classIcons from '~/lib/icons'

interface Selection {
  service: string | null
  date: string | null
  starts_at: string | null
}

interface BookingPreferences {
  time?: string
  day?: string
}

interface BookingDialogProps {
  data: BootstrapData | null
  onDataRefreshed: (data: BootstrapData) => void
  openRequest: { service?: string | null; preferences?: BookingPreferences | null } | null
  onOpenChange: (open: boolean) => void
  onCloseChat: () => void
  onToast: (message: string) => void
}

const STEPS = ['Class', 'Date & time', 'Review', 'Account', 'Finish']
const STEP_INDEX: Record<string, number> = { class: 0, calendar: 1, review: 2, auth: 3, payment: 4, result: 4 }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { on: (event: string, handler: () => void) => void; open: () => void }
  }
}

const escapeHTML = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))

export default function BookingDialog({ data, onDataRefreshed, openRequest, onOpenChange, onCloseChat, onToast }: BookingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const requestVersionRef = useRef(0)
  const busyRef = useRef(false)

  const [step, setStep] = useState<'class' | 'calendar' | 'review' | 'auth' | 'payment' | 'result'>('class')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [selection, setSelection] = useState<Selection>({ service: null, date: null, starts_at: null })
  const [preferences, setPreferences] = useState<BookingPreferences | null>(null)
  const [month, setMonth] = useState<Date | null>(null)
  const [slots, setSlots] = useState<{ starts_at: string; available: boolean }[] | null>(null)
  const [slotsMessage, setSlotsMessage] = useState('')
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsFailed, setSlotsFailed] = useState(false)
  const [result, setResult] = useState<BookingResult | null>(null)
  const [error, setError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const service = () => data?.services.find(s => s.id === selection.service)

  const goTo = (nextStep: typeof step) => {
    setStep(nextStep)
    setError('')
    const dialog = dialogRef.current
    if (dialog) dialog.scrollTop = 0
  }

  const open = async (service?: string | null, prefs?: BookingPreferences | null) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    onCloseChat()
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    setError('')
    let current = data
    if (!current) {
      try {
        current = await loadBootstrap()
        onDataRefreshed(current)
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Connection failed.')
        onToast('Booking data could not load. The page is still available; try booking again to reconnect.')
        return
      }
    }
    if (service && selection.service !== service) {
      setSelection({ service, date: null, starts_at: null })
    }
    if (prefs) setPreferences(prefs)
  }

  // Handle external open requests (header buttons, program cards, chatbot).
  useEffect(() => {
    if (openRequest) {
      void open(openRequest.service ?? null, openRequest.preferences ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest])

  const close = () => {
    dialogRef.current?.close()
  }

  const onDialogClose = () => {
    onOpenChange(false)
    returnFocusRef.current?.focus()
  }

  const heading = (title: string, subtitle: string) => (
    <>
      <div className="eyebrow">A LITTLE TIME FOR YOU</div>
      <h2 id="booking-title">{title}</h2>
      <p>{subtitle}</p>
    </>
  )

  const notice = () => (
    <div className="dev-callout">
      {data?.development
        ? 'DEVELOPMENT PREVIEW · These sample slots are not real studio availability. No real appointment will be made.'
        : 'Real studio availability is not connected yet. Booking is not currently open.'}
    </div>
  )

  const summary = () => {
    const current = service()
    if (!current || !selection.starts_at) return null
    const when = new Date(selection.starts_at)
    const price = current.price_paise
      ? `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(current.price_paise / 100)} · TEST only`
      : 'To be confirmed · Not payable'
    const rows: [string, string][] = [
      ['Class', current.name],
      ['Date', when.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })],
      ['Time', when.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ' · Asia/Kolkata'],
      ['Duration', current.duration_minutes ? `${current.duration_minutes} minutes · configured preview` : 'To be confirmed'],
      ['Price', price],
      ['Taxes / additional charges', current.tax_paise ? `₹${(current.tax_paise / 100).toFixed(2)} · TEST only` : 'None configured'],
      ...(current.price_paise
        ? [['Test total', `₹${((current.price_paise + current.tax_paise) / 100).toFixed(2)} · Not a real charge`] as [string, string]]
        : []),
    ]
    return (
      <div className="booking-summary">
        {rows.map(([label, value]) => (
          <div className="summary-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    )
  }

  // ---- Availability -------------------------------------------------------
  const loadSlots = async (serviceId: string, date: string) => {
    const version = ++requestVersionRef.current
    setSlotsLoading(true)
    setSlotsFailed(false)
    try {
      const availability = await api<{ slots: { starts_at: string; available: boolean }[]; development: boolean; message?: string }>(
        `/api/availability?service=${serviceId}&date=${date}`,
      )
      if (version !== requestVersionRef.current) return
      if (!availability.slots.some(slot => slot.starts_at === selection.starts_at && slot.available)) {
        setSelection(current => ({ ...current, starts_at: null }))
      }
      setSlots(availability.slots)
      setSlotsMessage(availability.slots.length
        ? ''
        : availability.message || 'No sample times on this date. Try another day within the next 60 days; Sundays have no sample slots.')
    } catch (loadError) {
      if (version !== requestVersionRef.current) return
      setSlotsFailed(true)
      setSlotsMessage('')
      setError(loadError instanceof Error ? loadError.message : 'Could not load availability.')
    } finally {
      if (version === requestVersionRef.current) setSlotsLoading(false)
    }
  }

  useEffect(() => {
    if (step === 'calendar' && data && selection.service && selection.date && !slotsLoading && !slotsFailed) {
      void loadSlots(selection.service, selection.date)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selection.service, selection.date])

  // ---- Auth ---------------------------------------------------------------
  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    if (authBusy) return
    setAuthBusy(true)
    setError('')
    try {
      const authResult = await api<{ user: { email: string }; csrf: string }>(`/api/auth/${authMode}`, { email, password })
      if (data) onDataRefreshed({ ...data, user: authResult.user, csrf: authResult.csrf })
      setCsrf(authResult.csrf)
      goTo('payment')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  const signOut = async () => {
    try {
      const logoutResult = await api<{ csrf: string }>('/api/auth/logout', {})
      if (data) onDataRefreshed({ ...data, csrf: logoutResult.csrf, user: null })
      setCsrf(logoutResult.csrf)
      goTo('auth')
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Sign out failed.')
    }
  }

  // ---- Demo booking -------------------------------------------------------
  const finishDemo = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setError('')
    try {
      const demoResult = await api<BookingResult>('/api/bookings/demo', { service: selection.service, starts_at: selection.starts_at })
      setResult(demoResult)
      goTo('result')
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : 'Demo booking failed.')
    } finally {
      busyRef.current = false
    }
  }

  // ---- Razorpay TEST checkout --------------------------------------------
  const loadCheckout = () => {
    if (window.Razorpay) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve()
      script.onerror = () => {
        script.remove()
        reject(new Error('Razorpay Checkout could not load. Please try again.'))
      }
      document.head.append(script)
    })
  }

  const checkout = async () => {
    if (busyRef.current || !data) return
    busyRef.current = true
    setError('')
    try {
      await loadCheckout()
      const order = await api<BookingResult>('/api/payments/order', { service: selection.service, starts_at: selection.starts_at })
      const Razorpay = window.Razorpay
      if (!Razorpay || !data.user) throw new Error('Checkout is unavailable. Please try again.')
      const dialog = dialogRef.current
      const checkoutInstance = new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: 'Shailja’s Fitness',
        description: 'Development booking · TEST only',
        prefill: { email: data.user.email },
        theme: { color: '#16877F' },
        handler: (payment: Record<string, string>) => {
          void (async () => {
            dialog?.showModal()
            try {
              const verifyResult = await api<BookingResult>('/api/payments/verify', { ...payment, booking: order.booking })
              setResult({ ...verifyResult, booking: order.booking })
            } catch (verifyError) {
              setResult({
                status: 'pending',
                booking: order.booking,
                message: (verifyError instanceof Error ? verifyError.message : 'Verification failed.') + ' No booking is confirmed until the server verifies capture.',
              })
            }
            goTo('result')
          })()
        },
        modal: {
          ondismiss: () => {
            dialog?.showModal()
            if (step !== 'result') {
              setResult({
                status: 'pending',
                booking: order.booking,
                message: 'Checkout closed. No paid booking is confirmed. A test order remains pending; check its status or reopen the same checkout.',
              })
              goTo('result')
            }
          },
        },
      })
      checkoutInstance.on('payment.failed', () => {
        setResult({
          status: 'pending',
          booking: order.booking,
          message: 'Test payment failed. No paid booking has been confirmed. You may retry checkout or check the server status.',
        })
        dialog?.showModal()
        goTo('result')
      })
      // Native modal's top layer would cover the gateway iframe; restore it on completion.
      dialog?.close()
      checkoutInstance.open()
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout failed.')
    } finally {
      busyRef.current = false
    }
  }

  const checkStatus = async () => {
    try {
      const statusResult = await api<{ id: string; status: string }>(`/api/bookings/${result?.booking}`)
      setResult(current => current ? { ...current, status: statusResult.status } : current)
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Status check failed.')
    }
  }

  // ---- Calendar helpers ---------------------------------------------------
  const today = data?.today ?? ''
  const calendarMonth = month ?? (today ? new Date(`${today}T12:00:00`) : null)
  const year = calendarMonth?.getFullYear() ?? 0
  const monthIndex = calendarMonth?.getMonth() ?? 0
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const dayCount = new Date(year, monthIndex + 1, 0).getDate()
  const dateKey = (day: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const currentService = service()
  const ready = Boolean(
    data?.payments_configured && currentService?.price_paise && currentService?.duration_minutes && data?.development,
  )

  const startNewBooking = () => {
    setSelection({ service: null, date: null, starts_at: null })
    setSlots(null)
    goTo('class')
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="booking-title" onClose={onDialogClose}>
      <div className="booking-shell">
        <header className="booking-header">
          <a className="brand compact" href="#" tabIndex={-1}>
            <img src="/brand.svg" width={30} height={38} alt="" />
            <span>Shailja’s <strong>Fitness</strong></span>
          </a>
          <button className="icon-button" aria-label="Close booking" onClick={close}>×</button>
        </header>
        <div className="booking-progress">
          {STEPS.map((label, index) => (
            <span key={label} className={`progress-item${index <= (STEP_INDEX[step] ?? 0) ? ' current' : ''}`}>
              {index + 1}. {label}
            </span>
          ))}
        </div>
        <div className="booking-body">
          {step === 'class' && (
            <>
              {heading('Make space for yourself.', 'Choose how you’d like to begin. You can change this later.')}
              {notice()}
              <div className="class-options">
                {(data?.services ?? []).map(s => (
                  <button
                    key={s.id}
                    className={`class-option${selection.service === s.id ? ' selected' : ''}`}
                    onClick={() => {
                      if (selection.service !== s.id) setSelection({ service: s.id, date: null, starts_at: null })
                      goTo('calendar')
                    }}
                  >
                    <span dangerouslySetInnerHTML={{ __html: classIcons[s.icon] ?? '' }} />
                    <span><strong>{s.name}</strong><small>{s.description}</small></span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'calendar' && currentService && (
            <>
              {heading('A moment that fits.', `${currentService.name} · Choose a date and sample time.`)}
              {notice()}
              <div className="calendar-header">
                <button
                  className="icon-button"
                  aria-label="Previous month"
                  disabled={dateKey(1).slice(0, 7) <= today.slice(0, 7)}
                  onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
                >‹</button>
                <strong>{calendarMonth?.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
                <button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>›</button>
              </div>
              <div className="calendar-grid" role="group" aria-label="Select a date">
                {WEEKDAYS.map(day => <span key={day} className="weekday">{day}</span>)}
                {Array.from({ length: firstDay }, (_, i) => <span key={`pad-${i}`} />)}
                {Array.from({ length: dayCount }, (_, i) => {
                  const key = dateKey(i + 1)
                  return (
                    <button
                      key={key}
                      className={`calendar-day${key === selection.date ? ' selected' : ''}${key === today ? ' today' : ''}`}
                      data-date={key}
                      disabled={key < today}
                      aria-label={new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { dateStyle: 'full' })}
                      aria-pressed={key === selection.date}
                      onClick={() => {
                        setSlots(null)
                        setSlotsFailed(false)
                        setSelection(current => ({ ...current, date: key, starts_at: null }))
                      }}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
              <div className="slots-heading">Available times <span>Asia/Kolkata · IST</span></div>
              <div aria-live="polite">
                {slotsLoading ? <p className="empty-state">Checking availability…</p> :
                  slotsFailed ? (
                    <p className="empty-state">
                      Couldn’t load availability.{' '}
                      <button className="text-link" onClick={() => { setError(''); if (selection.service && selection.date) void loadSlots(selection.service, selection.date) }}>
                        Try again
                      </button>
                    </p>
                  ) :
                    slots && slots.length ? (
                      <div className="time-slots">
                        {slots.map(slot => (
                          <button
                            key={slot.starts_at}
                            className={`slot-button${selection.starts_at === slot.starts_at ? ' selected' : ''}`}
                            disabled={!slot.available}
                            aria-pressed={selection.starts_at === slot.starts_at}
                            onClick={() => setSelection(current => ({ ...current, starts_at: slot.starts_at }))}
                          >
                            {new Date(slot.starts_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                            {slot.available ? '' : ' · Taken'}
                          </button>
                        ))}
                      </div>
                    ) :
                      slots ? <p className="empty-state">{slotsMessage}</p> :
                        <p className="empty-state">Choose a date to see sample availability.</p>}
              </div>
              <div className="booking-actions">
                <button className="back-button" onClick={() => goTo('class')}>← Class options</button>
                <button className="button" disabled={!selection.starts_at} onClick={() => goTo('review')}>Review booking <span>→</span></button>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              {heading('Your time, thoughtfully chosen.', 'Take a moment to check the details before continuing.')}
              {summary()}
              {notice()}
              <div className="booking-actions">
                <button className="back-button" onClick={() => goTo('calendar')}>← Change date or time</button>
                <button className="button" onClick={() => goTo(data?.user ? 'payment' : 'auth')}>Continue <span>→</span></button>
              </div>
            </>
          )}

          {step === 'auth' && (
            <>
              {heading('A familiar face. Or a fresh start.', 'Sign in or create an account to continue. Your selected session is saved.')}
              <div className="auth-tabs" role="group" aria-label="Account options">
                <button
                  className={authMode === 'login' ? 'selected' : ''}
                  aria-pressed={authMode === 'login'}
                  onClick={() => setAuthMode('login')}
                >Sign In</button>
                <button
                  className={authMode === 'register' ? 'selected' : ''}
                  aria-pressed={authMode === 'register'}
                  onClick={() => setAuthMode('register')}
                >Create Account</button>
              </div>
              <form className="auth-form" onSubmit={submitAuth}>
                <label htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
                <label htmlFor="auth-password">Password</label>
                <div className="password-field">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={12}
                    maxLength={128}
                    aria-describedby="password-help"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(value => !value)}
                  >{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                <small id="password-help">Use 12–128 characters. Only your email and password are needed.</small>
                <button className="button" type="submit" disabled={authBusy}>
                  {authBusy ? 'Securing your session…' : `${authMode === 'login' ? 'Sign In' : 'Create Account'} & Continue`} <span>→</span>
                </button>
              </form>
              <p className="booking-micro">Password recovery is not yet available. No account details are stored in your browser.</p>
              <button className="back-button" onClick={() => goTo('review')}>← Back to your selection</button>
            </>
          )}

          {step === 'payment' && data?.user && (
            <>
              {heading('One step closer.', 'This is a preview, not a real studio reservation.')}
              {summary()}
              {notice()}
              <div className="account-bar">
                <span>Signed in as {escapeHTML(data.user.email)}</span>
                <button onClick={signOut}>Sign out</button>
              </div>
              <div className="booking-actions">
                <button className="back-button" onClick={() => goTo('review')}>← Review</button>
                <button className="button" disabled={!data.development} onClick={finishDemo}>Finish demo · No payment <span>→</span></button>
              </div>
              <div className="booking-actions">
                <button className="button secondary" disabled={!ready} onClick={checkout}>Try Razorpay TEST Checkout ↗</button>
              </div>
              <p className="booking-micro">
                {ready
                  ? 'Test mode only. Use Razorpay test payment instruments, never real card details.'
                  : 'Checkout is gated: explicit test pricing, duration, Razorpay test keys and a webhook secret are required. You can still finish the demo without payment.'}
              </p>
            </>
          )}

          {step === 'result' && result && (
            <>
              <div className="success-icon">{result.status === 'pending' ? '◷' : '✓'}</div>
              {heading(
                result.status === 'pending' ? 'Awaiting verification.' :
                  result.status === 'demo' ? 'Your demo is complete.' : 'Test payment verified.',
                escapeHTML(result.message ?? ''),
              )}
              {summary()}
              <p className="booking-micro">
                Reference: {escapeHTML(result.booking ?? '')}<br />
                Preview only. This is not a real appointment or a production payment.
              </p>
              <div className="result-actions">
                {result.status === 'pending' && (
                  <>
                    <button className="button" onClick={checkStatus}>Check server status</button>
                    <button className="button secondary" onClick={() => { goTo('payment'); void checkout() }}>Retry TEST Checkout</button>
                  </>
                )}
                <button className={`button${result.status === 'pending' ? ' secondary' : ''}`} onClick={close}>Back to wellness ↗</button>
                <button className="back-button" onClick={startNewBooking}>Explore another session</button>
              </div>
            </>
          )}
        </div>
        <div className="booking-error" role="alert">{error}</div>
        <footer className="booking-footer">
          <span aria-hidden="true">♧</span> A mindful beginning. Your information stays protected.
        </footer>
      </div>
    </dialog>
  )
}
