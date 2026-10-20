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
const CATEGORIES = ['School', 'College / University', 'IT / Technology Company',
  'Corporate / Business', 'Event Organiser', 'Other'] as const
const SESSION_TYPES = ['Yoga', 'Fitness / Workout', 'Meditation & Mindfulness',
  'Yoga + Fitness', 'Wellness Session', 'Custom Requirement'] as const
const PARTICIPANT_RANGES = ['1–25', '26–50', '51–100', '101–250', '250+'] as const
const DURATIONS = ['1 hour', '2 hours', 'Half day', 'Full day',
  'Multiple sessions', 'Need guidance'] as const
const MODES = ['At our venue', 'At your organisation’s venue', 'Online',
  'Open to discussion'] as const

export const Route = createFileRoute('/api/bootcamps')({
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
          const organisation = required(body.organisation, 160, 'Enter your organisation name.')
          const contactPerson = required(body.contactPerson, 80, 'Enter the contact person name.')
          const email = required(body.email, 254, 'Enter a valid email address.')
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.')
          const contactNumber = required(body.contactNumber, 16, 'Enter a valid 10-digit contact number.')
          if (!/^\+?[0-9][0-9\s-]{5,14}$/.test(contactNumber)) {
            throw new Error('Enter a valid 10-digit contact number.')
          }

          const record = {
            organisation,
            contact_person: contactPerson,
            email,
            contact_number: contactNumber,
            organisation_category: oneOf(body.organisationCategory, CATEGORIES, 'Choose the organisation category.'),
            bootcamp_type: oneOf(body.bootcampType, SESSION_TYPES, 'Choose the type of bootcamp.'),
            purpose: optional(body.purpose, 500, 'Keep the purpose under 500 characters.'),
            participants: oneOf(body.participants, PARTICIPANT_RANGES, 'Choose the expected number of participants.'),
            preferred_date: ((body.preferredDate === undefined || body.preferredDate === null ||
              body.preferredDate === '') ? null
              : (typeof body.preferredDate === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate) ? body.preferredDate : null)),
            preferred_duration: (body.preferredDuration === undefined || body.preferredDuration === null)
              ? null
              : oneOf(body.preferredDuration, DURATIONS, 'Choose a preferred duration.'),
            preferred_mode: oneOf(body.preferredMode, MODES, 'Choose the preferred mode.'),
            city_venue: optional(body.cityVenue, 200, 'Keep the location under 200 characters.'),
            additional_requirements: optional(body.additionalRequirements, 2000,
              'Keep the additional details under 2000 characters.'),
          } as const

          if (await limited(`bootcamps:${clientIp(request)}`, 5)) {
            return fail('Too many enquiries. Please try again in 15 minutes.', 429)
          }

          try {
            await write(api.bootcamps.submitEnquiry, {
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
