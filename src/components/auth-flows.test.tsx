import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PersonalizedYogaDialog from './PersonalizedYogaDialog'
import BookingDialog from './BookingDialog'
import SiteHeader from './SiteHeader'
import { Route as BootcampRoute } from '~/routes/bootcamp'

const mocks = vi.hoisted(() => ({
  auth: { ready: true, signedIn: false },
  signIn: vi.fn(),
  navigate: vi.fn(),
  api: vi.fn(),
  loadBootstrap: vi.fn(),
}))

vi.mock('./SiteAuth', () => ({
  clerkConfigured: true,
  useSiteAuth: () => mocks.auth,
  signInToContinue: mocks.signIn,
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  UserButton: ({ userProfileMode }: { userProfileMode: string }) => <button>Profile: {userProfileMode}</button>,
}))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: any) => options,
  useNavigate: () => mocks.navigate,
  Link: ({ to, hash, children, ...props }: any) => <a href={to + (hash ?? '')} {...props}>{children}</a>,
  useRouterState: () => '/',
}))
vi.mock('~/lib/api', () => ({
  api: mocks.api,
  loadBootstrap: mocks.loadBootstrap,
  setCsrf: vi.fn(),
}))

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  mocks.auth.ready = true
  mocks.auth.signedIn = false
  mocks.api.mockResolvedValue({})
  mocks.loadBootstrap.mockResolvedValue({ services: [] })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollTo = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function renderYoga() {
  return render(<PersonalizedYogaDialog openRequest={{ seq: 1 }} onOpenChange={vi.fn()} />)
}

function fillYoga() {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Aarav' } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'aarav@example.com' } })
  fireEvent.change(screen.getByLabelText('Age'), { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }))
}

describe('personalised yoga sign-in gate', () => {
  it('saves valid answers and signs in before displaying the payment preview', () => {
    renderYoga()
    fillYoga()
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(JSON.parse(sessionStorage.getItem('pending_yoga_plan')!).name).toBe('Aarav')
    expect(screen.queryByText('Your personalised plan is ready')).toBeNull()
  })

  it('validates before requesting sign-in', () => {
    renderYoga()
    fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }))
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('name')
  })

  it('continues directly for a signed-in visitor', () => {
    mocks.auth.signedIn = true
    renderYoga()
    fillYoga()
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(screen.getByText('Your personalised plan is ready')).toBeTruthy()
  })

  it('restores a draft after sign-in and presents the locked preview', () => {
    sessionStorage.setItem('pending_yoga_plan', JSON.stringify({
      name: 'Aarav', email: 'aarav@example.com', age: '30', goals: ['general_wellness'],
    }))
    mocks.auth.signedIn = true
    renderYoga()
    expect(screen.getByText('Your personalised plan is ready')).toBeTruthy()
    expect(sessionStorage.getItem('pending_yoga_plan')).toBeNull()
  })

  it('restores answers without displaying results if sign-in was cancelled', () => {
    sessionStorage.setItem('pending_yoga_plan', JSON.stringify({
      name: 'Aarav', email: 'aarav@example.com', age: '30', goals: ['general_wellness'],
    }))
    renderYoga()
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Aarav')
    expect(screen.queryByText('Your personalised plan is ready')).toBeNull()
  })
})

function renderBooking(openRequest: { service?: string } | null) {
  return render(<BookingDialog data={null} onDataRefreshed={vi.fn()} openRequest={openRequest}
    onOpenChange={vi.fn()} onCloseChat={vi.fn()} onToast={vi.fn()} />)
}

describe('appointment sign-in gate', () => {
  it('requests sign-in before opening or loading appointments', () => {
    renderBooking({ service: 'yoga' })
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(mocks.loadBootstrap).not.toHaveBeenCalled()
    expect(JSON.parse(sessionStorage.getItem('pending_appointment')!).service).toBe('yoga')
  })

  it('waits for Clerk to load before deciding whether sign-in is needed', () => {
    mocks.auth.ready = false
    renderBooking({})
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.loadBootstrap).not.toHaveBeenCalled()
  })

  it('opens the saved appointment request after sign-in', async () => {
    mocks.auth.signedIn = true
    sessionStorage.setItem('pending_appointment', JSON.stringify({ service: 'yoga' }))
    const { container } = renderBooking(null)
    await waitFor(() => expect(mocks.loadBootstrap).toHaveBeenCalledOnce())
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true)
    expect(sessionStorage.getItem('pending_appointment')).toBeNull()
  })
})

describe('header account controls', () => {
  it('offers sign-in/sign-up to visitors', () => {
    render(<SiteHeader onBook={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in / Sign up' }))
    expect(mocks.signIn).toHaveBeenCalledOnce()
  })

  it('uses the Clerk user button with the profile modal for signed-in users', () => {
    mocks.auth.signedIn = true
    render(<SiteHeader onBook={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Profile: modal' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in / Sign up' })).toBeNull()
  })
})

const BootcampPage = (BootcampRoute as unknown as { component: () => React.ReactNode }).component

describe('bootcamp sign-in gate', () => {
  it('saves the completed form and signs in before submitting the enquiry', () => {
    const { container } = render(<BootcampPage />)
    fireEvent.submit(container.querySelector('form')!)
    expect(mocks.api).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('pending_bootcamp_enquiry')).not.toBeNull()
    expect(mocks.navigate).toHaveBeenCalledWith({ href: '/sign-in?redirect_url=/bootcamp' })
  })

  it('submits the saved enquiry automatically after sign-in', async () => {
    mocks.auth.signedIn = true
    sessionStorage.setItem('pending_bootcamp_enquiry', JSON.stringify({
      organisation: 'Test school', contactPerson: 'Aarav', email: 'aarav@example.com',
    }))
    render(<BootcampPage />)
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(
      '/api/bootcamps', expect.objectContaining({ organisation: 'Test school' }),
    ))
    await waitFor(() => expect(sessionStorage.getItem('pending_bootcamp_enquiry')).toBeNull())
  })

  it('does not submit or redirect while Clerk is still loading', () => {
    mocks.auth.ready = false
    const { container } = render(<BootcampPage />)
    fireEvent.submit(container.querySelector('form')!)
    expect(mocks.api).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
