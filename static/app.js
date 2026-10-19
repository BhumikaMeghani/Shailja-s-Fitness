/* Shared HTTP state; authentication lives exclusively in an HttpOnly server session. */
window.Studio = {
  data: null,
  async api(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': this.data?.csrf || ''},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  },
  async load() {
    this.data = await this.api('/api/bootstrap');
    return this.data;
  },
  toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  const toggle = document.getElementById('menu-toggle');
  const links = document.querySelector('.nav-links');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    toggle.textContent = open ? '×' : '☰';
  });
  links.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.textContent = '☰';
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && links.classList.contains('open')) toggle.click();
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.hash === '#' + entry.target.id));
      }
    });
  }, {rootMargin: '-20% 0px -55% 0px'});
  links.querySelectorAll('a').forEach(a => {
    const section = document.querySelector(a.hash);
    if (section) observer.observe(section);
  });
  window.booking = new Booking();
  window.chat = new WellnessChat();
  document.querySelectorAll('[data-book]').forEach(button => button.addEventListener('click', () => booking.open()));
  document.querySelectorAll('[data-program]').forEach(button => button.addEventListener('click', () => {
    chat.open();
    chat.navigate('programInfo', button.dataset.program);
  }));
  document.getElementById('contact-chat').addEventListener('click', () => {
    chat.open();
    chat.navigate('contact');
  });
  try {
    const data = await Studio.load();
    document.getElementById('environment-notice').hidden = !data.development;
    document.getElementById('testimonial-placeholder').hidden = !data.development;
    const contact = document.getElementById('contact-details');
    if (Object.values(data.contact).some(Boolean)) {
      contact.replaceChildren();
      for (const [key, value] of Object.entries(data.contact)) {
        if (!value) continue;
        const p = document.createElement('p');
        if (key === 'email' || key === 'phone') {
          const a = document.createElement('a');
          a.href = (key === 'email' ? 'mailto:' : 'tel:') + value;
          a.textContent = value;
          p.append(a);
        } else p.textContent = value;
        contact.append(p);
      }
    }
  } catch (_error) {
    Studio.toast('Booking data could not load. The page is still available; try booking again to reconnect.');
  }
});
