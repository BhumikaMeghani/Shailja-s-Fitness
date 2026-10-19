/**
 * NOT a studio timetable. Relative, development-only fixtures in Asia/Kolkata.
 * Ported from studio/development_data.py; slot strings stay in the same format.
 */
const IST_OFFSET_MINUTES = 330

const SAMPLE_TIMES: Record<string, string[]> = {
  online: ['07:00', '09:30', '18:00'],
  studio: ['08:00', '10:00', '17:30'],
  private: ['09:00', '12:00', '18:30'],
}

export interface IstNow {
  date: string
  hour: number
  minute: number
}

export function nowIst(): Date {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utcMs + IST_OFFSET_MINUTES * 60_000)
}

export function istDateKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function sampleSlots(service: string, day: string): string[] {
  const now = nowIst()
  const [year, month, date] = day.split('-').map(Number)
  const dayDate = new Date(year, month - 1, date)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (dayDate < today || dayDate > new Date(today.getTime() + 60 * 86_400_000) || dayDate.getDay() === 0) {
    return []
  }
  return SAMPLE_TIMES[service]
    .map(time => new Date(year, month - 1, date, Number(time.slice(0, 2)), Number(time.slice(3, 5))))
    .filter(slotDate => slotDate.getTime() > now.getTime())
    .map(slotDate => `${day}T${String(slotDate.getHours()).padStart(2, '0')}:${String(slotDate.getMinutes()).padStart(2, '0')}:00+05:30`)
}
