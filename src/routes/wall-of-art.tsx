import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import SiteHeader from '~/components/SiteHeader'
import BookingDialog from '~/components/BookingDialog'
import { loadBootstrap, type BootstrapData } from '~/lib/api'
import SiteFooter from '~/components/SiteFooter'
import OptimizedImage from '~/components/OptimizedImage'

export const Route = createFileRoute('/wall-of-art')({
  component: WallOfArtPage,
})

const REEL_URL = 'https://www.instagram.com/reel/Dd6YZesNfC1/'

interface Review {
  name: string
  when: string
  src: string
  width: number
  height: number
}

const reviews: Review[] = [
  {
    name: 'Kanak Panchal',
    when: '2 months ago · ★★★★★',
    src: '/images/reviews/kanak-panchal.png',
    width: 597,
    height: 330,
  },
  {
    name: 'Mrnalinee Sawaliya',
    when: '2 years ago · ★★★★★',
    src: '/images/reviews/mrnalinee-sawaliya.jpg',
    width: 587,
    height: 461,
  },
  {
    name: 'Rahul B',
    when: '4 years ago · ★★★★★',
    src: '/images/reviews/rahul-b.png',
    width: 556,
    height: 282,
  },
  {
    name: 'Poonam Manwani',
    when: '4 years ago · ★★★★★',
    src: '/images/reviews/poonam-manwani.png',
    width: 572,
    height: 222,
  },
  {
    name: 'Jyoti Bairagi',
    when: '2 years ago · ★★★★★',
    src: '/images/reviews/jyoti-bairagi.png',
    width: 542,
    height: 347,
  },
]

// Each review frame rotates through its own slice of reviews on a staggered
// clock, so all five voices keep going round the wall.
const slotOffsets = [0, 4000, 2400] // ms offset per frame (top, right, bottom)
const SLOT_INTERVAL = 12000

function useRotatingIndex(count: number, offset: number) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (count <= 1) return
    const timer = setInterval(() => {
      setIndex(current => (current + 1) % count)
    }, SLOT_INTERVAL + offset)
    return () => clearInterval(timer)
  }, [count, offset])
  return index
}

function ReviewFrame({
  className,
  reviews,
  offset,
}: {
  className: string
  reviews: Review[]
  offset: number
}) {
  const index = useRotatingIndex(reviews.length, offset)
  const review = reviews[index]
  return (
    <figure className={`art-frame reveal ${className}`}>
      <div className="review-slot">
        <OptimizedImage
          key={review.src}
          src={review.src}
          alt={`Google review from ${review.name}`}
          width={review.width}
          height={review.height}
          sizes="(max-width: 760px) 90vw, 560px"
        />
      </div>
      <figcaption className="review-name">
        {review.name} <span>{review.when}</span>
      </figcaption>
    </figure>
  )
}

// Our own studio reel, hosted on the site so it plays quietly and loops
// forever. It starts muted — studio reels autoplay silently that way — and a
// small button hands the sound back to the visitor.
function StudioReel() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }, [])

  return (
    <div className="reel-video">
      <video
        ref={videoRef}
        src="/videos/studio-reel.mp4"
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        aria-label="Studio reel from Shailja’s Fitness"
      />
      <button
        type="button"
        className="reel-mute"
        onClick={toggleMute}
        aria-pressed={!muted}
        aria-label={muted ? 'Turn reel sound on' : 'Turn reel sound off'}
      >
        {muted ? '🔇 Sound off' : '🔊 Sound on'}
      </button>
    </div>
  )
}

function WallOfArtPage() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [bookingRequest, setBookingRequest] = useState<{ seq: number } | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const seq = useRef(0)
  const wallRef = useRef<HTMLElement>(null)

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

  // Fade the wall pieces up in place as the visitor scrolls to them.
  useEffect(() => {
    const wall = wallRef.current
    if (!wall) return
    const targets = wall.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    wall.classList.add('wall-animate')
    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  const openBooking = useCallback(() => {
    seq.current += 1
    setBookingRequest({ seq: seq.current })
  }, [])

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader onBook={openBooking} />

      <main id="main">
        <section className="programs-hero">
          <div className="wrap">
            <h1>Our studio, framed.<br /><em>Our people, in their words.</em></h1>
          </div>
        </section>

        <section className="section wrap wall-of-art" aria-label="Studio reel and Google reviews" ref={wallRef}>
          <div className="reel-column">
            <div className="reel-frame reveal">
              <StudioReel />
              <a className="text-link" href={REEL_URL} target="_blank" rel="noreferrer">
                Watch the reel on Instagram <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          <div className="reviews-column">
            <div className="reviews-intro reveal">
              <div className="eyebrow medium-eyebrow">GOOGLE REVIEWS</div>
            </div>
            <div className="reviews-wall">
              <ReviewFrame className="frame-top" reviews={[reviews[0], reviews[2], reviews[4]]} offset={slotOffsets[0]} />
              <ReviewFrame className="frame-big" reviews={[reviews[1], reviews[3], reviews[0]]} offset={slotOffsets[1]} />
              <ReviewFrame className="frame-bottom" reviews={[reviews[3], reviews[4], reviews[1]]} offset={slotOffsets[2]} />
            </div>
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
