import { useEffect, useRef, useState } from 'react'

interface SiteHeaderProps {
  onBook: () => void
}

export default function SiteHeader({ onBook }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeHash, setActiveHash] = useState('')
  const linksRef = useRef<HTMLDivElement>(null)

  const anchors = [
    ['#bootcamp', 'Bootcamp'],
    ['#programs', 'Programs'],
    ['#institutions', 'Institutions'],
    ['#certification', 'Certification'],
    ['#about', 'About Us'],
    ['#wall-of-love', 'Wall of Love'],
    ['#contact', 'Contact'],
  ]

  useEffect(() => {
    const links = linksRef.current
    if (!links) return
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveHash(`#${entry.target.id}`)
        }
      })
    }, { rootMargin: '-20% 0px -55% 0px' })
    links.querySelectorAll('a').forEach(a => {
      const section = document.querySelector(a.hash)
      if (section) observer.observe(section)
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="site-header">
      <div className="brand-row wrap">
        <a className="brand" href="#" aria-label="Shailja’s Fitness home">
          <img src="/brand.svg" width={48} height={56} alt="" />
          <span>Shailja’s <strong>Fitness</strong><small>MOVEMENT · BALANCE · YOU</small></span>
        </a>
        <div className="anniversary">
          <span className="anniversary-icon" aria-hidden="true">✧</span>
          <span>Celebrating <strong>7+ Years</strong> of Wellness<small>A journey of movement, a lifetime of possibility.</small></span>
        </div>
        <button
          className="mobile-menu icon-button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen(open => !open)}
        >
          {menuOpen ? '×' : '☰'}
        </button>
      </div>
      <div className="nav-row">
        <nav className="wrap" id="main-nav" aria-label="Main navigation">
          <div className={`nav-links${menuOpen ? ' open' : ''}`} ref={linksRef}>
            {anchors.map(([hash, label]) => (
              <a
                key={hash}
                href={hash}
                className={activeHash === hash ? 'active' : ''}
                onClick={closeMenu}
              >
                {label}
              </a>
            ))}
          </div>
          <button className="button small" onClick={onBook}>Book an Appointment <span aria-hidden="true">↗</span></button>
        </nav>
      </div>
    </header>
  )
}
