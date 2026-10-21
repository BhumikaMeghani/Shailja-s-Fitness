import { forwardRef } from 'react'

export const SUCCESS_MESSAGE =
  'Thank you for your interest! Our team will contact you with details about the training programme and certification process.'

export interface TrainerForm {
  fullName: string
  contactNumber: string
  email: string
  trainingProgramme: string
  previousExperience: string
  trainingDuration: string
  queryMessage: string
}

export const emptyTrainerForm: TrainerForm = {
  fullName: '',
  contactNumber: '',
  email: '',
  trainingProgramme: '',
  previousExperience: '',
  trainingDuration: '',
  queryMessage: '',
}

const PROGRAMMES = [
  'Yoga Training',
  'Fitness Training',
  'Yoga & Fitness Training',
  'Meditation & Wellness',
  'Not Sure — Need Guidance',
]

const EXPERIENCE_LEVELS = [
  'Beginner — No prior experience',
  'Some experience',
  'Experienced practitioner',
]

const DURATIONS = ['Short-term training', '1 month', '3 months', '6 months', 'Need guidance']

interface TrainerEnquiryDialogProps {
  form: TrainerForm
  onChange: (field: keyof TrainerForm, value: string) => void
  onSubmit: () => void
  submitting: boolean
  error: string
  onClose: () => void
}

/**
 * The "Become a Trainer" Training Programme Enquiry form, shown in a modal
 * dialog like the studio's booking dialog. Presentational only: the page owns
 * the form state so saved drafts survive the Clerk sign-in round-trip.
 */
export default forwardRef<HTMLDialogElement, TrainerEnquiryDialogProps>(
  function TrainerEnquiryDialog(
    { form, onChange, onSubmit, submitting, error, onClose }: TrainerEnquiryDialogProps,
    ref,
  ) {
    const update = (field: keyof TrainerForm) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        onChange(field, event.target.value)

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onSubmit()
    }

    const choice = (id: string, label: string, options: string[], value: string,
      field: keyof TrainerForm) => (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select id={id} name={id} required value={value} onChange={update(field)}>
          <option value="" disabled>Select an option</option>
          {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    )

    return (
      <dialog ref={ref} aria-labelledby="trainer-form-title" className="bootcamp-dialog trainer-dialog" onClose={onClose}>
        <div className="bootcamp-shell">
          <header className="booking-header">
            <span className="eyebrow bootcamp-form-eyebrow">TRAINING PROGRAMME ENQUIRY</span>
            <button className="icon-button" aria-label="Close enquiry form" onClick={onClose}>×</button>
          </header>
          <div className="bootcamp-body">
            <h2 id="trainer-form-title">Become a trainer<br />at our institute.</h2>
            <p className="bootcamp-form-intro">
              Interested in training with us? Share your details and preferred
              training programme. Our team will contact you with information
              about available batches, training duration, fees and
              certification.
            </p>
            <form className="contact-form bootcamp-form" onSubmit={submit}>
              <div className="field">
                <label htmlFor="trainer-name">Full Name</label>
                <input id="trainer-name" name="fullName" required maxLength={80}
                  placeholder="Enter your full name" autoComplete="name" value={form.fullName}
                  onChange={update('fullName')} />
              </div>
              <div className="field">
                <label htmlFor="trainer-number">Contact Number</label>
                <input id="trainer-number" name="contactNumber" type="tel" required maxLength={16}
                  inputMode="tel" placeholder="Enter your mobile number"
                  autoComplete="tel" value={form.contactNumber}
                  onChange={update('contactNumber')} />
              </div>
              <div className="field span-2">
                <label htmlFor="trainer-email">Email Address</label>
                <input id="trainer-email" name="email" type="email" required maxLength={254}
                  placeholder="Enter your email address" autoComplete="email" value={form.email}
                  onChange={update('email')} />
              </div>
              {choice('trainer-programme', 'Training Programme Interested In',
                PROGRAMMES, form.trainingProgramme, 'trainingProgramme')}
              {choice('trainer-experience', 'Previous Experience',
                EXPERIENCE_LEVELS, form.previousExperience, 'previousExperience')}
              {choice('trainer-duration', 'Preferred Training Duration',
                DURATIONS, form.trainingDuration, 'trainingDuration')}
              <div className="field span-2">
                <label htmlFor="trainer-query">Your Query · optional</label>
                <textarea id="trainer-query" name="queryMessage" maxLength={2000}
                  placeholder="Ask about certification, fees, batches or training schedules"
                  value={form.queryMessage} onChange={update('queryMessage')} />
              </div>
              {error && <p className="booking-error bootcamp-error span-2" role="alert">{error}</p>}
              <div className="span-2 bootcamp-submit-row">
                <p className="bootcamp-signin-hint">
                  You will be asked to sign in before the enquiry is submitted.
                </p>
                <button className="button" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Enquiry'} <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </dialog>
    )
  },
)
