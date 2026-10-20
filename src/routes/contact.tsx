import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import BookingDialog from '~/components/BookingDialog'
import { api, loadBootstrap, type BootstrapData } from '~/lib/api'

export const Route = createFileRoute('/contact')({ component: ContactPage })

// The studio inbox quoted on the page and prefilled into every mailto link.
const QUERY_EMAIL = 'bhoomikameghani0110@gmail.com'

const dialCodes = [
  { code: '+91', label: '+91 - India' },
  { code: '+971', label: '+971 - UAE' },
  { code: '+65', label: '+65 - Singapore' },
  { code: '+44', label: '+44 - United Kingdom' },
  { code: '+1', label: '+1 - United States' },
  { code: '+61', label: '+61 - Australia' },
]

interface FormState {
  name: string
  email: string
  dial: string
  mobile: string
  address: string
  message: string
}

const emptyForm: FormState = { name: '', email: '', dial: '+91', mobile: '', address: '', message: '' }

function ContactPage() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [bookingRequest, setBookingRequest] = useState<{ seq: number } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const seq = useRef(0)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 6000)
  }, [])

  useEffect(() => {
    loadBootstrap().then(setData).catch(() => {
      showToast('Contact details could not load. You can still write to us directly by email.')
    })
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [showToast])

  const openBooking = useCallback(() => {
    seq.current += 1
    setBookingRequest({ seq: seq.current })
  }, [])

  const update = useCallback((field: keyof FormState, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }))
  }, [])

  const submit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      // The server saves the query to Convex and emails it to the studio.
      const result = await api<{ ok: boolean; delivered?: boolean; mailto?: string }>('/api/contact', {
        name: form.name,
        address: form.address,
        email: form.email,
        mobile: `${form.dial} ${form.mobile}`.trim(),
        message: form.message,
      })
      if (result.delivered) {
        showToast('Thank you! Your message has been emailed to the studio.')
      } else if (result.mailto) {
        showToast('Your message is saved. Please send it from your mail app — opening it now.')
        window.location.href = result.mailto
      } else {
        showToast('Thank you! Your message has been received by the studio.')
      }
      setForm(emptyForm)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not send your query. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [form, showToast, submitting])

  const year = new Date().getFullYear()
  const phone = data?.contact.phone

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openBooking} />

      <main id="main">
        <section className="centers-hero">
          <div className="wrap">
            <div className="eyebrow">CONTACT US</div>
            <h1>Our Location.<br /><em>We would love to hear from&nbsp;you!</em></h1>
            <p>
              Questions about a program, timings, or the next open slot? Send a
              message through the form, call, or write directly to {QUERY_EMAIL} —
              every query reaches the studio the same day.
            </p>
          </div>
        </section>

        <section className="section wrap contact-page" aria-label="Contact form and location">
          <form className="contact-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="query-name">Enter Name</label>
              <input id="query-name" name="name" autoComplete="name" required maxLength={80}
                placeholder="Enter Name" value={form.name}
                onChange={event => update('name', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="query-email">Email Address</label>
              <input id="query-email" name="email" type="email" autoComplete="email" maxLength={254}
                placeholder="Email Address" value={form.email}
                onChange={event => update('email', event.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="query-dial">Mobile Number</label>
              <div className="mobile-field">
                <select id="query-dial" name="dial" value={form.dial}
                  onChange={event => update('dial', event.target.value)}
                  aria-label="Country dial code">
                  {dialCodes.map(option => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
                <input id="query-mobile" name="mobile" type="tel" inputMode="tel" autoComplete="tel" required
                  placeholder="Mobile Number" value={form.mobile} maxLength={20}
                  onChange={event => update('mobile', event.target.value)} />
              </div>
            </div>
            <div className="field span-2">
              <label htmlFor="query-address">Enter Address</label>
              <input id="query-address" name="address" autoComplete="street-address" required maxLength={300}
                placeholder="Enter Address" value={form.address}
                onChange={event => update('address', event.target.value)} />
            </div>
            <div className="field span-2">
              <label htmlFor="query-message">Message</label>
              <textarea id="query-message" name="message" required maxLength={2000}
                placeholder="Message" value={form.message}
                onChange={event => update('message', event.target.value)} />
            </div>
            <div className="span-2">
              <button className="button contact-submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit'} <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          <aside className="contact-aside">
            <h3>Our Location</h3>
            <div className="contact-channels">
              {phone && (
                <p><a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a></p>
              )}
              {data?.contact.address && <p>{data.contact.address}</p>}
            </div>
            <div className="map-frame contact-map">
              <iframe
                src="https://www.google.com/maps?q=Shailja%27s+Yoga,+412,+Usha+Nagar,+Indore,+Madhya+Pradesh+452009&output=embed"
                title="Map of Shailja’s Fitness Usha Nagar center, Indore"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <button className="text-link" onClick={openBooking}>Book an appointment →</button>
          </aside>
        </section>
      </main>

      <footer>
        <div className="wrap footer-top">
          <Link to="/" className="brand footer-brand">
            <img src="/brand.svg" width={40} height={48} alt="" />
            <span>Shailja’s <strong>Fitness</strong></span>
          </Link>
          <p>Mindful movement.<br />Meaningful beginnings.</p>
          <div>
            <Link to="/programs">Programs</Link>
            <Link to="/centers">Centers</Link>
            <Link to="/wall-of-art">Wall of Art</Link>
            <Link to="/">Wall of Love</Link>
            <a href={`mailto:${QUERY_EMAIL}`}>Email us</a>
          </div>
        </div>
        <div className="wrap footer-bottom">
          <span>© {year} Shailja’s Fitness</span>
          <span>Made for a more balanced you.</span>
        </div>
      </footer>

      <BookingDialog
        data={data}
        onDataRefreshed={setData}
        openRequest={bookingRequest ? { service: null, preferences: null, ...bookingRequest } : null}
        onOpenChange={open => { if (!open) setBookingRequest(null) }}
        onCloseChat={() => {}}
        onToast={showToast}
      />

      <div className="toast" role="status" hidden={!toastVisible}>{toastMessage}</div>
    </>
  )
}
