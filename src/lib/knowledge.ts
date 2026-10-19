/**
 * Approved Shailja’s information only. Reference studio facts are never imported.
 * Update this module when the owner verifies programs, trainers, policies and offers.
 */

export const WellnessKnowledge = {
  categories: ['Yoga', 'Zumba', 'Dance', 'Weight Loss', 'Fitness'],
  trainers: [] as string[],
  offers: [] as string[],
  policies: null as string | null,
  unknown: 'That information is awaiting confirmation from Shailja’s Fitness. We won’t guess. You can view the contact section or explore the appointment journey.',
  online: 'Online Live Class is one of the appointment options. The platform, class format and real timings are awaiting studio confirmation. A stable internet connection and a comfortable, clear space are useful for online practice.',
  beginner: 'If you’re new to yoga, discuss your experience and comfort level with the studio before choosing a session. Beginner-specific offerings are awaiting confirmation. No practice should cause pain; seek qualified advice when needed.',
}

export interface ChatMessage {
  text: string
  visitor?: boolean
}

export interface ChatOption {
  label: string
  next: string
  detail?: string
}

export interface ChatNode {
  text: string
  options: ChatOption[]
}

export interface ChatState {
  service?: string
  interest?: string
  time?: string
  day?: string
}

export interface ChatContext {
  state: ChatState
  contact: { email: string; phone: string; address: string }
}

/* Pure decision-tree engine. Each node returns a message and contextual next actions. */
export function chatNode(key: string, context: ChatContext, detail = ''): ChatNode {
  const { state, contact } = context
  const option = (label: string, next: string, extra = ''): ChatOption => ({ label, next, detail: extra })
  const main = option('Main menu', 'main')
  const contactOption = option('Contact the studio', 'contact')
  const book = option('Explore appointment booking', 'trial')
  const unknown = WellnessKnowledge.unknown
  switch (key) {
    case 'main': return {
      text: 'Hi! Welcome to Shailja’s Fitness. How can we help you today?',
      options: [
        option('🧘 Explore Yoga Classes', 'classes'), option('📍 Our Locations', 'locations'),
        option('👩‍🏫 Meet Our Trainers', 'trainers'), option('🌿 Wellness Programs', 'programs'),
        option('🎁 Current Offers', 'offers'), option('📅 Trial & Appointment Enquiries', 'trial'),
        option('❓ Frequently Asked Questions', 'faqs'),
      ],
    }
    case 'classes': return {
      text: 'Wonderful! What kind of yoga experience are you looking for? Specific formats still need confirmation from the studio.',
      options: ['Beginner-Friendly Yoga', 'General Fitness', 'Weight Management', 'Meditation and Relaxation']
        .map(label => option(label, 'classInfo', label))
        .concat([
          option('Online Classes', 'classInfo', 'Online Live Class'), option('Studio Classes', 'classInfo', 'Studio Class'),
          option('Private Sessions', 'classInfo', 'Private Class'), main,
        ]),
    }
    case 'classInfo': {
      const service = ({ 'Online Live Class': 'online', 'Studio Class': 'studio', 'Private Class': 'private' } as Record<string, string>)[detail]
      if (service) state.service = service
      state.interest = detail
      return {
        text: detail === 'Online Live Class' ? WellnessKnowledge.online :
          detail === 'Beginner-Friendly Yoga' ? WellnessKnowledge.beginner :
            `${detail}: let’s find out whether this is the right fit. The exact class content and availability are to be confirmed.`,
        options: [option('View class details', 'details'), option('Check available timings', 'timings'),
          option('Explore pricing', 'pricing'), book, option('Back to classes', 'classes')],
      }
    }
    case 'details': return {
      text: `${state.interest || 'Class'} details are not yet verified. ${unknown}`,
      options: [contactOption, book, option('Back to classes', 'classes')],
    }
    case 'timings': return {
      text: 'A real studio timetable has not been supplied. The booking calendar is a development preview with clearly labelled sample slots, not confirmed availability.',
      options: [option('Preview the booking calendar', 'openBooking'), contactOption, main],
    }
    case 'pricing': return {
      text: 'Customer pricing and durations have not been finalized. Any configured Razorpay amount is for TEST mode only, never an actual amount due.',
      options: [contactOption, book, option('Back to classes', 'classes')],
    }
    case 'locations': return {
      text: 'Where would you like to practice? Our verified address will be added before studio bookings open.',
      options: [
        option('Studio location', 'locationInfo'), option('Online classes', 'online'),
        option('Corporate yoga sessions', 'corporate'), contactOption, main,
      ],
    }
    case 'locationInfo': return {
      text: contact.address || 'The studio address has not yet been verified for this website. Please do not use reference-site addresses.',
      options: [contactOption, book, option('Back to locations', 'locations')],
    }
    case 'online':
      state.service = 'online'
      return { text: WellnessKnowledge.online, options: [book, option('Online class requirements', 'faqAnswer', 'online'), contactOption, main] }
    case 'corporate': return {
      text: 'Institutional and corporate offerings are not yet confirmed. Visit the institutions section for the current status.',
      options: [option('View institutions section', 'section', 'institutions'), contactOption, main],
    }
    case 'trainers': return {
      text: 'Meet the people who will guide your wellness journey. Verified trainer profiles are not yet available, so we won’t invent names or qualifications.',
      options: [option('View all trainers', 'trainerInfo'), option('Trainer expertise', 'trainerInfo'), option('Personalized guidance', 'guidance'), book, main],
    }
    case 'trainerInfo': return {
      text: 'Trainer names, photographs and qualifications will be shared after studio approval.',
      options: [contactOption, option('Personalized guidance', 'guidance'), book, option('Back to trainers', 'trainers')],
    }
    case 'guidance':
      state.service = 'private'
      return {
        text: 'You can choose Private Class in the appointment flow to explore personal guidance. Trainer expertise and the scope of each session need studio confirmation.',
        options: [book, contactOption, main],
      }
    case 'programs': return {
      text: 'Let’s explore what you’d like to focus on. These are interests, not promises of available programs or health outcomes.',
      options: [
        ...['Improve Flexibility', 'Fitness and Strength', 'Weight Management', 'Stress Relief and Meditation', 'Holistic Wellness']
          .map(label => option(label, 'programInfo', label)),
        option('Not sure yet', 'goals'), main,
      ],
    }
    case 'goals': return {
      text: 'What would you most like to focus on?',
      options: ['Physical Fitness', 'Relaxation', 'Flexibility', 'Healthy Lifestyle']
        .map(label => option(label, 'programInfo', label))
        .concat([option('Explore all programs', 'programs'), main]),
    }
    case 'programInfo':
      state.interest = detail
      return {
        text: `Interested in ${detail}? Our branding includes Yoga, Zumba, Dance, Weight Loss and Fitness. Specific offerings and suitability need confirmation; we don’t promise health outcomes.`,
        options: [book, contactOption, option('Explore other goals', 'programs')],
      }
    case 'offers': return {
      text: 'There are no verified offers, packages or free-trial promotions published yet. A trial is not assumed to be free.',
      options: [option('Trial class enquiry', 'trial'), option('Current packages', 'pricing'), option('Special offers', 'offerInfo'), contactOption, main],
    }
    case 'offerInfo': return {
      text: 'No current discounts or offers have been verified. Please check with the studio before relying on any promotion.',
      options: [contactOption, book, option('Back to offers', 'offers')],
    }
    case 'trial': return {
      text: 'Let’s explore your preferences. Trial eligibility and any fee must be confirmed by the studio. Which class would you prefer?',
      options: [
        option('Online Class', 'preferenceClass', 'online'), option('Studio Class', 'preferenceClass', 'studio'),
        option('Private Session', 'preferenceClass', 'private'), main,
      ],
    }
    case 'preferenceClass':
      state.service = detail
      return {
        text: 'What time of day works best? This is a preference, not a confirmed slot.',
        options: ['Morning', 'Afternoon', 'Evening', 'Flexible Timing'].map(label => option(label, 'preferenceTime', label)),
      }
    case 'preferenceTime':
      state.time = detail
      return {
        text: 'And which days do you prefer?',
        options: ['Weekday', 'Weekend', 'Flexible'].map(label => option(label, 'preferenceDay', label)),
      }
    case 'preferenceDay':
      state.day = detail
      return {
        text: `Your preferences:\nClass: ${{ online: 'Online Live Class', studio: 'Studio Class', private: 'Private Class' }[state.service || '']}\nTime: ${state.time}\nDay: ${state.day}\n\nNothing is booked yet. Continue to choose an actual date in the development preview.`,
        options: [option('Continue to booking', 'openBooking'), option('Change preferences', 'trial'), main],
      }
    case 'faqs': return {
      text: 'What would you like to know?',
      options: [
        option('Is yoga suitable for beginners?', 'faqAnswer', 'beginner'),
        option('What types of classes are available?', 'classes'),
        option('What do I need for online classes?', 'faqAnswer', 'online'),
        option('Can I choose my class timing?', 'timings'), option('How do I book a trial?', 'trial'),
        option('Cancellation and rescheduling', 'faqAnswer', 'policy'), main,
      ],
    }
    case 'faqAnswer': return {
      text: detail === 'beginner' ? WellnessKnowledge.beginner :
        detail === 'online' ? WellnessKnowledge.online :
          'Cancellation and rescheduling policies are not yet published. Confirm the policy with the studio before making a real appointment.',
      options: [book, option('Explore classes', 'classes'), option('More FAQs', 'faqs'), contactOption],
    }
    case 'contact': return {
      text: Object.values(contact).filter(Boolean).join('\n') || 'Verified contact details have not yet been published. You can view the contact section or explore the development booking journey; no real appointment will be confirmed.',
      options: [option('View contact section', 'section', 'contact'), book, main],
    }
    default: return { text: unknown, options: [contactOption, main] }
  }
}
