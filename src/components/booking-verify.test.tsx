import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BookingDialog from './BookingDialog'
import type { BootstrapData, BookingResult } from '~/lib/api'

const mocks = vi.hoisted(() => ({
  auth: { ready: true, signedIn: true },
  signIn: vi.fn(),
  api: vi.fn(),
  loadBootstrap: vi.fn(),
}))

vi.mock('./SiteAuth', () => ({
  clerkConfigured: true,
  useSiteAuth: () => mocks.auth,
  signInToContinue: mocks.signIn,
}))
vi.mock('~/lib/api', () => ({
  api: mocks.api,
  loadBootstrap: mocks.loadBootstrap,
  setCsrf: vi.fn(),
}))

const boot: BootstrapData = {
  csrf: 'c',
  user: { email: 'u@example.com' },
  services: [
    { id: 'online', name: 'Online Live Class', description: 'A little space for wellness, wherever you are.', icon: 'video', price_paise: null, duration_days: 30, currency: 'INR' },
    { id: 'studio', name: 'Studio Class', description: 'Make room for movement in a shared studio setting.', icon: 'home', price_paise: null, duration_days: 30, currency: 'INR' },
    { id: 'private', name: 'Private Class', description: 'Explore a more personal approach to your practice.', icon: 'user', price_paise: null, duration_days: 30, currency: 'INR' },
  ],
  development: true,
  today: '2026-10-21',
  timezone: 'Asia/Kolkata',
  payments_configured: true,
  contact: { email: '', phone: '', address: '' },
}

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  mocks.auth.ready = true
  mocks.auth.signedIn = true
  mocks.api.mockImplementation(async (path: string, body?: Record<string, unknown>): Promise<unknown> => {
    if (path.includes('/api/availability')) {
      return { slots: [{ starts_at: '2026-10-22T07:00:00+05:30', available: true }, { starts_at: '2026-10-22T09:30:00+05:30', available: false }], development: true }
    }
    if (path.includes('/api/bookings/demo')) {
      expect(body).toMatchObject({ service: 'online', plan: 'Normal Yoga' })
      return { booking: 'abc', status: 'demo', message: 'Demo reservation only.' } satisfies BookingResult
    }
    return {}
  })
  mocks.loadBootstrap.mockResolvedValue(boot)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('booking dialog verification', () => {
  it('loads a new date while the old one is pending and ignores its late response', async () => {
    let resolveOld!: (value: unknown) => void
    let oldSignal: AbortSignal | undefined
    mocks.api.mockImplementation((path: string, _body: unknown, signal: AbortSignal) => {
      if (path.includes('date=2026-10-22')) {
        oldSignal = signal
        return new Promise(resolve => { resolveOld = resolve })
      }
      return Promise.resolve({
        slots: [{ starts_at: '2026-10-23T18:00:00+05:30', available: true }], development: true,
      })
    })
    render(<BookingDialog data={boot} onDataRefreshed={vi.fn()} openRequest={{}}
      onOpenChange={vi.fn()} onCloseChat={vi.fn()} onToast={vi.fn()} />)
    fireEvent.click(screen.getByText('Online Live Class').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /22 October/ }))
    expect(screen.getByText('Checking availability…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /23 October/ }))
    expect(oldSignal?.aborted).toBe(true)
    await screen.findByRole('button', { name: /06:00/ })
    await act(async () => resolveOld({
      slots: [{ starts_at: '2026-10-22T07:00:00+05:30', available: true }], development: true,
    }))
    expect(screen.queryByRole('button', { name: /07:00/ })).toBeNull()
    expect(screen.getByRole('button', { name: /06:00/ })).toBeTruthy()
    // Clicking the same date revalidates instead of clearing results forever.
    fireEvent.click(screen.getByRole('button', { name: /23 October/ }))
    await screen.findByRole('button', { name: /06:00/ })
    expect(mocks.api).toHaveBeenCalledTimes(3)
  })

  it('allows another date and a retry after a failed availability request', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Database unavailable'))
    render(<BookingDialog data={boot} onDataRefreshed={vi.fn()} openRequest={{}}
      onOpenChange={vi.fn()} onCloseChat={vi.fn()} onToast={vi.fn()} />)
    fireEvent.click(screen.getByText('Online Live Class').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /22 October/ }))
    await screen.findByText('Database unavailable')
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await screen.findByRole('button', { name: /07:00/ })
    fireEvent.click(screen.getByRole('button', { name: /23 October/ }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(3))
  })

  it('shows only the three class options and completes a plan booking with the right summary', async () => {
    render(<BookingDialog
      data={boot}
      onDataRefreshed={vi.fn()}
      openRequest={{ service: null, preferences: { plan: 'Normal Yoga' } }}
      onOpenChange={vi.fn()} onCloseChat={vi.fn()} onToast={vi.fn()}
    />)

    // Classes step: exactly the three formats, no plan cards.
    expect(screen.getByText('Online Live Class')).toBeTruthy()
    expect(screen.getByText('Studio Class')).toBeTruthy()
    expect(screen.getByText('Private Class')).toBeTruthy()
    expect(screen.queryByText('Normal Yoga')).toBeNull()
    expect(screen.queryByText('Pregnancy Yoga')).toBeNull()

    // Pick a format, then a date and an available slot.
    fireEvent.click(screen.getByText('Online Live Class').closest('button')!)
    await screen.findByText(/Choose a date and sample time/)
    const day = screen.getByRole('button', { name: /22 October/ }) as HTMLButtonElement
    fireEvent.click(day)
    const slot = await screen.findByRole('button', { name: /07:00/ }) as HTMLButtonElement
    expect((screen.getByRole('button', { name: /09:30/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(slot)
    fireEvent.click(await screen.findByRole('button', { name: /Review booking/ }))

    // Review step: plan, 30 days, plan price, total, no tax line.
    expect(screen.getByText('Plan')).toBeTruthy()
    expect(screen.getByText('Normal Yoga')).toBeTruthy()
    expect(screen.getByText('30 days')).toBeTruthy()
    expect(screen.getAllByText('₹1,500').length).toBe(2)
    expect(screen.queryByText(/Taxes/)).toBeNull()

    // Continue (Clerk signed in) and finish the demo.
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Finish demo/ }))
    await waitFor(() => expect(screen.getByText('You have Successfully Enrolled.')).toBeTruthy())
    expect(screen.getByText(/abc/)).toBeTruthy()
  })
})
