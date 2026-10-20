import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import ChatWidget from '~/components/ChatWidget'
import BookingDialog from '~/components/BookingDialog'
import BpWellnessSection from '~/components/BpWellnessSection'
import PersonalizedYogaDialog from '~/components/PersonalizedYogaDialog'
import Lotus from '~/components/Lotus'
import { loadBootstrap, type BootstrapData } from '~/lib/api'

interface ChatRequest {
  key: string
  detail?: string
  seq: number
}

interface BookingRequest {
  service?: string | null
  preferences?: { time?: string; day?: string } | null
  seq: number
}

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null)
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

  const openContactChat = useCallback(() => {
    seq.current += 1
    setChatRequest({ key: 'contact', seq: seq.current })
  }, [])

  const contactEntries = data
    ? Object.entries(data.contact).filter(([, value]) => Boolean(value))
    : []
  const year = new Date().getFullYear()

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openBooking} />

      <main id="main">
        <section className="hero">
          <img
            className="hero-bg"
            src="/images/hero-om.jpg"
            alt="A woman meditating on a terrace at golden hour, an Om mandala glowing beside her"
            fetchPriority="high"
            width={1671}
            height={941}
          />
          <div className="hero-copy">
            <div className="eyebrow">YOGA · ZUMBA · DANCE · FITNESS · WEIGHT LOSS</div>
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
              <div className="eyebrow">MORE THAN A WORKOUT</div>
              <h2>Good for your body.<br /><em>Kind to your mind.</em></h2>
              <p>Wellness isn’t a finish line. It’s the small things you make time for, again and again.</p>
              <a className="text-link" href="#about">Get to know us <span>↗</span></a>
            </div>
            <div className="values-grid">
              <article><span className="value-icon">✧</span><h3>A practice that’s yours</h3><p>Start a conversation about your goals and the guidance you’re looking for.</p></article>
              <article><span className="value-icon">◎</span><h3>Progress, not pressure</h3><p>Make space for a healthy routine, at your own pace.</p></article>
              <article><span className="value-icon">❋</span><h3>Mindful by intention</h3><p>A thoughtful approach to movement, balance, and everyday wellbeing.</p></article>
              <article><span className="value-icon">☼</span><h3>Rooted in wellness</h3><p>Celebrating 7+ Years of Wellness, and the simple joy of showing up.</p></article>
            </div>
          </div>
        </section>

        <section className="section wrap about-layout" id="about">
          <div className="about-art">
            <img src="/images/about.jpg" alt="A group practising yoga together on a beach" loading="lazy" width={900} height={1000} />
            <div className="about-stamp">MOVE WITH<br /><em>intention.</em><br />LIVE WITH JOY.</div>
          </div>
          <div className="about-copy">
            <div className="eyebrow">A WARM WELCOME</div>
            <h2>A space to reconnect.<br /><em>A reason to begin.</em></h2>
            <p>Welcome to Shailja’s Fitness. We believe there’s room for movement and mindfulness in everyday life.</p>
            <p>Whether you’re drawn to the stillness of yoga or the energy of dance, your next chapter begins with a conversation. Let’s explore what feels right for you.</p>
            <button className="button" onClick={openBooking}>Find your starting point <span>↗</span></button>
          </div>
        </section>

        <section className="section wrap future-section" aria-label="More ways to connect">
          <div className="section-heading">
            <div>
              <div className="eyebrow">ROOM TO GROW</div>
              <h2>New possibilities,<br /><em>thoughtfully explored.</em></h2>
            </div>
            <p>Looking for something specific? These areas are awaiting confirmed program details.</p>
          </div>
          <div className="future-grid">
            <article id="bootcamp">
              <span>01 / BOOTCAMP</span>
              <h3>A fresh kind of energy.</h3>
              <p>Bootcamps conducted at institutes and companies around the city.</p>
              <Link to="/bootcamp" className="text-link">See our bootcamps ↗</Link>
            </article>
            <article id="institutions">
              <span>02 / INSTITUTIONS</span>
              <h3>Wellness, together.</h3>
              <p>Institutional and group wellness enquiries are welcome. Offerings are to be confirmed.</p>
              <a href="#contact" className="text-link">Start a conversation ↗</a>
            </article>
            <article id="certification">
              <span>03 / CERTIFICATION</span>
              <h3>Keep your curiosity moving.</h3>
              <p>Certification information will be shared once verified. No enrolments are currently offered here.</p>
              <a href="#contact" className="text-link">Enquire about updates ↗</a>
            </article>
          </div>
        </section>

        <section className="love-section" id="wall-of-love">
          <div className="wrap">
            <div className="eyebrow">WALL OF LOVE</div>
            <h2>Every journey has a story.<br /><em>We’re making space for yours.</em></h2>
            <div className="love-placeholder">
              <span aria-hidden="true">“</span>
              <p>Real voices. Meaningful moments.</p>
              <small>With permission, stories and photographs from our community will live here.</small>
              <span className="development-badge" id="testimonial-placeholder" hidden={!data?.development}>Development preview · No testimonials supplied</span>
            </div>
          </div>
        </section>

        <section className="section wrap contact-section" id="contact">
          <div>
            <div className="eyebrow">LET’S BEGIN</div>
            <h2>Your next chapter<br /><em>starts with you.</em></h2>
            <p>Have a question or ready to explore a session? We’ll help you find your next step.</p>
            <button className="button" onClick={openBooking}>Book an Appointment <span>↗</span></button>
          </div>
          <div className="contact-card">
            <span className="contact-icon">↗</span>
            <h3>A little connection goes a long way.</h3>
            <div id="contact-details">
              {contactEntries.length ? (
                contactEntries.map(([key, value]) => (
                  <p key={key}>
                    {key === 'email' ? <a href={`mailto:${value}`}>{value}</a> :
                      key === 'phone' ? <a href={`tel:${value}`}>{value}</a> : value}
                  </p>
                ))
              ) : (
                <p>Verified studio contact details will be published here. In the meantime, explore our guided assistant or preview the booking journey.</p>
              )}
            </div>
            <button className="text-link" id="contact-chat" onClick={openContactChat}>Talk to the wellness assistant →</button>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footer-top">
          <a href="#" className="brand footer-brand">
            <img src="/brand.svg" width={40} height={48} alt="" />
            <span>Shailja’s <strong>Fitness</strong></span>
          </a>
          <p>Mindful movement.<br />Meaningful beginnings.</p>
          <div>
            <a href="#programs">Wellness Tool</a>
            <a href="/centers">Centers</a>
            <a href="#about">About Us</a>
            <a href="/wall-of-art">Wall of Art</a>
            <a href="#wall-of-love">Wall of Love</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
        <div className="wrap footer-bottom">
          <span>© {year} Shailja’s Fitness</span>
          <span>Privacy &amp; terms: publication pending · No real payments or appointments in this preview</span>
          <span>Made for a more balanced you.</span>
        </div>
      </footer>

      <div id="environment-notice" className="environment-notice" hidden={!data?.development}>
        DEVELOPMENT PREVIEW <span>· Sample availability only. No real appointments.</span>
      </div>

      <ChatWidget
        data={data}
        open={chatOpen}
        navigateRequest={chatRequest}
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
