const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const classIcons = {
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 9 7-4v14l-7-4"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>'
};

class Booking {
  constructor() {
    this.dialog = document.getElementById('booking-dialog');
    this.body = document.getElementById('booking-body');
    this.errorEl = document.getElementById('booking-error');
    this.step = 'class';
    this.authMode = 'login';
    this.selection = {service: null, date: null, starts_at: null};
    this.requestVersion = 0;
    this.busy = false;
    document.getElementById('booking-close').addEventListener('click', () => this.close());
    this.dialog.addEventListener('close', () => { this.returnFocus?.focus(); });
  }
  async open(service, preferences) {
    this.returnFocus = document.activeElement;
    window.chat?.close();
    if (!this.dialog.open) this.dialog.showModal();
    this.errorEl.textContent = '';
    if (!Studio.data) {
      this.body.innerHTML = '<h2 id="booking-title">A moment of calm…</h2><p>Connecting to the booking service.</p>';
      try { await Studio.load(); }
      catch (error) {
        this.body.innerHTML = '<h2 id="booking-title">Let’s try again.</h2><p>We couldn’t connect to the booking service.</p><div class="booking-actions"><button class="button" id="retry-booking">Retry connection</button></div>';
        this.errorEl.textContent = error.message;
        this.on('retry-booking', () => this.open(service, preferences));
        return;
      }
    }
    if (service && this.selection.service !== service) {
      this.selection = {service, date: null, starts_at: null};
      this.step = 'calendar';
    }
    if (preferences) this.preferences = preferences;
    this.render();
  }
  close() { this.dialog.close(); }
  on(id, fn) { document.getElementById(id)?.addEventListener('click', fn); }
  service() { return Studio.data.services.find(s => s.id === this.selection.service); }
  heading(title, subtitle) {
    return `<div class="eyebrow">A LITTLE TIME FOR YOU</div><h2 id="booking-title">${title}</h2><p>${subtitle}</p>`;
  }
  notice() {
    return `<div class="dev-callout">${Studio.data.development ? 'DEVELOPMENT PREVIEW · These sample slots are not real studio availability. No real appointment will be made.' : 'Real studio availability is not connected yet. Booking is not currently open.'}</div>`;
  }
  summary() {
    const service = this.service();
    const when = new Date(this.selection.starts_at);
    const price = service.price_paise ? `${new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR'}).format(service.price_paise / 100)} · TEST only` : 'To be confirmed · Not payable';
    const rows = [
      ['Class', service.name],
      ['Date', when.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'})],
      ['Time', when.toLocaleTimeString('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'}) + ' · Asia/Kolkata'],
      ['Duration', service.duration_minutes ? `${service.duration_minutes} minutes · configured preview` : 'To be confirmed'],
      ['Price', price],
      ['Taxes / additional charges', service.tax_paise ? `₹${(service.tax_paise / 100).toFixed(2)} · TEST only` : 'None configured'],
      ...(service.price_paise ? [['Test total', `₹${((service.price_paise + service.tax_paise) / 100).toFixed(2)} · Not a real charge`]] : [])
    ];
    return `<div class="booking-summary">${rows.map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${escapeHTML(value)}</strong></div>`).join('')}</div>`;
  }
  render() {
    this.requestVersion++;
    this.errorEl.textContent = '';
    const steps = ['Class', 'Date & time', 'Review', 'Account', 'Finish'];
    const index = {class: 0, calendar: 1, review: 2, auth: 3, payment: 4, result: 4}[this.step];
    document.getElementById('booking-progress').innerHTML = steps.map((label, i) => `<span class="progress-item ${i <= index ? 'current' : ''}">${i + 1}. ${label}</span>`).join('');
    if (this.step === 'class') this.renderClasses();
    if (this.step === 'calendar') this.renderCalendar();
    if (this.step === 'review') this.renderReview();
    if (this.step === 'auth') this.renderAuth();
    if (this.step === 'payment') this.renderPayment();
    if (this.step === 'result') this.renderResult();
  }
  go(step) {
    this.step = step;
    this.render();
    this.dialog.scrollTop = 0;
    this.body.querySelector('h2')?.setAttribute('tabindex', '-1');
    this.body.querySelector('h2')?.focus({preventScroll: true});
  }
  renderClasses() {
    this.body.innerHTML = this.heading('Make space for yourself.', 'Choose how you’d like to begin. You can change this later.') + this.notice() +
      `<div class="class-options">${Studio.data.services.map(service => `<button class="class-option ${this.selection.service === service.id ? 'selected' : ''}" data-service="${service.id}"><span>${classIcons[service.icon]}</span><span><strong>${service.name}</strong><small>${service.description}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</div>`;
    this.body.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => {
      if (this.selection.service !== button.dataset.service) this.selection = {service: button.dataset.service, date: null, starts_at: null};
      this.go('calendar');
    }));
  }
  renderCalendar() {
    const today = Studio.data.today;
    if (!this.month) this.month = new Date(today + 'T12:00:00');
    const year = this.month.getFullYear(), month = this.month.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const dateKey = day => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const days = Array.from({length: firstDay}, () => '<span></span>').join('') + Array.from({length: count}, (_, i) => {
      const key = dateKey(i + 1);
      return `<button class="calendar-day ${key === this.selection.date ? 'selected' : ''} ${key === today ? 'today' : ''}" data-date="${key}" ${key < today ? 'disabled' : ''} aria-label="${new Date(key + 'T12:00:00').toLocaleDateString('en-IN', {dateStyle: 'full'})}" aria-pressed="${key === this.selection.date}">${i + 1}</button>`;
    }).join('');
    this.body.innerHTML = this.heading('A moment that fits.', escapeHTML(this.service().name) + ' · Choose a date and sample time.') + this.notice() +
      `<div class="calendar-header"><button class="icon-button" id="month-prev" aria-label="Previous month" ${dateKey(1).slice(0,7) <= today.slice(0,7) ? 'disabled' : ''}>‹</button><strong>${this.month.toLocaleDateString('en-IN', {month: 'long', year: 'numeric'})}</strong><button class="icon-button" id="month-next" aria-label="Next month">›</button></div>
      <div class="calendar-grid" role="group" aria-label="Select a date">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span class="weekday">${d}</span>`).join('')}${days}</div>
      <div class="slots-heading">Available times <span>Asia/Kolkata · IST</span></div><div id="slots" aria-live="polite"><p class="empty-state">Choose a date to see sample availability.</p></div>
      <div class="booking-actions"><button class="back-button" id="back-classes">← Class options</button><button class="button" id="calendar-continue" ${this.selection.starts_at ? '' : 'disabled'}>Review booking <span>→</span></button></div>`;
    this.on('month-prev', () => { this.month = new Date(year, month - 1, 1); this.render(); });
    this.on('month-next', () => { this.month = new Date(year, month + 1, 1); this.render(); });
    this.on('back-classes', () => this.go('class'));
    this.on('calendar-continue', () => { if (this.selection.starts_at) this.go('review'); });
    this.body.querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => {
      this.selection.date = button.dataset.date;
      this.selection.starts_at = null;
      this.render();
    }));
    if (this.selection.date) this.loadSlots();
  }
  async loadSlots() {
    const version = ++this.requestVersion;
    const container = document.getElementById('slots');
    const continueButton = document.getElementById('calendar-continue');
    continueButton.disabled = true;
    container.innerHTML = '<p class="empty-state">Checking availability…</p>';
    try {
      const data = await Studio.api(`/api/availability?service=${this.selection.service}&date=${this.selection.date}`);
      if (version !== this.requestVersion) return;
      if (!data.slots.some(slot => slot.starts_at === this.selection.starts_at && slot.available)) this.selection.starts_at = null;
      continueButton.disabled = !this.selection.starts_at;
      if (!data.slots.length) {
        container.innerHTML = `<p class="empty-state">${escapeHTML(data.message || 'No sample times on this date. Try another day within the next 60 days; Sundays have no sample slots.')}</p>`;
        return;
      }
      container.innerHTML = `<div class="time-slots">${data.slots.map(slot => `<button class="slot-button ${this.selection.starts_at === slot.starts_at ? 'selected' : ''}" data-slot="${slot.starts_at}" ${slot.available ? '' : 'disabled'} aria-pressed="${this.selection.starts_at === slot.starts_at}">${new Date(slot.starts_at).toLocaleTimeString('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'})}${slot.available ? '' : ' · Taken'}</button>`).join('')}</div>`;
      container.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => {
        this.selection.starts_at = button.dataset.slot;
        container.querySelectorAll('button').forEach(b => {
          b.classList.toggle('selected', b === button);
          b.setAttribute('aria-pressed', String(b === button));
        });
        continueButton.disabled = false;
      }));
    } catch (error) {
      if (version !== this.requestVersion) return;
      container.innerHTML = '<p class="empty-state">Couldn’t load availability. <button class="text-link" id="retry-slots">Try again</button></p>';
      this.errorEl.textContent = error.message;
      this.on('retry-slots', () => { this.errorEl.textContent = ''; this.loadSlots(); });
    }
  }
  renderReview() {
    this.body.innerHTML = this.heading('Your time, thoughtfully chosen.', 'Take a moment to check the details before continuing.') + this.summary() + this.notice() +
      '<div class="booking-actions"><button class="back-button" id="back-calendar">← Change date or time</button><button class="button" id="review-continue">Continue <span>→</span></button></div>';
    this.on('back-calendar', () => this.go('calendar'));
    this.on('review-continue', () => this.go(Studio.data.user ? 'payment' : 'auth'));
  }
  renderAuth() {
    this.body.innerHTML = this.heading('A familiar face. Or a fresh start.', 'Sign in or create an account to continue. Your selected session is saved.') +
      `<div class="auth-tabs" role="group" aria-label="Account options"><button id="auth-login" class="${this.authMode === 'login' ? 'selected' : ''}" aria-pressed="${this.authMode === 'login'}">Sign In</button><button id="auth-register" class="${this.authMode === 'register' ? 'selected' : ''}" aria-pressed="${this.authMode === 'register'}">Create Account</button></div>
      <form class="auth-form" id="auth-form"><label for="auth-email">Email address</label><input id="auth-email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com">
      <label for="auth-password">Password</label><div class="password-field"><input id="auth-password" type="password" autocomplete="${this.authMode === 'login' ? 'current-password' : 'new-password'}" required minlength="12" maxlength="128" aria-describedby="password-help"><button type="button" id="show-password" aria-label="Show password" aria-pressed="false">Show</button></div><small id="password-help">Use 12–128 characters. Only your email and password are needed.</small>
      <button class="button" type="submit" id="auth-submit">${this.authMode === 'login' ? 'Sign In' : 'Create Account'} & Continue <span>→</span></button></form>
      <p class="booking-micro">Password recovery is not yet available. No account details are stored in your browser.</p><button class="back-button" id="back-review">← Back to your selection</button>`;
    this.on('auth-login', () => { this.authMode = 'login'; this.render(); });
    this.on('auth-register', () => { this.authMode = 'register'; this.render(); });
    this.on('show-password', () => {
      const input = document.getElementById('auth-password');
      const button = document.getElementById('show-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(show));
    });
    this.on('back-review', () => this.go('review'));
    document.getElementById('auth-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (this.busy) return;
      this.busy = true;
      const button = document.getElementById('auth-submit');
      button.disabled = true;
      button.textContent = 'Securing your session…';
      this.errorEl.textContent = '';
      try {
        const result = await Studio.api('/api/auth/' + this.authMode, {
          email: document.getElementById('auth-email').value,
          password: document.getElementById('auth-password').value
        });
        Studio.data.user = result.user;
        Studio.data.csrf = result.csrf;
        this.go('payment');
      } catch (error) {
        this.errorEl.textContent = error.message;
        button.disabled = false;
        button.textContent = this.authMode === 'login' ? 'Sign In & Continue' : 'Create Account & Continue';
      } finally { this.busy = false; }
    });
  }
  renderPayment() {
    const ready = Studio.data.payments_configured && this.service().price_paise && this.service().duration_minutes && Studio.data.development;
    this.body.innerHTML = this.heading('One step closer.', 'This is a preview, not a real studio reservation.') + this.summary() + this.notice() +
      `<div class="account-bar"><span>Signed in as ${escapeHTML(Studio.data.user.email)}</span><button id="sign-out">Sign out</button></div>
      <div class="booking-actions"><button class="back-button" id="back-review">← Review</button><button class="button" id="demo-booking" ${Studio.data.development ? '' : 'disabled'}>Finish demo · No payment <span>→</span></button></div>
      <div class="booking-actions"><button class="button secondary" id="test-payment" ${ready ? '' : 'disabled'}>Try Razorpay TEST Checkout ↗</button></div>
      <p class="booking-micro">${ready ? 'Test mode only. Use Razorpay test payment instruments, never real card details.' : 'Checkout is gated: explicit test pricing, duration, Razorpay test keys and a webhook secret are required. You can still finish the demo without payment.'}</p>`;
    this.on('back-review', () => this.go('review'));
    this.on('sign-out', async () => {
      try {
        const result = await Studio.api('/api/auth/logout', {});
        Studio.data.csrf = result.csrf;
        Studio.data.user = null;
        this.go('auth');
      } catch (error) { this.errorEl.textContent = error.message; }
    });
    this.on('demo-booking', () => this.finishDemo());
    this.on('test-payment', () => this.checkout());
  }
  payload() { return {service: this.selection.service, starts_at: this.selection.starts_at}; }
  async finishDemo() {
    if (this.busy) return;
    this.busy = true;
    const button = document.getElementById('demo-booking');
    button.disabled = true;
    button.textContent = 'Saving demo…';
    try {
      const result = await Studio.api('/api/bookings/demo', this.payload());
      this.result = result;
      this.go('result');
    } catch (error) {
      this.errorEl.textContent = error.message;
      button.disabled = false;
      button.textContent = 'Finish demo · No payment →';
    } finally { this.busy = false; }
  }
  async loadCheckout() {
    if (window.Razorpay) return;
    if (!this.checkoutScript) {
      this.checkoutScript = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = resolve;
        script.onerror = () => { script.remove(); this.checkoutScript = null; reject(new Error('Razorpay Checkout could not load. Please try again.')); };
        document.head.append(script);
      });
    }
    await this.checkoutScript;
  }
  async checkout() {
    if (this.busy) return;
    this.busy = true;
    const button = document.getElementById('test-payment');
    button.disabled = true;
    button.textContent = 'Preparing TEST Checkout…';
    try {
      await this.loadCheckout();
      const order = await Studio.api('/api/payments/order', this.payload());
      this.activeOrder = order;
      const checkout = new window.Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
        name: 'Shailja’s Fitness', description: 'Development booking · TEST only',
        prefill: {email: Studio.data.user.email}, theme: {color: '#16877F'},
        handler: async payment => {
          this.dialog.showModal();
          try {
            const result = await Studio.api('/api/payments/verify', {...payment, booking: order.booking});
            this.result = {...result, booking: order.booking};
          } catch (error) {
            this.result = {status: 'pending', booking: order.booking, message: error.message + ' No booking is confirmed until the server verifies capture.'};
          }
          this.go('result');
        },
        modal: {ondismiss: () => {
          if (!this.dialog.open) this.dialog.showModal();
          if (this.step !== 'result') {
            this.result = {status: 'pending', booking: order.booking, message: 'Checkout closed. No paid booking is confirmed. A test order remains pending; check its status or reopen the same checkout.'};
            this.go('result');
          }
        }}
      });
      checkout.on('payment.failed', () => {
        this.result = {status: 'pending', booking: order.booking, message: 'Test payment failed. No paid booking has been confirmed. You may retry checkout or check the server status.'};
        if (!this.dialog.open) this.dialog.showModal();
        this.go('result');
      });
      // Native modal's top layer would cover the gateway iframe; restore it on completion.
      this.dialog.close();
      checkout.open();
    } catch (error) { this.errorEl.textContent = error.message; }
    finally {
      this.busy = false;
      if (document.getElementById('test-payment')) {
        button.disabled = false;
        button.textContent = 'Try Razorpay TEST Checkout ↗';
      }
    }
  }
  renderResult() {
    const pending = this.result.status === 'pending';
    this.body.innerHTML = `<div class="success-icon">${pending ? '◷' : '✓'}</div>` +
      this.heading(pending ? 'Awaiting verification.' : this.result.status === 'demo' ? 'Your demo is complete.' : 'Test payment verified.', escapeHTML(this.result.message)) +
      this.summary() + `<p class="booking-micro">Reference: ${escapeHTML(this.result.booking)}<br>Preview only. This is not a real appointment or a production payment.</p><div class="result-actions">${pending ? '<button class="button" id="check-status">Check server status</button><button class="button secondary" id="retry-checkout">Retry TEST Checkout</button>' : ''}<button class="button ${pending ? 'secondary' : ''}" id="finish-close">Back to wellness ↗</button><button class="back-button" id="new-booking">Explore another session</button></div>`;
    this.on('finish-close', () => this.close());
    this.on('new-booking', () => {
      this.activeOrder = null;
      this.selection = {service: null, date: null, starts_at: null};
      this.go('class');
    });
    this.on('retry-checkout', () => { this.go('payment'); this.checkout(); });
    this.on('check-status', async () => {
      try {
        const result = await Studio.api('/api/bookings/' + this.result.booking);
        this.result.status = result.status;
        this.result.message = result.status === 'confirmed' ? 'Razorpay TEST payment captured and verified by the server. Not a real appointment.' : 'Still awaiting verified capture. No paid booking is confirmed.';
        this.render();
      } catch (error) { this.errorEl.textContent = error.message; }
    });
  }
}
