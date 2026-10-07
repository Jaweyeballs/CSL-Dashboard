const REFRESH = {
  eventsMs: 60_000,
  nowPlayingMs: 3_000,
  jamMs: 5_000,
  clockMs: 1_000,
  posterMs: 8_000,
  fullReloadMs: 60 * 60 * 1000,
};

const POSTER_PALETTES = [
  'linear-gradient(145deg, #12353a 0%, #1f6f78 45%, #7ab8ff 100%)',
  'linear-gradient(145deg, #3a2412 0%, #a8642a 48%, #ffb454 100%)',
  'linear-gradient(145deg, #1a2038 0%, #3d4f9a 50%, #9bb7ff 100%)',
  'linear-gradient(145deg, #2a1230 0%, #6d3a7a 48%, #d6a4ff 100%)',
  'linear-gradient(145deg, #10261c 0%, #2f7a58 50%, #7dffc2 100%)',
];

const els = {
  clockTime: document.getElementById('clockTime'),
  clockDate: document.getElementById('clockDate'),
  eventsList: document.getElementById('eventsList'),
  posterStage: document.getElementById('posterStage'),
  posterDots: document.getElementById('posterDots'),
  artA: document.getElementById('artA'),
  artB: document.getElementById('artB'),
  trackTitle: document.getElementById('trackTitle'),
  trackArtist: document.getElementById('trackArtist'),
  trackAlbum: document.getElementById('trackAlbum'),
  progressFill: document.getElementById('progressFill'),
  progressCurrent: document.getElementById('progressCurrent'),
  progressDuration: document.getElementById('progressDuration'),
  jamPanel: document.getElementById('jamPanel'),
  musicPanel: document.getElementById('musicPanel'),
  jamQr: document.getElementById('jamQr'),
  tickerContent: document.getElementById('tickerContent'),
  ambient: document.getElementById('ambient'),
};

const IDLE_ART = '/img/csl-logo.png';
let lastArtUrl = IDLE_ART;
let artFrontIsA = true;
let artFadeToken = 0;
let progressState = { progressMs: 0, durationMs: 0, isPlaying: false, updatedAt: 0 };
let posterIndex = 0;
let posterTimer = null;
let posterEvents = [];
let eventsScrollRaf = null;
let eventsScrollTimer = null;
let eventsScrollOffset = 0;

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatClock(date) {
  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes}:${seconds} ${ampm}`;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad(s)}`;
}

function formatEventWhen(iso, allDay) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (allDay) return { day, time: 'All day' };
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { day, time };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return res.json();
}

function updateClock() {
  const now = new Date();
  els.clockTime.textContent = formatClock(now);
  els.clockDate.textContent = formatDate(now);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function posterBackground(event, index) {
  if (event.poster) {
    return `center / cover no-repeat url("${event.poster}"), ${POSTER_PALETTES[index % POSTER_PALETTES.length]}`;
  }
  return POSTER_PALETTES[index % POSTER_PALETTES.length];
}

function showPoster(index) {
  const slides = els.posterStage.querySelectorAll('.poster-slide');
  const dots = els.posterDots.querySelectorAll('span');
  if (!slides.length) return;
  posterIndex = ((index % slides.length) + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle('active', i === posterIndex));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === posterIndex));
}

function startPosterRotation() {
  if (posterTimer) clearInterval(posterTimer);
  if (posterEvents.length <= 1) return;
  posterTimer = setInterval(() => showPoster(posterIndex + 1), REFRESH.posterMs);
}

function renderPosters(events) {
  posterEvents = events.slice(0, 8);

  if (!posterEvents.length) {
    els.posterStage.innerHTML = `<div class="empty-state">No upcoming event posters yet.</div>`;
    els.posterDots.innerHTML = '';
    if (posterTimer) clearInterval(posterTimer);
    return;
  }

  els.posterStage.innerHTML = posterEvents
    .map((event, index) => {
      const when = formatEventWhen(event.start, event.allDay);
      return `
        <div class="poster-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
          <article class="poster-card" style="background: ${posterBackground(event, index)}">
            <div class="poster-visual">
              <span class="poster-kicker" style="background:${escapeHtml(event.campusColor || '#CC0033')};color:${escapeHtml(event.campusTextColor || '#fff')}">
                ${escapeHtml(event.campusLabel || 'CSL')}
              </span>
            </div>
            <div class="poster-copy">
              <div class="poster-title">${escapeHtml(event.title)}</div>
              <div class="poster-meta">${escapeHtml(when.day)} · ${escapeHtml(when.time)}</div>
              ${event.location ? `<div class="poster-location">${escapeHtml(event.location)}</div>` : ''}
            </div>
          </article>
        </div>
      `;
    })
    .join('');

  els.posterDots.innerHTML = posterEvents
    .map((_, index) => `<span class="${index === 0 ? 'active' : ''}"></span>`)
    .join('');

  posterIndex = 0;
  startPosterRotation();
}

function stopEventsScroll() {
  if (eventsScrollRaf) {
    cancelAnimationFrame(eventsScrollRaf);
    eventsScrollRaf = null;
  }
  if (eventsScrollTimer) {
    clearTimeout(eventsScrollTimer);
    eventsScrollTimer = null;
  }
  eventsScrollOffset = 0;
}

function eventCardHtml(event, index = 0) {
  const when = formatEventWhen(event.start, event.allDay);
  const badge = event.campusLabel
    ? `<span class="badge" style="background:${escapeHtml(event.campusColor || '#CC0033')};color:${escapeHtml(event.campusTextColor || '#fff')}">${escapeHtml(event.campusLabel)}</span>`
    : '';
  return `
    <article class="event-card ${event.campus === 'csl' ? 'lounge' : ''}" style="animation-delay:${index * 40}ms">
      <div class="event-when">
        <div class="event-day">${when.day}</div>
        <div class="event-time">${when.time}</div>
      </div>
      <div class="event-body">
        <div class="event-title-row">
          <div class="event-title">${escapeHtml(event.title)}</div>
          ${badge}
        </div>
        ${event.location ? `<div class="event-location">${escapeHtml(event.location)}</div>` : ''}
      </div>
    </article>
  `;
}

function startEventsScroll() {
  stopEventsScroll();
  const track = els.eventsList.querySelector('.events-scroll');
  if (!track) return;

  // Wait a frame so layout settles, then scroll only if content overflows.
  requestAnimationFrame(() => {
    const maxOffset = Math.max(0, track.scrollHeight - els.eventsList.clientHeight);
    if (maxOffset <= 12) {
      track.style.transform = '';
      track.style.opacity = '';
      track.style.transition = '';
      return;
    }

    const speed = 0.22; // px per frame ≈ slow TV crawl
    const fadeMs = 700;
    const holdMs = 1800;

    const setOffset = (y) => {
      eventsScrollOffset = y;
      track.style.transform = `translateY(${-y}px)`;
    };

    track.style.transition = '';
    track.style.opacity = '1';
    setOffset(0);

    const scrollDown = () => {
      const tick = () => {
        eventsScrollOffset += speed;
        if (eventsScrollOffset >= maxOffset) {
          setOffset(maxOffset);
          eventsScrollRaf = null;
          // Hold on the last items, then crossfade back to the top.
          eventsScrollTimer = setTimeout(crossfadeToTop, holdMs);
          return;
        }
        setOffset(eventsScrollOffset);
        eventsScrollRaf = requestAnimationFrame(tick);
      };
      eventsScrollRaf = requestAnimationFrame(tick);
    };

    const crossfadeToTop = () => {
      track.style.transition = `opacity ${fadeMs}ms ease`;
      track.style.opacity = '0';
      eventsScrollTimer = setTimeout(() => {
        setOffset(0);
        requestAnimationFrame(() => {
          track.style.opacity = '1';
          eventsScrollTimer = setTimeout(() => {
            track.style.transition = '';
            // Brief beat at the top, then scroll through again.
            eventsScrollTimer = setTimeout(scrollDown, holdMs);
          }, fadeMs);
        });
      }, fadeMs);
    };

    eventsScrollTimer = setTimeout(scrollDown, holdMs);
  });
}

function renderEventsList(events) {
  stopEventsScroll();

  if (!events.length) {
    els.eventsList.innerHTML = `<div class="empty-state">No upcoming events in the next few weeks.</div>`;
    return;
  }

  const visible = events.slice(0, 16);
  els.eventsList.innerHTML = `
    <div class="events-scroll">
      ${visible.map((event, index) => eventCardHtml(event, index)).join('')}
    </div>
  `;
  startEventsScroll();
}

function tickerItemHtml({ when, title, campus }) {
  return `
    <span class="ticker-item">
      <span class="ticker-when">${escapeHtml(when)}</span>
      <span class="ticker-title">${escapeHtml(title)}</span>
      ${campus ? `<span class="ticker-campus">${escapeHtml(campus)}</span>` : ''}
    </span>
  `;
}

function renderTicker(events) {
  const items = [
    {
      when: 'Welcome',
      title: 'Coding & Social Lounge',
      campus: '',
    },
    ...events.slice(0, 8).map((e) => {
      const when = formatEventWhen(e.start, e.allDay);
      return {
        when: `${when.day} · ${when.time}`,
        title: e.title,
        campus: e.campusLabel || '',
      };
    }),
  ];

  const sequence = items
    .map((item) => tickerItemHtml(item))
    .join('<span class="ticker-sep" aria-hidden="true"></span>');

  // Duplicate the sequence so translateX(-50%) loops with no jump.
  els.tickerContent.innerHTML = `
    <div class="ticker-seq">${sequence}</div>
    <div class="ticker-seq" aria-hidden="true">${sequence}</div>
  `;

  // Pace the crawl by content width (~42px/sec) for a smooth, steady loop.
  requestAnimationFrame(() => {
    const width = els.tickerContent.scrollWidth / 2;
    const seconds = Math.max(28, Math.round(width / 42));
    els.tickerContent.style.setProperty('--ticker-duration', `${seconds}s`);
  });
}

function renderEvents(payload) {
  const events = payload.events || [];
  renderPosters(events);
  renderEventsList(events);
  renderTicker(events);
}

function setAlbumArt(url) {
  const src = url || IDLE_ART;
  const isIdle = !url;

  if (src === lastArtUrl) return;
  lastArtUrl = src;

  const token = ++artFadeToken;
  const front = artFrontIsA ? els.artA : els.artB;
  const back = artFrontIsA ? els.artB : els.artA;

  let revealed = false;
  const reveal = () => {
    if (revealed || token !== artFadeToken) return;
    revealed = true;

    back.classList.toggle('is-idle', isIdle);
    back.alt = isIdle ? 'Coding & Social Lounge' : '';
    back.setAttribute('aria-hidden', isIdle ? 'false' : 'true');
    front.setAttribute('aria-hidden', 'true');
    if (!isIdle) front.alt = '';

    // Next frame so the browser paints the loaded back image at opacity 0 first
    requestAnimationFrame(() => {
      if (token !== artFadeToken) return;
      back.classList.add('is-front');
      front.classList.remove('is-front');
      artFrontIsA = !artFrontIsA;
      if (!isIdle) extractDominantColor(back);
    });
  };

  back.onload = reveal;
  back.onerror = () => {
    if (token !== artFadeToken) return;
    if (src !== IDLE_ART) {
      lastArtUrl = '';
      setAlbumArt('');
      return;
    }
    reveal();
  };

  back.classList.toggle('is-idle', isIdle);
  if (back.getAttribute('src') === src && back.complete && back.naturalWidth) {
    reveal();
    return;
  }
  back.src = src;
  if (back.complete && back.naturalWidth) reveal();
}

function extractDominantColor(img) {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = 24;
    const h = 24;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const rr = data[i];
      const gg = data[i + 1];
      const bb = data[i + 2];
      const brightness = (rr + gg + bb) / 3;
      if (brightness < 25 || brightness > 230) continue;
      r += rr;
      g += gg;
      b += bb;
      count += 1;
    }
    if (!count) return;
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    els.ambient.style.background = `
      radial-gradient(ellipse 65% 50% at 80% 35%, rgba(${r}, ${g}, ${b}, 0.42), transparent 55%),
      radial-gradient(ellipse 55% 45% at 15% 20%, rgba(61, 214, 198, 0.12), transparent 55%),
      linear-gradient(160deg, #05080c 0%, #0b1219 45%, #081018 100%)
    `;
  } catch {
    // ignore tainted canvas
  }
}

function setPlayingVisible(visible) {
  const next = visible ? 'true' : 'false';
  if (els.musicPanel.dataset.playing === next) return;
  // Next frame so the fade CSS transition can run from the current state
  requestAnimationFrame(() => {
    els.musicPanel.dataset.playing = next;
  });
}

function renderNowPlaying(payload) {
  const track = payload.track;
  if (!track) {
    els.trackTitle.textContent = 'Nothing!';
    els.trackArtist.textContent = '';
    els.trackAlbum.textContent = '';
    setAlbumArt('');
    progressState = { progressMs: 0, durationMs: 0, isPlaying: false, updatedAt: Date.now() };
    paintProgress();
    setPlayingVisible(false);
    return;
  }

  els.trackTitle.textContent = track.name;
  els.trackArtist.textContent = (track.artists || []).join(', ');
  els.trackAlbum.textContent = track.album || '';
  setAlbumArt(track.albumArt || '');
  progressState = {
    progressMs: track.progressMs || 0,
    durationMs: track.durationMs || 0,
    isPlaying: Boolean(payload.isPlaying),
    updatedAt: Date.now(),
  };
  paintProgress();
  setPlayingVisible(true);
}

function paintProgress() {
  let progress = progressState.progressMs;
  if (progressState.isPlaying) {
    progress += Date.now() - progressState.updatedAt;
  }
  progress = Math.min(progress, progressState.durationMs || progress);
  const pct = progressState.durationMs
    ? Math.min(100, (progress / progressState.durationMs) * 100)
    : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressCurrent.textContent = formatMs(progress);
  els.progressDuration.textContent = formatMs(progressState.durationMs || 0);
}

let jamHideTimer = null;

function renderJam(payload) {
  const active = Boolean(payload.active && String(payload.url || '').trim());
  const wasActive = els.musicPanel.dataset.jam === 'true';

  if (jamHideTimer) {
    clearTimeout(jamHideTimer);
    jamHideTimer = null;
  }

  if (active) {
    els.jamPanel.hidden = false;
    if (!wasActive || !els.jamQr.getAttribute('src')) {
      els.jamQr.src = `/api/jam/qr.svg?t=${Date.now()}`;
    }
    // Next frame so the fade/slide CSS transition can run
    requestAnimationFrame(() => {
      els.musicPanel.dataset.jam = 'true';
    });
    return;
  }

  // Fade QR out + slide text/bar right, then fully hide
  els.musicPanel.dataset.jam = 'false';
  if (wasActive) {
    jamHideTimer = setTimeout(() => {
      if (els.musicPanel.dataset.jam === 'false') {
        els.jamPanel.hidden = true;
        els.jamQr.removeAttribute('src');
      }
      jamHideTimer = null;
    }, 620);
  } else {
    els.jamPanel.hidden = true;
    els.jamQr.removeAttribute('src');
  }
}

async function refreshEvents() {
  try {
    renderEvents(await fetchJson('/api/events'));
  } catch (err) {
    els.eventsList.innerHTML = `<div class="empty-state">Could not load events: ${escapeHtml(err.message)}</div>`;
    els.posterStage.innerHTML = `<div class="empty-state">Could not load posters.</div>`;
  }
}

async function refreshNowPlaying() {
  try {
    renderNowPlaying(await fetchJson('/api/now-playing'));
  } catch {
    // keep previous track state
  }
}

async function refreshJam() {
  try {
    renderJam(await fetchJson('/api/jam'));
  } catch {
    // keep previous jam state
  }
}

function start() {
  updateClock();
  refreshEvents();
  refreshNowPlaying();
  refreshJam();

  setInterval(updateClock, REFRESH.clockMs);
  setInterval(paintProgress, 500);
  setInterval(refreshEvents, REFRESH.eventsMs);
  setInterval(refreshNowPlaying, REFRESH.nowPlayingMs);
  setInterval(refreshJam, REFRESH.jamMs);
  setInterval(() => window.location.reload(), REFRESH.fullReloadMs);
}

start();
