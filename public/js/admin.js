import { getCampus } from './campuses.js';

const statusList = document.getElementById('statusList');
const jamUrl = document.getElementById('jamUrl');
const jamNote = document.getElementById('jamNote');
const spotifyNote = document.getElementById('spotifyNote');
const eventNote = document.getElementById('eventNote');
const eventFormTitle = document.getElementById('eventFormTitle');
const saveEventBtn = document.getElementById('saveEvent');
const cancelEditBtn = document.getElementById('cancelEdit');
const qrPreview = document.getElementById('qrPreview');
const connectSpotify = document.getElementById('connectSpotify');
const posterDrop = document.getElementById('posterDrop');
const posterPreview = document.getElementById('posterPreview');
const posterDropCopy = document.getElementById('posterDropCopy');
const posterFile = document.getElementById('posterFile');
const eventAllDay = document.getElementById('eventAllDay');
const timeFields = document.getElementById('timeFields');
const adminEvents = document.getElementById('adminEvents');

let posterDataUrl = '';
let clearPoster = false;
let editingId = null;
let cachedEvents = [];

function passwordHeaders() {
  return {};
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showPosterPreview(src) {
  if (src) {
    posterPreview.src = src;
    posterPreview.hidden = false;
    posterDropCopy.hidden = true;
  } else {
    posterPreview.removeAttribute('src');
    posterPreview.hidden = true;
    posterDropCopy.hidden = false;
  }
}

function setNewPoster(dataUrl) {
  posterDataUrl = dataUrl || '';
  clearPoster = !posterDataUrl;
  showPosterPreview(posterDataUrl);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      reject(new Error('Poster image must be under 6MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function toLocalDateInput(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalTimeInput(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function resetEventForm() {
  editingId = null;
  posterDataUrl = '';
  clearPoster = false;
  posterFile.value = '';
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventLocation').value = '';
  document.getElementById('eventCampus').value = 'csl';
  eventAllDay.checked = false;
  timeFields.style.display = 'grid';
  document.getElementById('eventStartTime').value = '18:00';
  document.getElementById('eventEndTime').value = '';
  const today = new Date();
  document.getElementById('eventDate').value = toLocalDateInput(today.toISOString());
  showPosterPreview('');
  eventFormTitle.textContent = 'Add event / poster';
  saveEventBtn.textContent = 'Post to dashboard';
  cancelEditBtn.hidden = true;
}

function beginEdit(event) {
  editingId = event.id;
  posterDataUrl = '';
  clearPoster = false;
  posterFile.value = '';

  document.getElementById('eventTitle').value = event.title || '';
  document.getElementById('eventLocation').value = event.location || '';
  document.getElementById('eventDate').value = toLocalDateInput(event.start);
  document.getElementById('eventCampus').value = getCampus(event.campus).id;
  eventAllDay.checked = Boolean(event.allDay);
  timeFields.style.display = eventAllDay.checked ? 'none' : 'grid';
  document.getElementById('eventStartTime').value = event.allDay
    ? '18:00'
    : toLocalTimeInput(event.start);
  // Only prefill end when it differs from start (blank end was saved as start or omitted)
  if (event.allDay || !event.end) {
    document.getElementById('eventEndTime').value = '';
  } else {
    const startT = toLocalTimeInput(event.start);
    const endT = toLocalTimeInput(event.end);
    document.getElementById('eventEndTime').value = endT === startT ? '' : endT;
  }

  showPosterPreview(event.poster || '');

  eventFormTitle.textContent = 'Edit event / poster';
  saveEventBtn.textContent = 'Save changes';
  cancelEditBtn.hidden = false;
  eventNote.textContent = 'Editing — change any fields, then save to replace this event.';
  document.getElementById('eventFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function refreshStatus() {
  const status = await fetchJson('/api/status');
  const jam = await fetchJson('/api/jam');

  statusList.innerHTML = `
    <li>Spotify app configured: <strong>${status.spotifyConfigured ? 'yes' : 'no'}</strong></li>
    <li>Spotify connected: <strong>${status.spotifyConnected ? 'yes' : 'no'}</strong></li>
    <li>Calendar: <strong>${status.calendarSource}</strong></li>
    <li>Jam link: <strong>${jam.active ? 'active' : 'none'}</strong></li>
  `;

  jamUrl.value = jam.url || '';
  qrPreview.src = `/api/jam/qr.svg?t=${Date.now()}`;

  if (!status.spotifyConfigured) {
    spotifyNote.textContent = 'Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env, then restart the server.';
    connectSpotify.classList.add('ghost');
  } else if (!status.spotifyConnected) {
    spotifyNote.textContent = 'Ready — click Connect Spotify and approve access.';
    connectSpotify.classList.remove('ghost');
  } else {
    spotifyNote.textContent = 'Connected. Play a song on this Spotify account to test Now Playing.';
    connectSpotify.classList.remove('ghost');
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('spotify') === 'connected') {
    spotifyNote.textContent = 'Spotify connected successfully. Start playing a track now.';
  }
}

function formatWhen(event) {
  const start = new Date(event.start);
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (event.allDay) return `${day} · All day`;
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

async function refreshEvents() {
  const data = await fetchJson('/api/admin/events', { headers: passwordHeaders() });
  cachedEvents = data.events || [];
  if (!cachedEvents.length) {
    adminEvents.innerHTML = `<p class="help">No staff-posted events yet.</p>`;
    return;
  }

  adminEvents.innerHTML = cachedEvents
    .map((event) => {
      const active = event.active && !event.archived;
      const campus = getCampus(event.campus);
      const thumb = event.poster
        ? `<img src="${event.poster}" alt="" />`
        : `<div class="thumb-fallback" aria-hidden="true"></div>`;
      return `
        <article class="admin-event">
          ${thumb}
          <div>
            <strong>
              ${escapeHtml(event.title)}
              <span class="badge-mini" style="background:${campus.color};color:${campus.textColor}">${escapeHtml(campus.badgeLabel)}</span>
              ${active ? '' : '<span class="badge-mini">Archived</span>'}
            </strong>
            <div class="meta">${escapeHtml(formatWhen(event))}</div>
            <div class="meta">${escapeHtml(event.location || 'No location')}</div>
          </div>
          <div class="actions">
            <button class="btn ghost" data-edit="${event.id}" type="button">Edit</button>
            ${
              active
                ? `<button class="btn ghost" data-archive="${event.id}" type="button">Archive</button>`
                : ''
            }
            <button class="btn ghost" data-delete="${event.id}" type="button">Delete</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function collectEventPayload() {
  const title = document.getElementById('eventTitle').value.trim();
  const date = document.getElementById('eventDate').value;
  if (!title || !date) throw new Error('Title and day are required');

  return {
    title,
    location: document.getElementById('eventLocation').value.trim(),
    date,
    startTime: document.getElementById('eventStartTime').value,
    endTime: document.getElementById('eventEndTime').value.trim(),
    allDay: eventAllDay.checked,
    campus: document.getElementById('eventCampus').value,
    posterDataUrl: posterDataUrl || undefined,
    clearPoster: Boolean(clearPoster && !posterDataUrl),
  };
}

document.getElementById('saveJam').addEventListener('click', async () => {
  try {
    await fetchJson('/api/jam', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...passwordHeaders(),
      },
      body: JSON.stringify({
        url: jamUrl.value.trim(),
      }),
    });
    jamNote.textContent = 'Jam link saved. Dashboard QR will update within a few seconds.';
    await refreshStatus();
  } catch (err) {
    jamNote.textContent = err.message;
  }
});

document.getElementById('clearJam').addEventListener('click', async () => {
  try {
    await fetchJson('/api/jam', {
      method: 'DELETE',
      headers: passwordHeaders(),
    });
    jamUrl.value = '';
    jamNote.textContent = 'Jam display cleared — TV QR will disappear shortly.';
    await refreshStatus();
  } catch (err) {
    jamNote.textContent = err.message;
  }
});

document.getElementById('disconnectSpotify').addEventListener('click', async () => {
  try {
    await fetchJson('/api/spotify/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...passwordHeaders(),
      },
      body: JSON.stringify({}),
    });
    spotifyNote.textContent =
      'Current Spotify session cleared (and Jam QR). Next person can Connect when ready.';
    await refreshStatus();
  } catch (err) {
    spotifyNote.textContent = err.message;
  }
});

document.getElementById('choosePoster').addEventListener('click', () => posterFile.click());
posterDrop.addEventListener('click', () => posterFile.click());

posterFile.addEventListener('change', async () => {
  try {
    const file = posterFile.files?.[0];
    if (!file) return;
    setNewPoster(await readImageFile(file));
    eventNote.textContent = 'Poster image ready.';
  } catch (err) {
    eventNote.textContent = err.message;
  }
});

document.getElementById('clearPoster').addEventListener('click', () => {
  posterFile.value = '';
  setNewPoster('');
  eventNote.textContent = 'Poster cleared — gradient will be used.';
});

;['dragenter', 'dragover'].forEach((type) => {
  posterDrop.addEventListener(type, (event) => {
    event.preventDefault();
    posterDrop.classList.add('dragover');
  });
});

;['dragleave', 'drop'].forEach((type) => {
  posterDrop.addEventListener(type, (event) => {
    event.preventDefault();
    posterDrop.classList.remove('dragover');
  });
});

posterDrop.addEventListener('drop', async (event) => {
  try {
    const file = event.dataTransfer?.files?.[0];
    setNewPoster(await readImageFile(file));
    eventNote.textContent = 'Poster image ready.';
  } catch (err) {
    eventNote.textContent = err.message;
  }
});

window.addEventListener('paste', async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith('image/'));
  if (!imageItem) return;
  try {
    const file = imageItem.getAsFile();
    setNewPoster(await readImageFile(file));
    eventNote.textContent = 'Poster pasted.';
  } catch (err) {
    eventNote.textContent = err.message;
  }
});

eventAllDay.addEventListener('change', () => {
  timeFields.style.display = eventAllDay.checked ? 'none' : 'grid';
});

cancelEditBtn.addEventListener('click', () => {
  resetEventForm();
  eventNote.textContent = 'Edit cancelled.';
});

saveEventBtn.addEventListener('click', async () => {
  try {
    const payload = collectEventPayload();

    if (editingId) {
      await fetchJson(`/api/admin/events/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...passwordHeaders(),
        },
        body: JSON.stringify(payload),
      });
      eventNote.textContent = 'Event updated — dashboard will refresh shortly.';
    } else {
      await fetchJson('/api/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...passwordHeaders(),
        },
        body: JSON.stringify(payload),
      });
      eventNote.textContent = 'Posted! Check the dashboard — it should show within a few seconds.';
    }

    resetEventForm();
    await refreshEvents();
  } catch (err) {
    eventNote.textContent = err.message;
  }
});

adminEvents.addEventListener('click', async (event) => {
  const editId = event.target.getAttribute?.('data-edit');
  const archiveId = event.target.getAttribute?.('data-archive');
  const deleteId = event.target.getAttribute?.('data-delete');
  try {
    if (editId) {
      const found = cachedEvents.find((e) => e.id === editId);
      if (!found) throw new Error('Event not found');
      beginEdit(found);
      return;
    }
    if (archiveId) {
      await fetchJson(`/api/admin/events/${archiveId}/archive`, {
        method: 'POST',
        headers: passwordHeaders(),
      });
      eventNote.textContent = 'Event archived.';
      if (editingId === archiveId) resetEventForm();
      await refreshEvents();
    }
    if (deleteId) {
      await fetchJson(`/api/admin/events/${deleteId}`, {
        method: 'DELETE',
        headers: passwordHeaders(),
      });
      eventNote.textContent = 'Event deleted.';
      if (editingId === deleteId) resetEventForm();
      await refreshEvents();
    }
  } catch (err) {
    eventNote.textContent = err.message;
  }
});

resetEventForm();

refreshStatus().catch((err) => {
  statusList.innerHTML = `<li>${err.message}</li>`;
});
refreshEvents().catch((err) => {
  adminEvents.innerHTML = `<p class="help">${err.message}</p>`;
});
