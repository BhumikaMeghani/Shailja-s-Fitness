import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import BookingDialog from '~/components/BookingDialog'
import { loadBootstrap, type BootstrapData } from '~/lib/api'

export const Route = createFileRoute('/programs')({ component: ProgramsPage })

interface ProgramFeature {
  title: string
  text: string
}

interface Program {
  name: string
  price: string
  image: string
  alt: string
  tagline: string
  description: string
  features: ProgramFeature[]
}

const programs: Program[] = [
  {
    name: 'Normal Yoga',
    price: '₹1,500',
    image: '/images/programs/normal-yoga.png',
    alt: 'A practitioner holding a calm balance pose in a bright studio',
    tagline: 'Balanced. Revitalizing. Accessible.',
    description: 'Designed for overall daily health, helping you build core strength, improve flexibility, and release daily tension in a welcoming environment.',
    features: [
      {
        title: 'Personalized Start',
        text: 'Initial 2–3 introductory sessions to assess your baseline mobility and goals before tailoring your routine.',
      },
      {
        title: 'Lifestyle Integration',
        text: 'Practical posture and breathing habits to keep you energetic throughout your daily routine.',
      },
    ],
  },
  {
    name: 'Therapeutic Yoga',
    price: '₹2,500',
    image: '/images/programs/therapeutic-yoga.png',
    alt: 'A gentle supported stretch guided on a yoga mat',
    tagline: 'Restorative. Precise. Gentle.',
    description: 'A specialized program focused on restoring mobility, easing physical stiffness, and supporting individual health needs through guided adaptation.',
    features: [
      {
        title: 'Introductory Assessment',
        text: 'Includes 2–3 screening sessions to understand your physical conditions, comfort limits, and recovery goals.',
      },
      {
        title: 'Tailored Care',
        text: 'Customized low-impact posture modifications and progress tracking for a safe, gradual experience.',
      },
    ],
  },
  {
    name: 'Kids Yoga',
    price: '₹2,000',
    image: '/images/programs/kids-yoga.png',
    alt: 'Children practising playful yoga postures together',
    tagline: 'Playful. Focus-Building. Engaging.',
    description: 'Fun, interactive sessions created to help growing children improve posture, body coordination, confidence, and emotional calm.',
    features: [
      {
        title: 'Child-Centric Focus',
        text: 'Combines playful posture games with simple mindfulness exercises designed for young minds.',
      },
      {
        title: 'Parental Consultation',
        text: 'An initial check-in with parents to understand your child’s personality, daily routine, and physical needs.',
      },
    ],
  },
  {
    name: 'Corporate Sessions',
    price: '₹3,000',
    image: '/images/programs/corporate-sessions.png',
    alt: 'Colleagues joining a guided yoga break together in a modern workspace',
    tagline: 'Engaging. Easy. Effective.',
    description: 'Our programs are fun and interactive while giving participants tangible benefits in terms of energy, rejuvenation, and calmness.',
    features: [
      {
        title: 'Lifestyle Integration',
        text: 'Practical tips for incorporating healthy habits into busy workdays.',
      },
      {
        title: 'Ongoing Motivation And Support',
        text: 'Regular check-ins to track team progress and adjust session plans.',
      },
    ],
  },
  {
    name: 'Transformational Yoga',
    price: '₹5,000',
    image: '/images/programs/transformational-yoga.png',
    alt: 'An advanced practitioner seated in a deep meditative posture',
    tagline: 'Deep. Empowering. Mindful.',
    description: 'An advanced practice tailored for dedicated practitioners seeking deeper spiritual alignment, posture mastery, and mental focus.',
    features: [
      {
        title: 'Practice Evaluation',
        text: '2–3 baseline assessment sessions to review your experience level and craft an advanced practice path.',
      },
      {
        title: 'Deeper Exploration',
        text: 'Focuses on advanced breath control, structured meditation, and targeted personal development.',
      },
    ],
  },
  {
    name: 'Pregnancy Yoga',
    price: '₹4,500',
    image: '/images/programs/pregnancy-yoga.png',
    alt: 'An expectant mother practising gentle prenatal yoga',
    tagline: 'Nurturing. Safe. Supportive.',
    description: 'A gentle prenatal program designed to guide expectant mothers through trimester-safe movement, pelvic comfort, and labor breathing.',
    features: [
      {
        title: 'Health Screening',
        text: 'Mandatory 2–3 session screening to tailor all movements safely to your trimester and physical comfort.',
      },
      {
        title: 'Wellness & Nutrition',
        text: 'General dietary and hydration recommendations to support overall comfort throughout pregnancy.',
      },
    ],
  },
]

function ProgramsPage() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [bookingRequest, setBookingRequest] = useState<{ seq: number } | null>(null)
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
      showToast('Booking data could not load. The page is still available; try booking again to reconnect.')
    })
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [showToast])

  const openBooking = useCallback(() => {
    seq.current += 1
    setBookingRequest({ seq: seq.current })
  }, [])

  const year = new Date().getFullYear()

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openBooking} />

      <main id="main">
        <section className="programs-hero">
          <div className="wrap">
            <div className="eyebrow">SIX DEDICATED PRACTICES</div>
            <h1>One journey.<br /><em>Many doorways.</em></h1>
            <p>
              From your very first beginner session to advanced and prenatal practice,
              each program starts with a personal assessment and grows with you.
              Hover or tap a card to see what’s inside.
            </p>
          </div>
        </section>

        <section className="section wrap plans-section" aria-label="Program plans">
          <div className="plans-grid">
            {programs.map(program => (
              <FlipCard key={program.name} program={program} onBook={openBooking} />
            ))}
          </div>

          <div className="programs-cta">
            <button className="button" onClick={openBooking}>
              Book An Appointment <span aria-hidden="true">→</span>
            </button>
            <p>Every plan begins with a personal conversation and a tailored intro session.</p>
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
            <Link to="/" hash="#about">About Us</Link>
            <Link to="/wall-of-art">Wall of Art</Link>
            <Link to="/" hash="#wall-of-love">Wall of Love</Link>
            <Link to="/contact">Contact</Link>
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

function FlipCard({ program, onBook }: { program: Program; onBook: () => void }) {
  const [flipped, setFlipped] = useState(false)

  const toggle = (event: React.MouseEvent<HTMLElement>) => {
    if (event.currentTarget.closest('button')) return
    setFlipped(flip => !flip)
  }

  const flipOnKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      setFlipped(flip => !flip)
    }
  }

  return (
    <article
      className={`flip-card${flipped ? ' flipped' : ''}`}
      onClick={toggle}
      onKeyDown={flipOnKey}
      aria-pressed={flipped}
    >
      <div className="flip-inner" tabIndex={0} aria-label={`${program.name} plan details`}>
        <div className="flip-face flip-front">
          <div className="flip-image">
            <img src={program.image} alt={program.alt} loading="lazy" width={800} height={1000} />
          </div>
          <div className="flip-meta">
            <h3>{program.name}</h3>
            <p>Starts from <strong>{program.price}</strong></p>
            <span className="flip-hint" aria-hidden="true">Hover to see details</span>
          </div>
        </div>
        <div className="flip-face flip-back">
          <h3>{program.name}</h3>
          <p className="flip-tagline">{program.tagline}</p>
          <p className="flip-description">{program.description}</p>
          <ul>
            {program.features.map(feature => (
              <li key={feature.title}>
                <strong>{feature.title}</strong>
                <span>{feature.text}</span>
              </li>
            ))}
          </ul>
          <button className="button small" onClick={onBook}>Book An Appointment</button>
        </div>
      </div>
    </article>
  )
}
