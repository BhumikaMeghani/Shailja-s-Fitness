import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/sign-up/$')({
  component: SignUpPage,
})

// Clerk owns every /sign-up/* step and retains the original return URL.
function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand.svg" width={40} height={52} alt="" />
        <h1>Create your account</h1>
        <p className="auth-copy">
          Create an account to continue with your yoga plan, appointment or
          bootcamp enquiry. Your details stay saved while you are here.
        </p>
        <div className="auth-component">
          <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/" signInUrl="/sign-in" />
        </div>
      </div>
    </main>
  )
}
