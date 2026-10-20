import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import { clerkConfigured, useSiteAuth } from '~/components/SiteAuth'
import BootcampEnquiryDialog, {
  emptyBootcampForm,
  SUCCESS_MESSAGE,
  type BootcampForm,
} from '~/components/BootcampEnquiryDialog'
import { api, loadBootstrap, type BootstrapData } from '~/lib/api'

export const Route = createFileRoute('/bootcamp')({ component: BootcampPage })

// Saved drafts wait here across the Clerk sign-in round-trip.
const PENDING_KEY = 'pending_bootcamp_enquiry'

interface BootcampRecord {
  tag: 'INSTITUTE' | 'COMPANY' | 'COLLEGE'
  name: string
  location: string
  time: string
}

// Institutes, companies, and colleges where Shailja's Yoga & Fitness Center
// has successfully conducted bootcamps.
const bootcamps: BootcampRecord[] = [
  {
    tag: 'INSTITUTE',
    name: 'Infoviaan Technologies',
    location: 'Indore, Madhya Pradesh',
    time: '10:00 AM – 1:00 PM',
  },
  {
    tag: 'COMPANY',
    name: 'InfoBeans Technologies',
    location: 'Crystal IT Park, Indore',
    time: '2:00 PM – 5:00 PM',
  },
  {
    tag: 'COLLEGE',
    name: 'Shri G. S. Institute of Technology & Science (SGSITS)',
    location: '23 Park Road, Indore',
    time: '11:00 AM – 2:00 PM',
  },
]

function BootcampPage() {
  const { ready, signedIn } = useSiteAuth()
  return <BootcampBody signedIn={signedIn} clerkReady={ready} />
}

interface BodyProps {
  signedIn: boolean
  clerkReady: boolean
}

function BootcampBody({ signedIn, clerkReady }: BodyProps) {
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<BootstrapData | null>(null)
  const [form, setForm] = useState<BootcampForm>(emptyBootcampForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const resuming = useRef(false)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 7000)
  }, [])

  useEffect(() => {
    loadBootstrap().then(setData).catch(() => {
      showToast('The page could not connect fully; reloading will help.')
    })
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [showToast])

  const update = useCallback((field: keyof BootcampForm, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }))
  }, [])

  const submitEnquiry = useCallback((enquiry: BootcampForm) => {
    setSubmitting(true)
    setError('')
    api('/api/bootcamps', {
      organisation: enquiry.organisation,
      contactPerson: enquiry.contactPerson,
      email: enquiry.email,
      contactNumber: enquiry.contactNumber,
      organisationCategory: enquiry.organisationCategory,
      bootcampType: enquiry.bootcampType,
      purpose: enquiry.purpose || null,
      participants: enquiry.participants,
      preferredDate: enquiry.preferredDate || null,
      preferredDuration: enquiry.preferredDuration || null,
      preferredMode: enquiry.preferredMode,
      cityVenue: enquiry.cityVenue || null,
      additionalRequirements: enquiry.additionalRequirements || null,
    }).then(() => {
      sessionStorage.removeItem(PENDING_KEY)
      setForm(emptyBootcampForm)
      dialogRef.current?.close()
      showToast(SUCCESS_MESSAGE)
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Please try again in a moment.')
      // The resumed submit runs while the form is closed: hand the restored
      // draft back with its error visible instead of swallowing the failure.
      if (!dialogRef.current?.open) {
        setForm(enquiry)
        resuming.current = false
        requestAnimationFrame(() => dialogRef.current?.showModal())
      }
    }).finally(() => setSubmitting(false))
  }, [showToast])

  // The sign-in gate: visitors sign in first, and the stored enquiry is
  // submitted (then celebrated with the success message) as soon as Clerk
  // hands back to /bootcamp. Signed-in visitors go straight through.
  const handleSubmit = useCallback(() => {
    if (!clerkReady) {
      setError('Sign-in is still loading. Please try again in a moment.')
      return
    }
    if (clerkConfigured && !signedIn) {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(form))
      } catch {
        setError('Please allow session storage so your enquiry can resume after sign-in.')
        return
      }
      dialogRef.current?.close()
      showToast('Please sign in first — your enquiry is saved and submits automatically afterwards.')
      void navigate({ href: '/sign-in?redirect_url=/bootcamp' })
      return
    }
    submitEnquiry(form)
  }, [clerkReady, form, navigate, showToast, signedIn, submitEnquiry])

  const openDialog = useCallback(() => {
    requestAnimationFrame(() => dialogRef.current?.showModal())
  }, [])

  const onCloseDialog = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  // Return trip from /sign-in: submit automatically when signed in, or hand
  // the restored draft back to the visitor when they came back signed out.
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_KEY)
    if (!pending) {
      resuming.current = false
      return
    }
    if (!clerkConfigured || !clerkReady || resuming.current) return
    resuming.current = true
    try {
      const enquiry: BootcampForm = { ...emptyBootcampForm, ...JSON.parse(pending) }
      if (signedIn) {
        submitEnquiry(enquiry)
      } else {
        // Arrived without finishing sign-in: reopen the restored draft.
        setForm(enquiry)
        sessionStorage.removeItem(PENDING_KEY)
        requestAnimationFrame(() => dialogRef.current?.showModal())
      }
    } catch {
      sessionStorage.removeItem(PENDING_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkReady, signedIn])

  const year = new Date().getFullYear()

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openDialog} />

      <main id="main">
        <section className="centers-hero bootcamp-hero">
          <div className="wrap">
            <div className="eyebrow">BOOTCAMPS</div>
            <h1>Wellness that comes<br /><em>to where people work.</em></h1>
            <p>
              Shailja’s Yoga &amp; Fitness Center has been invited to lead
              bootcamps at institutes, companies, and colleges across Indore.
              Each session brings movement, breath, and calm straight onto the
              campus floor.
            </p>
          </div>
        </section>

        <section className="section wrap bootcamp-list" aria-label="Bootcamps conducted">
          <div className="section-heading">
            <div>
              <div className="eyebrow">WHOM WE’VE VISITED</div>
              <h2>Conducted with care,<br /><em>wherever we were invited.</em></h2>
            </div>
            <p>
              Institutes and organisations where Shailja’s Yoga &amp; Fitness
              Center has successfully conducted bootcamps.
            </p>
          </div>

          <div className="bootcamp-grid">
            {bootcamps.map(record => (
              <article className="bootcamp-card" key={record.name}>
                <span className="bootcamp-tag">{record.tag}</span>
                <h3>{record.name}</h3>
                <p className="bootcamp-location">{record.location}</p>
                <p className="bootcamp-time"><span aria-hidden="true">◔</span> {record.time}</p>
              </article>
            ))}
          </div>

          <div className="programs-cta bootcamp-cta">
            <button className="button" onClick={openDialog}>
              Organize Bootcamp at Your Organization <span aria-hidden="true">→</span>
            </button>
            <p>Bring a yoga, fitness, or wellness session to your school, college, or company.</p>
          </div>
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
            <Link to="/contact">Contact</Link>
          </div>
        </div>
        <div className="wrap footer-bottom">
          <span>© {year} Shailja’s Fitness</span>
          <span>Made for a more balanced you.</span>
        </div>
      </footer>

      <BootcampEnquiryDialog
        ref={dialogRef}
        form={form}
        onChange={update}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        onClose={onCloseDialog}
      />

      <div className="toast" role="status" hidden={!toastVisible}>{toastMessage}</div>
    </>
  )
}
