/* global window, document, requestAnimationFrame, getComputedStyle */
// Secret Santa page. Talks only to this site's own /api routes; every piece of
// text from the server is written with textContent, never as HTML.
(function () {
  'use strict';

  const DEMO = window.SANTA_DEMO === true;
  const MAX_NOTE = 300;
  const STEP_DELAY_MS = 750;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = id => document.getElementById(id);
  const VIEWS = ['view-loading', 'view-signin', 'view-notlisted', 'view-error', 'view-main'];
  const TRACK_STATES = ['track-locked', 'track-neednote', 'track-ready', 'track-progress', 'track-label'];

  let state = null;
  let countdownTimer = null;

  // ---------- API ----------

  async function call(method, path, body) {
    const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(path, options);
    let data = {};
    try { data = await res.json(); } catch (_err) { data = {}; }
    return { status: res.status, data };
  }

  const realApi = {
    async whoAmI() {
      const res = await call('GET', '/.auth/me');
      return res.data && res.data.clientPrincipal ? res.data.clientPrincipal : null;
    },
    me: () => call('GET', '/api/me'),
    saveNote: text => call('PUT', '/api/wishlist', { wishlist: text }),
    reveal: () => call('GET', '/api/reveal'),
  };

  const api = DEMO ? createDemoApi() : realApi;

  // ---------- Helpers ----------

  function show(id) {
    VIEWS.forEach(v => { $(v).hidden = v !== id; });
  }

  function showTrack(id) {
    TRACK_STATES.forEach(t => { $(t).hidden = t !== id; });
  }

  function formatDay(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  }

  function clock(date) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function showError(message) {
    if (message) $('error-text').textContent = message;
    show('view-error');
  }

  // ---------- Start ----------

  async function boot() {
    show('view-loading');
    $('who').hidden = true;
    try {
      const principal = await api.whoAmI();
      if (!principal) { show('view-signin'); return; }
      const res = await api.me();
      if (res.status === 401) { show('view-signin'); return; }
      if (res.status === 403 && res.data.error === 'not_participant') {
        $('notlisted-email').textContent = res.data.email || '';
        show('view-notlisted');
        return;
      }
      if (res.status === 500 && res.data.error === 'setup') {
        showError('The Blaiklock depot isn\'t set up yet. Let the organiser know they need to finish the settings.');
        return;
      }
      if (res.status !== 200) { showError(); return; }
      state = res.data;
      renderMain();
    } catch (_err) {
      showError('We couldn\'t reach the depot. Check your connection and refresh the page.');
    }
  }

  function renderMain() {
    const ev = state.event;
    $('event-name').textContent = ev.name;
    $('who-name').textContent = state.name;
    $('who').hidden = false;
    $('first-name').textContent = state.firstName;
    $('fact-date').textContent = formatDay(ev.exchangeDate);
    $('fact-spend').textContent = ev.minSpend;
    $('fact-count').textContent = `${ev.participantCount} people`;
    $('note').value = state.wishlist;
    updateCounter();
    show('view-main');
    renderTrack();
  }

  function renderTrack() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    const ev = state.event;
    if (!ev.revealOpen) {
      $('locked-date').textContent = formatDateTime(ev.revealOpensAt);
      tickCountdown();
      countdownTimer = setInterval(tickCountdown, 30000);
      showTrack('track-locked');
    } else if (!state.wishlist) {
      showTrack('track-neednote');
    } else {
      showTrack('track-ready');
    }
  }

  function tickCountdown() {
    const ms = new Date(state.event.revealOpensAt).getTime() - Date.now();
    if (ms <= 0) { boot(); return; }
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    $('locked-countdown').textContent = days > 0
      ? `${days} day${days === 1 ? '' : 's'} ${hours} hr${hours === 1 ? '' : 's'} to go`
      : `${hours} hr${hours === 1 ? '' : 's'} ${mins} min to go`;
  }

  // ---------- Step 1: the note ----------

  function updateCounter() {
    $('note-count').textContent = `${$('note').value.length} / ${MAX_NOTE}`;
  }

  function setStatus(text, kind) {
    const el = $('note-status');
    el.textContent = text;
    el.className = `status ${kind || ''}`;
  }

  async function saveNote(event) {
    event.preventDefault();
    const text = $('note').value.trim();
    if (!text) { setStatus('Write a sentence first, then save.', 'bad'); return; }
    if (text.length > MAX_NOTE) { setStatus(`Keep it under ${MAX_NOTE} characters.`, 'bad'); return; }
    const button = $('note-save');
    button.disabled = true;
    setStatus('Saving…');
    try {
      const res = await api.saveNote(text);
      if (res.status !== 200) {
        setStatus(res.data.error === 'invalid_wishlist' ? `Keep it under ${MAX_NOTE} characters.` : 'That didn\'t save. Try again in a moment.', 'bad');
        return;
      }
      const hadNote = Boolean(state.wishlist);
      state.wishlist = res.data.wishlist;
      $('note').value = state.wishlist;
      updateCounter();
      setStatus('Saved. Your Secret Santa will see this note.', 'ok');
      if (!hadNote && $('track-label').hidden && $('track-progress').hidden) renderTrack();
    } catch (_err) {
      setStatus('That didn\'t save. Check your connection and try again.', 'bad');
    } finally {
      button.disabled = false;
    }
  }

  // ---------- Step 2: tracking and the reveal ----------

  async function track() {
    const button = $('track-btn');
    button.disabled = true;
    try {
      const res = await api.reveal();
      if (res.status === 409) { state.wishlist = ''; renderTrack(); return; }
      if (res.status === 403 && res.data.error === 'not_yet') {
        state.event.revealOpen = false;
        state.event.revealOpensAt = res.data.revealOpensAt;
        renderTrack();
        return;
      }
      if (res.status !== 200) { showError(); return; }
      await playTracking();
      showLabel(res.data);
    } catch (_err) {
      showError('We couldn\'t reach the depot. Check your connection and refresh the page.');
    } finally {
      button.disabled = false;
    }
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, reducedMotion ? 0 : ms));
  }

  async function playTracking() {
    const list = $('timeline');
    list.textContent = '';
    const van = $('van');
    van.style.left = '0px';
    showTrack('track-progress');
    const now = new Date();
    const minutesAgo = m => clock(new Date(now.getTime() - m * 60000));
    const steps = [
      [minutesAgo(214), 'Collected from the Blaiklock North Pole depot'],
      [minutesAgo(131), 'Sorted by elf no. 0428 in the Blaiklock warehouse'],
      [minutesAgo(47), 'Loaded onto the Blaiklock sleigh'],
      ['Now', 'Out for delivery'],
    ];
    requestAnimationFrame(() => {
      const road = van.parentElement.clientWidth;
      van.style.left = `${Math.max(0, road - van.clientWidth)}px`;
    });
    for (const [time, text] of steps) {
      const li = document.createElement('li');
      const t = document.createElement('time');
      const s = document.createElement('span');
      t.textContent = time;
      s.textContent = text;
      li.append(t, s);
      list.append(li);
      await wait(STEP_DELAY_MS);
    }
    await wait(300);
  }

  function showLabel(data) {
    $('label-track').textContent = data.trackingNumber;
    $('label-name').textContent = data.giftee.name;
    const note = $('label-note');
    if (data.giftee.wishlist) {
      note.textContent = `“${data.giftee.wishlist}”`;
      note.className = '';
    } else {
      note.textContent = `${data.giftee.firstName} hasn't written their note yet. Check back later, it'll appear here.`;
      note.className = 'empty';
    }
    $('label-date').textContent = formatDay(data.event.exchangeDate);
    $('label-spend').textContent = data.event.minSpend;
    drawBarcode(data.trackingNumber);
    $('label').classList.add('sealed');
    $('peel').classList.remove('peeled');
    $('peel').hidden = false;
    $('label-after').hidden = true;
    showTrack('track-label');
    $('peel').focus();
  }

  function peel() {
    const sticker = $('peel');
    sticker.classList.add('peeled');
    $('label').classList.remove('sealed');
    $('label-after').hidden = false;
    setTimeout(() => { sticker.hidden = true; }, reducedMotion ? 0 : 700);
    confetti();
  }

  function drawBarcode(code) {
    const svg = $('barcode');
    svg.textContent = '';
    const ns = 'http://www.w3.org/2000/svg';
    const bits = [];
    for (const ch of code) {
      const n = ch.charCodeAt(0);
      for (let i = 0; i < 7; i += 1) bits.push((n >> i) & 1);
    }
    const total = bits.reduce((sum, b) => sum + (b ? 3 : 2), 0) + bits.length;
    let x = 0;
    bits.forEach((b, i) => {
      const w = ((b ? 3 : 2) / total) * 300;
      if (i % 2 === 0) {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', x.toFixed(2));
        rect.setAttribute('y', '0');
        rect.setAttribute('width', w.toFixed(2));
        rect.setAttribute('height', '48');
        svg.append(rect);
      }
      x += w + (1 / total) * 300;
    });
  }

  function confetti() {
    if (reducedMotion) return;
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    ctx.scale(ratio, ratio);
    const css = getComputedStyle(document.documentElement);
    const colours = ['--red', '--green', '--paper', '--label-accent'].map(v => css.getPropertyValue(v).trim());
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.6,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
      spin: Math.random() * Math.PI,
      vs: -0.15 + Math.random() * 0.3,
      colour: colours[Math.floor(Math.random() * colours.length)],
    }));
    const end = Date.now() + 3200;
    (function frame() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      bits.forEach(b => {
        b.x += b.vx; b.y += b.vy; b.spin += b.vs;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);
        ctx.fillStyle = b.colour;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.spin)));
        ctx.restore();
      });
      if (Date.now() < end) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }());
  }

  // ---------- Demo mode (sample data, no sign-in) ----------

  function createDemoApi() {
    const sample = {
      me: { name: 'Alex Morgan', email: 'alex.morgan@example.com' },
      giftee: { name: 'Priya Shah', wishlist: 'I\'m a big tea drinker and love anything for the garden. Please no candles!' },
    };
    const demo = { signedIn: false, note: '', locked: false };
    const event = () => ({
      name: 'Secret Santa 2026',
      exchangeDate: '2026-12-24',
      minSpend: '£20',
      participantCount: 28,
      revealOpen: !demo.locked,
      revealOpensAt: demo.locked ? new Date(Date.now() + 9 * 86400000 + 5 * 3600000).toISOString() : null,
    });
    const ok = data => Promise.resolve({ status: 200, data });

    $('demo-bar').hidden = false;
    $('sign-in').addEventListener('click', e => { e.preventDefault(); demo.signedIn = true; boot(); });
    $('sign-out').addEventListener('click', e => { e.preventDefault(); demo.signedIn = false; boot(); });
    $('demo-restart').addEventListener('click', () => { demo.signedIn = false; demo.note = ''; demo.locked = false; setStatus(''); boot(); });
    $('demo-locked').addEventListener('click', () => { demo.signedIn = true; demo.locked = true; boot(); });

    return {
      whoAmI: () => Promise.resolve(demo.signedIn ? { userDetails: sample.me.email } : null),
      me: () => ok({ name: sample.me.name, firstName: 'Alex', email: sample.me.email, wishlist: demo.note, event: event() }),
      saveNote: text => { demo.note = text; return ok({ wishlist: text }); },
      reveal: () => {
        if (demo.locked) return Promise.resolve({ status: 403, data: { error: 'not_yet', revealOpensAt: event().revealOpensAt } });
        if (!demo.note) return Promise.resolve({ status: 409, data: { error: 'wishlist_first' } });
        return ok({
          trackingNumber: 'BLK-7F3A-19C2',
          giftee: { name: sample.giftee.name, firstName: 'Priya', wishlist: sample.giftee.wishlist },
          event: event(),
        });
      },
    };
  }

  // ---------- Branding ----------

  // Shows the Blaiklock logo if brand/logo.png has been added to the site,
  // otherwise keeps the text mark.
  function loadLogo() {
    const src = window.SANTA_LOGO || 'brand/logo.png';
    const probe = new window.Image();
    probe.onload = () => {
      $('brand-logo').src = src;
      $('brand-logo').hidden = false;
      $('brand-mark').hidden = true;
    };
    probe.src = src;
  }

  // ---------- Wire up ----------

  $('note').addEventListener('input', updateCounter);
  $('note-form').addEventListener('submit', saveNote);
  $('track-btn').addEventListener('click', track);
  $('peel').addEventListener('click', peel);
  loadLogo();
  boot();
}());
