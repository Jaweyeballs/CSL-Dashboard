import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { getCampus, normalizeCampusId } from './campuses.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataFile = path.join(root, 'data', 'manual-events.json');
const postersDir = path.join(root, 'public', 'uploads', 'posters');

function ensureDirs() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.mkdirSync(postersDir, { recursive: true });
}

function readAll() {
  ensureDirs();
  try {
    if (!fs.existsSync(dataFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(events) {
  ensureDirs();
  fs.writeFileSync(dataFile, JSON.stringify(events, null, 2));
}

function endOfEventDay(isoStart, isoEnd) {
  const basis = new Date(isoEnd || isoStart);
  const end = new Date(basis);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isEventActive(event, now = new Date()) {
  if (event.archived) return false;
  return endOfEventDay(event.start, event.end).getTime() >= now.getTime();
}

function resolveCampus(event) {
  if (event.campus) return normalizeCampusId(event.campus);
  // Back-compat for older saved events
  if (event.isLounge === false) return 'new-brunswick';
  return 'csl';
}

function toDashboardEvent(event) {
  const campusId = resolveCampus(event);
  const campus = getCampus(campusId);
  return {
    id: event.id,
    title: event.title,
    location: event.location || '',
    description: event.description || '',
    start: event.start,
    end: event.end,
    allDay: Boolean(event.allDay),
    campus: campusId,
    campusLabel: campus.badgeLabel,
    campusColor: campus.color,
    campusTextColor: campus.textColor,
    isLounge: campusId === 'csl',
    poster: event.poster || '',
    source: 'manual',
  };
}

function savePosterDataUrl(eventId, dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Poster must be an image file (PNG, JPG, WebP, etc.)');
  }

  const mime = match[1].toLowerCase();
  const ext =
    mime.includes('png') ? 'png' :
    mime.includes('webp') ? 'webp' :
    mime.includes('gif') ? 'gif' :
    'jpg';

  ensureDirs();
  const filename = `${eventId}.${ext}`;
  const filePath = path.join(postersDir, filename);
  fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
  return `/uploads/posters/${filename}`;
}

function deletePosterFile(posterUrl) {
  if (!posterUrl || !posterUrl.startsWith('/uploads/posters/')) return;
  const filePath = path.join(root, 'public', posterUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function buildStartEnd({ date, startTime, endTime, allDay }) {
  if (!date) throw new Error('Date is required');

  if (allDay) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59`);
    return { start: start.toISOString(), end: end.toISOString(), allDay: true };
  }

  if (!startTime) throw new Error('Start time is required');
  const start = new Date(`${date}T${startTime}:00`);
  // End time is optional — default to start when omitted
  const end = String(endTime || '').trim()
    ? new Date(`${date}T${String(endTime).trim()}:00`)
    : new Date(start.getTime());

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date or time');
  }

  return { start: start.toISOString(), end: end.toISOString(), allDay: false };
}

export function listManualEvents({ includeArchived = false } = {}) {
  const now = new Date();
  return readAll()
    .map((event) => {
      const active = isEventActive(event, now);
      return { ...event, active, archived: event.archived || !active };
    })
    .filter((event) => includeArchived || event.active)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function getActiveDashboardEvents() {
  return listManualEvents({ includeArchived: false }).map(toDashboardEvent);
}

export function createManualEvent(input) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Title is required');

  const id = randomUUID();
  const timing = buildStartEnd(input);
  const poster = input.posterDataUrl ? savePosterDataUrl(id, input.posterDataUrl) : '';

  const campus = normalizeCampusId(input.campus);
  const event = {
    id,
    title,
    location: String(input.location || '').trim(),
    description: String(input.description || '').trim(),
    ...timing,
    campus,
    isLounge: campus === 'csl',
    poster,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const all = readAll();
  all.push(event);
  writeAll(all);
  return event;
}

export function updateManualEvent(id, input) {
  const all = readAll();
  const index = all.findIndex((e) => e.id === id);
  if (index === -1) throw new Error('Event not found');

  const current = all[index];
  const timing = buildStartEnd({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    allDay: input.allDay,
  });

  let poster = current.poster || '';
  if (input.clearPoster) {
    deletePosterFile(poster);
    poster = '';
  } else if (input.posterDataUrl) {
    deletePosterFile(poster);
    poster = savePosterDataUrl(id, input.posterDataUrl);
  }

  const campus = normalizeCampusId(input.campus ?? current.campus);
  const updated = {
    ...current,
    title: String(input.title || current.title).trim(),
    location: String(input.location ?? current.location).trim(),
    description: String(input.description ?? current.description).trim(),
    ...timing,
    campus,
    isLounge: campus === 'csl',
    poster,
    // Editing replaces the event and can bring it back onto the TV if the day is still current/future
    archived: false,
    updatedAt: new Date().toISOString(),
  };

  all[index] = updated;
  writeAll(all);
  return updated;
}

export function archiveManualEvent(id) {
  const all = readAll();
  const index = all.findIndex((e) => e.id === id);
  if (index === -1) throw new Error('Event not found');
  all[index] = {
    ...all[index],
    archived: true,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[index];
}

export function deleteManualEvent(id) {
  const all = readAll();
  const event = all.find((e) => e.id === id);
  if (!event) throw new Error('Event not found');
  deletePosterFile(event.poster);
  writeAll(all.filter((e) => e.id !== id));
  return { ok: true };
}
