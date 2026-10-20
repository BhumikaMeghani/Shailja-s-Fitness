import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

// Catch-all route so Clerk owns every /sign-in/* step (.factor-one and
// friends). After signing in, visitors land on /bootcamp with their enquiry
// saved automatically; any other entry defaults to the home page.
function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand.svg" width={40} height={52} alt="" />
        <h1>Welcome back</h1>
        <p className="auth-copy">
          Sign in to organise a bootcamp at your organisation. Your details
          stay saved while you are here.
        </p>
        <div className="auth-component">
          <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/bootcamp" signUpUrl="/sign-up" />
        </div>
      </div>
    </main>
  )
}
