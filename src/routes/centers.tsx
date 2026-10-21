import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import BookingDialog from '~/components/BookingDialog'
import { loadBootstrap, type BootstrapData } from '~/lib/api'
import SiteFooter from '~/components/SiteFooter'

export const Route = createFileRoute('/centers')({ component: CentersPage })

interface Center {
  name: string
  tagline: string
  address: string
  landmark: string
  mapSrc: string
  directions: string
  bigMapLabel: string
  externalLabel?: string
  externalHref?: string
}

// Map embeds use Google's keyless iframe output; each card can be opened in a
// larger view through the accompanying links.
const centers: Center[] = [
  {
    name: 'Usha Nagar',
    tagline: 'The studio where Shailja’s Yoga began.',
    address: '412, Usha Nagar, Indore, Madhya Pradesh 452009',
    landmark: 'Near Aaradhya Mandir, opposite the garden, Rau Silicon City.',
    mapSrc: 'https://www.google.com/maps?q=Shailja%27s+Yoga,+412,+Usha+Nagar,+Indore,+Madhya+Pradesh+452009&output=embed',
    directions: 'https://www.google.com/maps/dir/?api=1&destination=Shailja%27s+Yoga%2C+412%2C+Usha+Nagar%2C+Indore%2C+Madhya+Pradesh+452009',
    bigMapLabel: 'Open in Google Maps',
    externalLabel: 'We are also listed on Justdial',
    externalHref: 'https://www.justdial.com/Indore/Shailjas-Yoga-20-And-Pankajs-Fitness-Near-Aaradhya-Mandir-Opposit-Garden-Rau-Silicon-City/0731PX731-X731-220501222247-K1E6_BZDET',
  },
  {
    name: 'Sudama Nagar',
    tagline: 'Our center off Narendra Tiwari Marg.',
    address: '628, Narendra Tiwari Marg, Sudama Nagar, Indore, Madhya Pradesh 452009',
    landmark: 'Shailja Yoga & Fitness Center.',
    mapSrc: 'https://www.google.com/maps?q=Shailja+Yoga+%26+Fitness+Center,+628,+Narendra+Tiwari+Marg,+Sudama+Nagar,+Indore,+Madhya+Pradesh+452009&output=embed',
    directions: 'https://www.google.com/maps/dir/?api=1&destination=Shailja+Yoga+%26+Fitness+Center%2C+628%2C+Narendra+Tiwari+Marg%2C+Sudama+Nagar%2C+Indore%2C+Madhya+Pradesh+452009',
    bigMapLabel: 'Open in Google Maps',
  },
]

function CentersPage() {
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

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openBooking} />

      <main id="main">
        <section className="centers-hero">
          <div className="wrap">
            <h1>Same practice.<br /><em>Two neighbourhoods.</em></h1>
            <p>
              Both centers run the same personal, assessment-first sessions.
              Pick the one closest to you — the map beside each address will
              help you find your way.
            </p>
          </div>
        </section>

        <section className="section wrap centers-list" aria-label="Our centers">
          {centers.map((center, index) => (
            <CenterBlock key={center.name} center={center} index={index + 1} onBook={openBooking} />
          ))}

          <div className="programs-cta">
            <button className="button" onClick={openBooking}>
              Book An Appointment <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />

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

function CenterBlock({ center, index, onBook }: { center: Center; index: number; onBook: () => void }) {
  return (
    <article className="center-block">
      <div className="center-copy">
        <span className="center-number">Center 0{index}</span>
        <h3>{center.name}</h3>
        <p className="center-tagline">{center.tagline}</p>
        <p className="center-address">{center.address}</p>
        <p className="center-landmark">{center.landmark}</p>
        <div className="center-actions">
          <a className="text-link" href={center.directions} target="_blank" rel="noreferrer">
            Get directions <span aria-hidden="true">↗</span>
          </a>
          {center.externalHref && (
            <a className="text-link" href={center.externalHref} target="_blank" rel="noreferrer">
              {center.externalLabel} <span aria-hidden="true">↗</span>
            </a>
          )}
          <button className="text-link" onClick={onBook}>Book an appointment →</button>
        </div>
      </div>
      <div className="map-frame">
        <iframe
          src={center.mapSrc}
          title={`Map of Shailja’s Fitness ${center.name} center, Indore`}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
        <a className="map-frame-link" href={center.directions} target="_blank" rel="noreferrer">
          {center.bigMapLabel} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  )
}
