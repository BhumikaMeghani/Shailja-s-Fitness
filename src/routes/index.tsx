import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import ChatWidget from '~/components/ChatWidget'
import BookingDialog from '~/components/BookingDialog'
import BpWellnessSection from '~/components/BpWellnessSection'
import PersonalizedYogaDialog from '~/components/PersonalizedYogaDialog'
import Lotus from '~/components/Lotus'
import { loadBootstrap, type BootstrapData } from '~/lib/api'
import SiteFooter from '~/components/SiteFooter'
import OptimizedImage from '~/components/OptimizedImage'

interface BookingRequest {
  service?: string | null
  preferences?: { time?: string; day?: string } | null
  seq: number
}

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingRequest, setBookingRequest] = useState<BookingRequest | null>(null)
  const [yogaOpen, setYogaOpen] = useState(false)
  const [yogaRequest, setYogaRequest] = useState<{ seq: number } | null>(null)
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
    setBookingRequest({ service: null, preferences: null, seq: seq.current })
    setBookingOpen(true)
  }, [])

  // Hero entry point for the Personalised Yoga Plan journey (README section 2):
  // questionnaire → live goal-based pricing → locked preview → demo payment.
  const openWellnessPlan = useCallback(() => {
    seq.current += 1
    setYogaRequest({ seq: seq.current })
    setYogaOpen(true)
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openBooking} />

      <main id="main">
        <section className="hero">
          <OptimizedImage
            className="hero-bg"
            src="/images/hero-om.jpg"
            alt="A woman meditating on a terrace at golden hour, an Om mandala glowing beside her"
            fetchPriority="high"
            loading="eager"
            sizes="100vw"
            width={1671}
            height={941}
          />
          <div className="hero-copy">
            <h1>Find Your Balance.<br />Build Your Strength.<br /><span className="keep-line">Feel Your Best. <Lotus className="hero-lotus" /></span></h1>
            <div className="hero-actions">
              <button className="button" onClick={openWellnessPlan}>Create Your Personalized Yoga <span aria-hidden="true">→</span></button>
            </div>
          </div>
        </section>

        <div className="movement-strip" aria-label="Our areas of movement">
          <span>Mindful movement</span><i>✧</i><span>Stronger every day</span><i>✧</i>
          <span>Balance from within</span><i>✧</i><span>Wellness for you</span>
        </div>

        <BpWellnessSection />

        <section className="why-section">
          <div className="wrap why-layout">
            <div>
              <h2>Good for your body.<br /><em>Kind to your mind.</em></h2>
              <Link className="text-link" to="/about">Get to know us <span>↗</span></Link>
            </div>
            <div className="values-grid">
              <article><span className="value-icon">✧</span><h3>A practice that’s yours</h3><p>Start a conversation about your goals and the guidance you’re looking for.</p></article>
              <article><span className="value-icon">◎</span><h3>Progress, not pressure</h3><p>Make space for a healthy routine, at your own pace.</p></article>
              <article><span className="value-icon">❋</span><h3>Mindful by intention</h3><p>A thoughtful approach to movement, balance, and everyday wellbeing.</p></article>
              <article><span className="value-icon">☼</span><h3>Rooted in wellness</h3><p>Celebrating 7+ Years of Wellness, and the simple joy of showing up.</p></article>
            </div>
          </div>
        </section>

        <section className="section wrap future-section" aria-label="More ways to connect">
          <div className="section-heading">
            <div>
              <h2>New possibilities,<br /><em>thoughtfully explored.</em></h2>
            </div>
          </div>
          <div className="future-grid">
            <article id="bootcamp">
              <h3>A fresh kind of energy.</h3>
              <p>Bootcamps conducted at institutes and companies around the city.</p>
              <Link to="/bootcamp" className="text-link">See our bootcamps ↗</Link>
            </article>
            <article id="institutions">
              <h3>Wellness, together.</h3>
              <p>Institutional and group wellness enquiries are welcome. Offerings are to be confirmed.</p>
              <Link to="/contact" className="text-link">Start a conversation ↗</Link>
            </article>
            <article id="certification">
              <h3>Keep your curiosity moving.</h3>
              <p>Certification information will be shared once verified. No enrolments are currently offered here.</p>
              <Link to="/programs" className="text-link">Enquire about updates ↗</Link>
            </article>
          </div>
        </section>
      </main>

      <SiteFooter />

      <ChatWidget
        data={data}
        open={chatOpen}
        navigateRequest={null}
        onOpenChange={setChatOpen}
        onBookingRequested={(service, preferences) => {
          seq.current += 1
          setBookingRequest({ service, preferences, seq: seq.current })
          setBookingOpen(true)
        }}
      />

      <BookingDialog
        data={data}
        onDataRefreshed={setData}
        openRequest={bookingOpen ? bookingRequest : null}
        onOpenChange={setBookingOpen}
        onCloseChat={() => setChatOpen(false)}
        onToast={showToast}
      />

      <PersonalizedYogaDialog openRequest={yogaOpen ? yogaRequest : null} onOpenChange={setYogaOpen} />

      <div className="toast" role="status" hidden={!toastVisible}>{toastMessage}</div>
    </>
  )
}
