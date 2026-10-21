import { createFileRoute } from '@tanstack/react-router'
import { api, DatabaseUnavailable, write } from '~/server/db'
import { apiHandler, clientIp, fail, limited, protectedWrite } from '~/server/http'

/** Clerk identity of the submitter, captured server-side; '' when unavailable. */
async function clerkUserId(): Promise<string> {
  try {
    const { auth } = await import('@clerk/tanstack-react-start/server')
    const state = await auth()
    return state.userId ?? ''
  } catch {
    // Clerk middleware is optional for this route; attribution is best-effort.
    return ''
  }
}

// The exact choices rendered in the form; the server refuses anything else
// so the Convex table stays clean and consistent.
const PROGRAMMES = ['Yoga Training', 'Fitness Training', 'Yoga & Fitness Training',
  'Meditation & Wellness', 'Not Sure — Need Guidance'] as const
const EXPERIENCES = ['Beginner — No prior experience', 'Some experience',
  'Experienced practitioner'] as const
const DURATIONS = ['Short-term training', '1 month', '3 months', '6 months',
  'Need guidance'] as const

export const Route = createFileRoute('/api/trainers')({
  server: {
    handlers: {
      POST: apiHandler(async ({ request }) => {
        const guard = await protectedWrite(request)
        if (!guard.ok) return guard.response
        const { body } = guard.ctx

        // Like the other API routes: trim, length-check, then hand to Convex.
        const required = (value: unknown, max: number, message: string): string => {
          if (typeof value !== 'string') throw new Error(message)
          const text = value.trim()
          if (text.length < 2 || text.length > max) throw new Error(message)
          return text
        }
        const optional = (value: unknown, max: number, message: string): string | null => {
          if (value === undefined || value === null || value === '') return null
          if (typeof value !== 'string') throw new Error(message)
          const text = value.trim()
          if (text.length > max) throw new Error(message)
          return text || null
        }
        const oneOf = <T extends readonly string[]>(
          value: unknown, choices: T, message: string,
        ): T[number] => {
          if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
            throw new Error(message)
          }
          return value as T[number]
        }

        try {
          const fullName = required(body.fullName, 80, 'Enter your full name.')
          const email = required(body.email, 254, 'Enter a valid email address.')
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.')
          const contactNumber = required(body.contactNumber, 16, 'Enter a valid mobile number.')
          if (!/^\+?[0-9][0-9\s-]{5,14}$/.test(contactNumber)) {
            throw new Error('Enter a valid mobile number.')
          }

          const record = {
            full_name: fullName,
            email,
            contact_number: contactNumber,
            training_programme: oneOf(body.trainingProgramme, PROGRAMMES,
              'Choose the training programme you are interested in.'),
            previous_experience: oneOf(body.previousExperience, EXPERIENCES,
              'Choose your level of experience.'),
            training_duration: oneOf(body.trainingDuration, DURATIONS,
              'Choose your preferred training duration.'),
            query_message: optional(body.queryMessage, 2000,
              'Keep your query under 2000 characters.'),
          } as const

          if (await limited(`trainers:${clientIp(request)}`, 5)) {
            return fail('Too many enquiries. Please try again in 15 minutes.', 429)
          }

          try {
            await write(api.trainers.submitEnquiry, {
              record: { ...record, user_id: await clerkUserId() },
            })
          } catch (error) {
            if (error instanceof DatabaseUnavailable) return fail(error.message, 503)
            return fail('Saving your enquiry failed. Please try again shortly.', 503)
          }
          return Response.json({ ok: true })
        } catch (error) {
          return fail(error instanceof Error ? error.message : 'Invalid enquiry.', 400)
        }
      }),
    },
  },
})
