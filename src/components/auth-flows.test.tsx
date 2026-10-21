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
  downloadPdf: vi.fn().mockResolvedValue(undefined),
  downloadDocx: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./SiteAuth', () => ({
  clerkConfigured: true,
  useSiteAuth: () => mocks.auth,
  signInToContinue: mocks.signIn,
}))
vi.mock('../lib/wellness/downloadPlan', () => ({
  downloadPlanPdf: mocks.downloadPdf,
  downloadPlanDocx: mocks.downloadDocx,
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

describe('personalised yoga locked preview, images and export', () => {
  it('renders only the payment lock card — never the plan content behind it', () => {
    mocks.auth.signedIn = true
    renderYoga()
    fillYoga()
    expect(screen.getByText('Your personalised plan is ready')).toBeTruthy()
    // The paid plan is not in the DOM at all, so it cannot leak by scrolling.
    expect(screen.queryByText('Demo payment successful. Your plan is unlocked.')).toBeNull()
    expect(screen.queryByText('Food do’s and don’ts')).toBeNull()
    expect(document.querySelector('.plan-day')).toBeNull()
    expect(document.querySelector('.plan-activity')).toBeNull()
    // Renamed payment action; the old prototype disclaimer line is gone.
    const payButton = screen.getByRole('button', { name: /Complete Payment and Generate/ })
    expect(screen.getByText('₹800')).toBeTruthy()
    // Notice bars and the demo-payment micro line no longer precede that button.
    expect(document.querySelector('.wellness-notice')).toBeNull()
    expect(screen.queryByText(/Demo payment · prototype/)).toBeNull()
    void payButton
    expect(screen.queryByText(/Safe prototype step/)).toBeNull()
    expect(screen.queryByText(/no card, UPI or bank details/)).toBeNull()
  })

  it('unlocks via the payment button, showing pose photos and download options', async () => {
    mocks.auth.signedIn = true
    renderYoga()
    fillYoga()
    fireEvent.click(screen.getByRole('button', { name: /Complete Payment and Generate/ }))
    await waitFor(() => expect(screen.getByText('Demo payment successful. Your plan is unlocked.')).toBeTruthy())
    expect(document.querySelectorAll('.plan-day').length).toBe(7)
    // Safety notices move with the unlocked plan content.
    expect(document.querySelectorAll('.wellness-notice').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Demo payment · prototype/)).toBeNull()
    // Every pose activity carries a local photo thumbnail with real alt text.
    const poseImages = Array.from(document.querySelectorAll<HTMLImageElement>('.plan-activity .activity-image'))
    expect(poseImages.length).toBeGreaterThan(0)
    for (const image of poseImages) {
      expect(image.getAttribute('src')).toMatch(/^\/yoga-poses\//)
      expect(image.getAttribute('alt')?.length ?? 0).toBeGreaterThan(0)
    }
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download Word (.docx)' })).toBeTruthy()
  })

  it('exports the plan to PDF and Word on click', async () => {
    mocks.auth.signedIn = true
    renderYoga()
    fillYoga()
    fireEvent.click(screen.getByRole('button', { name: /Complete Payment and Generate/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(mocks.downloadPdf).toHaveBeenCalledOnce())
    expect(mocks.downloadPdf.mock.calls[0][0]).toHaveProperty('days')
    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }))
    await waitFor(() => expect(mocks.downloadDocx).toHaveBeenCalledOnce())
    expect(mocks.downloadDocx.mock.calls[0][0]).toHaveProperty('food')
    expect(mocks.downloadDocx.mock.calls[0][1]).toBe('Aarav')
  })

  it('never offers a payment button or downloads for a safety-deferred plan', () => {
    mocks.auth.signedIn = true
    renderYoga()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Aarav' } })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'aarav@example.com' } })
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }))
    expect(screen.getByText('We’re pausing here — with care.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Complete Payment and Generate/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download PDF/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download Word/ })).toBeNull()
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
