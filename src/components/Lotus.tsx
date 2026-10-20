interface LotusProps {
  className?: string
}

export default function Lotus({ className }: LotusProps) {
  return (
    <svg className={className} viewBox="0 0 48 30" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 3.5c-3.2 4.1-3.2 10.9 0 15 3.2-4.1 3.2-10.9 0-15Z" />
        <path d="M14.5 6.5c-.4 5.2 2 9.6 6.4 12.2" />
        <path d="M33.5 6.5c.4 5.2-2 9.6-6.4 12.2" />
        <path d="M5.5 14c2.4 4.6 7.7 7 13.4 6.2" />
        <path d="M42.5 14c-2.4 4.6-7.7 7-13.4 6.2" />
        <path d="M8.5 25.5c10 2.6 21 2.6 31 0" />
      </g>
    </svg>
  )
}
