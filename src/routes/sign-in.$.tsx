import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

// Clerk preserves redirect_url through sign-in and sign-up, returning visitors
// to the page that saved their plan, appointment or enquiry.
function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand.svg" width={40} height={52} alt="" />
        <h1>Welcome back</h1>
        <p className="auth-copy">
          Sign in to continue with your yoga plan, appointment or bootcamp enquiry.
          Your details stay saved while you are here.
        </p>
        <div className="auth-component">
          <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/" signUpUrl="/sign-up" />
        </div>
      </div>
    </main>
  )
}
