import { useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { UserButton } from '@clerk/tanstack-react-start'
import { clerkConfigured, signInToContinue, useSiteAuth } from '~/components/SiteAuth'
import Lotus from '~/components/Lotus'

interface SiteHeaderProps {
  onBook: () => void
}

interface AnchorLink {
  label: string
  to: '/' | '/bootcamp' | '/programs' | '/centers' | '/contact' | '/wall-of-art'
  hash?: string
}

const anchors: AnchorLink[] = [
  { label: 'Bootcamp', to: '/bootcamp' },
  { label: 'Programs', to: '/programs' },
  { label: 'Centers', to: '/centers' },
  { label: 'About Us', to: '/', hash: '#about' },
  { label: 'Wall of Art', to: '/wall-of-art' },
  { label: 'Contact', to: '/contact' },
]

export default function SiteHeader({ onBook }: SiteHeaderProps) {
  const { ready, signedIn } = useSiteAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeHash, setActiveHash] = useState('')
  const linksRef = useRef<HTMLDivElement>(null)
  const pathname = useRouterState({ select: state => state.location.pathname })

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
      const target = a.getAttribute('data-anchor')
      const section = target ? document.querySelector(target) : null
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

  const isNavLinkActive = (link: AnchorLink) => {
    if (link.to !== '/') return pathname === link.to
    if (pathname !== '/') return false
    return Boolean(link.hash && activeHash === link.hash)
  }

  return (
    <header className="site-header">
      <div className="header-inner wrap">
        <Link className="brand" to="/" aria-label="Shailja’s Fitness home">
          <img src="/brand.svg" width={40} height={52} alt="" />
          <span>Shailja’s<b>Fitness</b></span>
        </Link>
        <div className="header-divider" aria-hidden="true"></div>
        <div className="anniversary">
          <Lotus className="lotus" />
          <span>
            Celebrating <strong>7+ Years</strong>
            <br />
            of Wellness
          </span>
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
        <div className={`nav-links${menuOpen ? ' open' : ''}`} ref={linksRef} id="main-nav">
          <nav aria-label="Main navigation">
            {anchors.map(link => (
              <Link
                key={link.label}
                to={link.to}
                hash={link.hash}
                data-anchor={link.hash}
                className={isNavLinkActive(link) ? 'active' : ''}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {clerkConfigured && (
            <div className="header-account">
              {ready && signedIn
                ? <UserButton userProfileMode="modal" />
                : <button className="account-button" disabled={!ready} onClick={() => { closeMenu(); signInToContinue() }}>Sign in / Sign up</button>}
            </div>
          )}
          <button className="button small" onClick={() => { closeMenu(); onBook() }}>Book an Appointment</button>
        </div>
      </div>
    </header>
  )
}
