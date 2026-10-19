class WellnessChat {
  constructor() {
    this.panel = document.getElementById('chat-panel');
    this.launcher = document.getElementById('chat-launcher');
    this.history = document.getElementById('chat-history');
    this.options = document.getElementById('chat-options');
    this.state = {};
    this.navigation = [];
    this.launcher.addEventListener('click', () => this.open());
    ['chat-close', 'chat-minimize'].forEach(id => document.getElementById(id).addEventListener('click', () => this.close()));
    document.getElementById('chat-main').addEventListener('click', () => this.navigate('main'));
    document.getElementById('chat-back').addEventListener('click', () => {
      if (this.navigation.length < 2) return;
      this.navigation.pop();
      const previous = this.navigation.pop();
      this.navigate(previous.key, previous.detail);
    });
    document.getElementById('chat-reset').addEventListener('click', () => {
      this.state = {};
      this.navigation = [];
      this.history.replaceChildren();
      this.navigate('main');
    });
    this.panel.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
  }
  open() {
    this.panel.hidden = false;
    this.launcher.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'true');
    if (!this.navigation.length) this.navigate('main');
    document.getElementById('chat-close').focus();
  }
  close() {
    this.panel.hidden = true;
    this.launcher.hidden = false;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.focus();
  }
  bubble(text, visitor = false) {
    const el = document.createElement('div');
    el.className = 'chat-bubble' + (visitor ? ' visitor' : '');
    el.textContent = text;
    this.history.append(el);
    requestAnimationFrame(() => this.history.scrollTo({top: this.history.scrollHeight, behavior: 'instant'}));
  }
  navigate(key, detail = '') {
    if (key === 'openBooking') {
      this.bubble('Your preferences are saved for this conversation. Choose a date and time in the booking preview. This does not confirm a real appointment.');
      this.close();
      window.booking.open(this.state.service, {time: this.state.time, day: this.state.day});
      return;
    }
    if (key === 'section') {
      this.close();
      document.getElementById(detail)?.scrollIntoView({behavior: 'smooth'});
      return;
    }
    const node = chatNode(key, this.state, detail);
    this.navigation.push({key, detail});
    this.bubble(node.text);
    this.options.replaceChildren();
    node.options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        this.bubble(option.label, true);
        this.navigate(option.next, option.detail);
        if (!this.panel.hidden) this.options.querySelector('button')?.focus({preventScroll: true});
      });
      this.options.append(button);
    });
    document.getElementById('chat-back').disabled = this.navigation.length < 2;
  }
}
