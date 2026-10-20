import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'

export const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

const AuthContext = createContext({ ready: false, signedIn: false })

/** Keep unconfigured local previews usable without calling hooks outside ClerkProvider. */
export function SiteAuthProvider({ children }: { children: ReactNode }) {
  return clerkConfigured
    ? <ClerkAuthState>{children}</ClerkAuthState>
    : <AuthContext.Provider value={{ ready: true, signedIn: true }}>{children}</AuthContext.Provider>
}

function ClerkAuthState({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  return <AuthContext.Provider value={{ ready: isLoaded, signedIn: Boolean(isSignedIn) }}>{children}</AuthContext.Provider>
}

export const useSiteAuth = () => useContext(AuthContext)

export function signInToContinue() {
  const returnTo = window.location.pathname + window.location.search + window.location.hash
  window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`)
}
