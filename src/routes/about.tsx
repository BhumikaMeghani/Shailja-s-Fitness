import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import { clerkConfigured, useSiteAuth } from '~/components/SiteAuth'
import TrainerEnquiryDialog, {
  emptyTrainerForm,
  SUCCESS_MESSAGE,
  type TrainerForm,
} from '~/components/TrainerEnquiryDialog'
import { api, loadBootstrap, type BootstrapData } from '~/lib/api'
import SiteFooter from '~/components/SiteFooter'

export const Route = createFileRoute('/about')({ component: AboutPage })

// Saved drafts wait here across the Clerk sign-in round-trip.
const PENDING_KEY = 'pending_trainer_enquiry'

interface Instructor {
  name: string
  role: string
  experience: string
  image: string
  description: string
}

// Instructors shown in circular frames; the middle card is the raised,
// featured one, so the founder is centred.
const instructors: Instructor[] = [
  {
    name: 'Manoj Sir',
    role: 'Yoga & Fitness Instructor',
    experience: '5+ Years of Experience',
    image: '/images/instructors/manoj.png',
    description:
      'A certified yoga and fitness trainer known for his disciplined yet friendly approach. With more than 5 years of experience, he specialises in strength-building fitness training, posture correction, and traditional yoga, helping students build stamina and confidence at a steady, sustainable pace.',
  },
  {
    name: 'Shailja Mam',
    role: 'Founder & Lead Instructor',
    experience: '7+ Years of Experience',
    image: '/images/instructors/shailja.png',
    description:
      'The founder of Shailja’s Yoga & Fitness Center and the heart of our studio. With over 7 years of experience in yoga, zumba, and fitness training, she has guided hundreds of students toward strength, flexibility, and inner calm — blending traditional yoga practices with modern fitness routines and high-energy zumba sessions suitable for every age group.',
  },
  {
    name: 'Pankaj Sir',
    role: 'Zumba & Fitness Instructor',
    experience: '4+ Years of Experience',
    image: '/images/instructors/pankaj.png',
    description:
      'The energy of our studio floor. With over 4 years of experience in zumba, aerobics, and functional fitness training, he designs fun, high-energy workout sessions that make weight loss, cardio endurance, and overall fitness feel like a celebration rather than a chore.',
  },
]

function AboutPage() {
  const { ready, signedIn } = useSiteAuth()
  return <AboutBody signedIn={signedIn} clerkReady={ready} />
}

interface BodyProps {
  signedIn: boolean
  clerkReady: boolean
}

function AboutBody({ signedIn, clerkReady }: BodyProps) {
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<BootstrapData | null>(null)
  const [form, setForm] = useState<TrainerForm>(emptyTrainerForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const resuming = useRef(false)
  const mainRef = useRef<HTMLElement>(null)

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

  // Fade the hero, instructor cards, and CTA up in place as they enter the
  // viewport, armed only after hydration so content never hides without JS.
  useEffect(() => {
    const page = mainRef.current
    if (!page) return
    const targets = page.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    page.classList.add('about-animate')
    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  const update = useCallback((field: keyof TrainerForm, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }))
  }, [])

  const submitEnquiry = useCallback((enquiry: TrainerForm) => {
    setSubmitting(true)
    setError('')
    api('/api/trainers', {
      fullName: enquiry.fullName,
      contactNumber: enquiry.contactNumber,
      email: enquiry.email,
      trainingProgramme: enquiry.trainingProgramme,
      previousExperience: enquiry.previousExperience,
      trainingDuration: enquiry.trainingDuration,
      queryMessage: enquiry.queryMessage || null,
    }).then(() => {
      sessionStorage.removeItem(PENDING_KEY)
      setForm(emptyTrainerForm)
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
  // hands back to /about. Signed-in visitors go straight through.
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
      void navigate({ href: '/sign-in?redirect_url=/about' })
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
      const enquiry: TrainerForm = { ...emptyTrainerForm, ...JSON.parse(pending) }
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

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openDialog} />

      <main id="main" className="about-main" ref={mainRef}>
        <section className="centers-hero about-hero">
          <div className="wrap">
            <h1 className="reveal">Meet the people<br /><em>behind the practice.</em></h1>
            <p className="reveal">
              Shailja’s Yoga & Fitness Center is a team of certified yoga,
              zumba, and fitness trainers who believe wellness should be
              personal. Every class, from slow meditative yoga to energetic
              zumba, is guided by hands-on experience and genuine care.
            </p>
          </div>
        </section>

        <section className="section wrap about-instructors" aria-label="Our instructors">
          <div className="instructor-grid">
            {instructors.map(instructor => (
              <article className="instructor-card reveal" key={instructor.name}>
                <div className="instructor-frame">
                  <img src={instructor.image} alt={`Portrait of ${instructor.name}`} />
                </div>
                <span className="instructor-experience">{instructor.experience}</span>
                <h3>{instructor.name}</h3>
                <p className="instructor-role">{instructor.role}</p>
                <p className="instructor-description">{instructor.description}</p>
              </article>
            ))}
          </div>

          <div className="programs-cta about-cta reveal">
            <button className="button" onClick={openDialog}>
              Become a Trainer <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />

      <TrainerEnquiryDialog
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
