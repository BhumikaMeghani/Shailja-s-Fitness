/**
 * Gmail SMTP delivery for contact-page queries. Credentials never leave the
 * server: SMTP_USER plus an App Password authenticate, and messages land in
 * CONTACT_NOTIFY_EMAIL (default bhoomikameghani0110@gmail.com). When no
 * credentials are configured the caller falls back to a mailto link.
 */
import nodemailer from 'nodemailer'
import { env } from './env'

export const QUERY_RECIPIENT = env.CONTACT_NOTIFY_EMAIL || 'bhoomikameghani0110@gmail.com'

export interface QueryDetails {
  name: string
  address: string
  email: string
  mobile: string
  message: string
}

export function smtpConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_APP_PASSWORD)
}

function mailText(details: QueryDetails): string {
  return [
    `Name: ${details.name}`,
    `Address: ${details.address}`,
    `Mobile Number: ${details.mobile}`,
    ...(details.email ? [`Email: ${details.email}`] : []),
    '',
    details.message,
  ].join('\n')
}

export function mailtoFallback(details: QueryDetails): string {
  const params = new URLSearchParams({ subject: `Website query from ${details.name}`, body: mailText(details) })
  return `mailto:${QUERY_RECIPIENT}?${params.toString().replaceAll('+', '%20')}`
}

/** Sends the saved query by email; returns false when SMTP is unavailable. */
export async function sendQuery(details: QueryDetails): Promise<{ delivered: boolean }> {
  if (!smtpConfigured()) return { delivered: false }
  const client = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_APP_PASSWORD },
  })
  try {
    await client.sendMail({
      from: env.SMTP_USER,
      to: QUERY_RECIPIENT,
      replyTo: details.email || undefined,
      subject: `Website query from ${details.name}`,
      text: mailText(details),
    })
    return { delivered: true }
  } catch (error) {
    // Never expose SMTP details to the browser; degrade to the fallback link.
    console.error('Contact email failed:', error instanceof Error ? error.name : 'unknown')
    return { delivered: false }
  }
}
