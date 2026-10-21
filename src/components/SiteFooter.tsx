import { Link } from '@tanstack/react-router'

const links = [
  { label: 'Programs', to: '/programs' },
  { label: 'Centers', to: '/centers' },
  { label: 'About Us', to: '/about' },
  { label: 'Wall of Art', to: '/wall-of-art' },
  { label: 'Contact', to: '/contact' },
] as const

export default function SiteFooter() {
  return (
    <footer>
      <div className="wrap footer-top">
        <Link to="/" className="brand footer-brand">
          <img src="/brand.svg" width={40} height={48} alt="" />
          <span>Shailja’s <strong>Fitness</strong></span>
        </Link>
        <nav className="footer-nav" aria-label="Footer">
          {links.map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </nav>
        <div className="footer-contact">
          <strong>Contact us</strong>
          <p>412, Usha Nagar, Sudama Nagar, Indore, Madhya Pradesh 452009, India</p>
          <a href="mailto:shailjafitness@gmail.com">shailjafitness@gmail.com</a>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>© {new Date().getFullYear()} Shailja’s Fitness</span>
      </div>
    </footer>
  )
}
