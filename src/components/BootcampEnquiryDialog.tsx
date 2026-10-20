import { forwardRef } from 'react'

export const SUCCESS_MESSAGE =
  'Thank you! Your bootcamp enquiry has been submitted. Our team will contact you shortly.'

export interface BootcampForm {
  organisation: string
  contactPerson: string
  email: string
  contactNumber: string
  organisationCategory: string
  bootcampType: string
  purpose: string
  participants: string
  preferredDate: string
  preferredDuration: string
  preferredMode: string
  cityVenue: string
  additionalRequirements: string
}

export const emptyBootcampForm: BootcampForm = {
  organisation: '',
  contactPerson: '',
  email: '',
  contactNumber: '',
  organisationCategory: '',
  bootcampType: '',
  purpose: '',
  participants: '',
  preferredDate: '',
  preferredDuration: '',
  preferredMode: '',
  cityVenue: '',
  additionalRequirements: '',
}

const CATEGORIES = [
  'School',
  'College / University',
  'IT / Technology Company',
  'Corporate / Business',
  'Event Organiser',
  'Other',
]

const SESSION_TYPES = [
  'Yoga',
  'Fitness / Workout',
  'Meditation & Mindfulness',
  'Yoga + Fitness',
  'Wellness Session',
  'Custom Requirement',
]

const PARTICIPANTS = ['1–25', '26–50', '51–100', '101–250', '250+']

const DURATIONS = ['1 hour', '2 hours', 'Half day', 'Full day', 'Multiple sessions', 'Need guidance']

const MODES = ['At our venue', 'At your organisation’s venue', 'Online', 'Open to discussion']

interface BootcampEnquiryDialogProps {
  form: BootcampForm
  onChange: (field: keyof BootcampForm, value: string) => void
  onSubmit: () => void
  submitting: boolean
  error: string
  onClose: () => void
}

/**
 * The "Organize Bootcamp at Your Organization" form, shown in a modal dialog
 * like the studio's booking dialog. Presentational only: the page owns the
 * form state so saved drafts survive the Clerk sign-in round-trip.
 */
export default forwardRef<HTMLDialogElement, BootcampEnquiryDialogProps>(
  function BootcampEnquiryDialog(
    { form, onChange, onSubmit, submitting, error, onClose }: BootcampEnquiryDialogProps,
    ref,
  ) {
    const update = (field: keyof BootcampForm) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        onChange(field, event.target.value)

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onSubmit()
    }

    const choice = (id: string, label: string, options: string[], required: boolean,
      value: string, field: keyof BootcampForm, placeholder = 'Select an option') => (
      <div className="field">
        <label htmlFor={id}>{label}{required ? '' : ' · optional'}</label>
        <select id={id} name={id} required={required} value={value} onChange={update(field)}>
          <option value="" disabled>{placeholder}</option>
          {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    )

    return (
      <dialog ref={ref} aria-labelledby="bootcamp-form-title" className="bootcamp-dialog" onClose={onClose}>
        <div className="bootcamp-shell">
          <header className="booking-header">
            <span className="eyebrow bootcamp-form-eyebrow">BOOTCAMP ENQUIRY</span>
            <button className="icon-button" aria-label="Close bootcamp form" onClick={onClose}>×</button>
          </header>
          <div className="bootcamp-body">
            <h2 id="bootcamp-form-title">Organize a bootcamp<br />at your organisation.</h2>
            <p className="bootcamp-form-intro">
              Tell us about your organisation and your requirements. Our team
              will get in touch to discuss a suitable yoga or fitness session
              for your group.
            </p>
            <form className="contact-form bootcamp-form" onSubmit={submit}>
              <div className="field span-2">
                <label htmlFor="bootcamp-organisation">Organisation / Institution Name</label>
                <input id="bootcamp-organisation" name="organisation" required maxLength={160}
                  placeholder="Enter your school, college, company or organisation name"
                  autoComplete="organization" value={form.organisation}
                  onChange={update('organisation')} />
              </div>
              <div className="field">
                <label htmlFor="bootcamp-person">Contact Person Name</label>
                <input id="bootcamp-person" name="contactPerson" required maxLength={80}
                  placeholder="Enter the name of the person coordinating the bootcamp"
                  autoComplete="name" value={form.contactPerson}
                  onChange={update('contactPerson')} />
              </div>
              <div className="field">
                <label htmlFor="bootcamp-email">Email Address</label>
                <input id="bootcamp-email" name="email" type="email" required maxLength={254}
                  placeholder="Enter your official or preferred email address"
                  autoComplete="email" value={form.email}
                  onChange={update('email')} />
              </div>
              <div className="field">
                <label htmlFor="bootcamp-number">Contact Number</label>
                <input id="bootcamp-number" name="contactNumber" type="tel" required maxLength={16}
                  inputMode="tel" placeholder="Enter your 10-digit contact number"
                  autoComplete="tel" value={form.contactNumber}
                  onChange={update('contactNumber')} />
              </div>
              {choice('bootcamp-category', 'Organisation Category', CATEGORIES, true,
                form.organisationCategory, 'organisationCategory')}
              {choice('bootcamp-type', 'Type of Bootcamp / Session', SESSION_TYPES, true,
                form.bootcampType, 'bootcampType')}
              <div className="field span-2">
                <label htmlFor="bootcamp-purpose">Purpose of the Bootcamp</label>
                <input id="bootcamp-purpose" name="purpose" maxLength={500}
                  placeholder="e.g. student wellness, employee wellbeing, fitness awareness, stress management, special event"
                  value={form.purpose} onChange={update('purpose')} />
              </div>
              {choice('bootcamp-participants', 'Expected Number of Participants', PARTICIPANTS, true,
                form.participants, 'participants')}
              <div className="field">
                <label htmlFor="bootcamp-date">Preferred Date · optional</label>
                <input id="bootcamp-date" name="preferredDate" type="date"
                  placeholder="Select your preferred date for the bootcamp"
                  value={form.preferredDate} onChange={update('preferredDate')} />
              </div>
              {choice('bootcamp-duration', 'Preferred Duration', DURATIONS, false,
                form.preferredDuration, 'preferredDuration')}
              {choice('bootcamp-mode', 'Preferred Mode', MODES, true,
                form.preferredMode, 'preferredMode')}
              <div className="field span-2">
                <label htmlFor="bootcamp-city">City / Venue Location</label>
                <input id="bootcamp-city" name="cityVenue" maxLength={200}
                  placeholder="Enter the city and venue, if already decided"
                  value={form.cityVenue} onChange={update('cityVenue')} />
              </div>
              <div className="field span-2">
                <label htmlFor="bootcamp-notes">Additional Requirements</label>
                <textarea id="bootcamp-notes" name="additionalRequirements" maxLength={2000}
                  placeholder="Share your goals, participant age group, fitness level, accessibility needs or other details"
                  value={form.additionalRequirements}
                  onChange={update('additionalRequirements')} />
              </div>
              {error && <p className="booking-error bootcamp-error span-2" role="alert">{error}</p>}
              <div className="span-2 bootcamp-submit-row">
                <p className="bootcamp-signin-hint">
                  You will be asked to sign in before the enquiry is submitted.
                </p>
                <button className="button" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Bootcamp Enquiry'} <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </dialog>
    )
  },
)
