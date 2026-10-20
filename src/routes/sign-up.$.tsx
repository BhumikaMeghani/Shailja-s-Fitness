import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/sign-up/$')({
  component: SignUpPage,
})

// Catch-all route so Clerk owns every /sign-up/* step. Creating the account
// hands back to /bootcamp, where the stored enquiry is submitted.
function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand.svg" width={40} height={52} alt="" />
        <h1>Create your account</h1>
        <p className="auth-copy">
          One quick account and your bootcamp enquiry can be submitted — and
          your details stay saved while you are here.
        </p>
        <div className="auth-component">
          <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/bootcamp" signInUrl="/sign-in" />
        </div>
      </div>
    </main>
  )
}
