import { useEffect, useRef, useState } from 'react'
import { ChatMessage, chatNode, type ChatOption, type ChatState } from '~/lib/knowledge'
import type { BootstrapData } from '~/lib/api'

interface ChatWidgetProps {
  data: BootstrapData | null
  open: boolean
  /** External navigation requests, e.g. from a program card or contact section. */
  navigateRequest: { key: string; detail?: string } | null
  onOpenChange: (open: boolean) => void
  onBookingRequested: (service: string | null, preferences: { time?: string; day?: string } | null) => void
}

export default function ChatWidget({ data, open, navigateRequest, onOpenChange, onBookingRequested }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [options, setOptions] = useState<ChatOption[]>([])
  const [backDisabled, setBackDisabled] = useState(true)
  const stateRef = useRef<ChatState>({})
  const stackRef = useRef<{ key: string; detail: string }[]>([])
  const historyRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

  const context = () => ({ state: stateRef.current, contact: data?.contact ?? { email: '', phone: '', address: '' } })

  const bubble = (text: string, visitor = false) => {
    setMessages(current => [...current, { text, visitor }])
    requestAnimationFrame(() => {
      historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'instant' })
    })
  }

  const navigate = (key: string, detail = '') => {
    if (key === 'openBooking') {
      bubble('Your preferences are saved for this conversation. Choose a date and time in the booking preview. This does not confirm a real appointment.')
      onOpenChange(false)
      onBookingRequested(stateRef.current.service ?? null, { time: stateRef.current.time, day: stateRef.current.day })
      return
    }
    if (key === 'section') {
      onOpenChange(false)
      document.getElementById(detail)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    const node = chatNode(key, context(), detail)
    stackRef.current.push({ key, detail })
    bubble(node.text)
    setOptions(node.options)
    setBackDisabled(stackRef.current.length < 2)
  }

  const openChat = () => {
    onOpenChange(true)
    if (!stackRef.current.length) navigate('main')
  }

  // Navigate externally when a request arrives (program cards, contact section).
  useEffect(() => {
    if (navigateRequest) {
      openChat()
      navigate(navigateRequest.key, navigateRequest.detail ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateRequest])

  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) document.getElementById('chat-close')?.focus()
    else if (wasOpenRef.current) launcherRef.current?.focus()
    wasOpenRef.current = open
  }, [open])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onOpenChange(false)
  }

  const back = () => {
    if (stackRef.current.length < 2) return
    stackRef.current.pop()
    const previous = stackRef.current.pop()
    if (previous) navigate(previous.key, previous.detail)
  }

  const reset = () => {
    stateRef.current = {}
    stackRef.current = []
    setMessages([])
    setOptions([])
    navigate('main')
  }

  const choose = (chosen: ChatOption) => {
    bubble(chosen.label, true)
    navigate(chosen.next, chosen.detail ?? '')
  }

  return (
    <>
      <button
        className="chat-launcher"
        ref={launcherRef}
        onClick={openChat}
        aria-label="Open wellness assistant"
        aria-expanded={open}
        aria-controls="chat-panel"
        hidden={open}
      >
        <span className="chat-avatar" aria-hidden="true">✧</span>
        <span>
          <strong>Hi! Welcome to Shailja’s Fitness</strong>
          <small>How can we help you today?</small>
        </span>
        <span aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <aside id="chat-panel" className="chat-panel" aria-label="Shailja’s Fitness wellness assistant" hidden={!open} onKeyDown={onKeyDown}>
        <header className="chat-header">
          <span className="assistant-avatar" aria-hidden="true">✧</span>
          <div>
            <strong>Your wellness companion</strong>
            <small>Shailja’s Fitness · Guided assistant</small>
          </div>
          <button id="chat-minimize" className="icon-button" aria-label="Minimize assistant" onClick={() => onOpenChange(false)}>−</button>
          <button id="chat-close" className="icon-button" aria-label="Close assistant" onClick={() => onOpenChange(false)}>×</button>
        </header>
        <div className="chat-history" ref={historyRef} role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble${message.visitor ? ' visitor' : ''}`}>{message.text}</div>
          ))}
        </div>
        <div className="chat-options" aria-label="Conversation options">
          {options.map((chosen, index) => (
            <button key={`${chosen.label}-${index}`} type="button" onClick={() => choose(chosen)}>
              {chosen.label}
            </button>
          ))}
        </div>
        <div className="chat-navigation">
          <button id="chat-back" onClick={back} disabled={backDisabled}>← Back</button>
          <button id="chat-main" onClick={() => navigate('main')}>Main menu</button>
          <button id="chat-reset" onClick={reset}>Restart</button>
        </div>
        <p className="chat-hint">Choose an option above. No typing needed.</p>
      </aside>
    </>
  )
}
