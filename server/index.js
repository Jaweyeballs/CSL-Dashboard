import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCalendarService } from './calendar.js';
import { createSpotifyService } from './spotify.js';
import { CAMPUSES } from './campuses.js';
import {
  archiveManualEvent,
  createManualEvent,
  deleteManualEvent,
  getActiveDashboardEvents,
  listManualEvents,
  updateManualEvent,
} from './events.js';
import { getJamStatus } from './jam.js';
import { getJam, saveJam } from './store.js';
import { qrSvg } from './qr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const env = process.env;
const port = Number(env.PORT || 3000);

const app = express();
const calendar = createCalendarService(env);
const spotify = createSpotifyService(env);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

function adminAuthorized(req) {
  if (!env.ADMIN_PASSWORD) return true;
  const header = req.headers['x-admin-password'];
  const query = req.query.password;
  const body = req.body?.password;
  return [header, query, body].includes(env.ADMIN_PASSWORD);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'csl-dashboard',
    time: new Date().toISOString(),
  });
});

app.get('/api/status', (_req, res) => {
  const jam = getJam();
  res.json({
    spotifyConfigured: spotify.configured,
    spotifyConnected: spotify.isConnected(),
    calendarSource: env.CALENDAR_ICS_URL ? 'ics' : 'demo',
    jamUrl: jam.url || '',
    jamUpdatedAt: jam.updatedAt,
  });
});

app.get('/api/events', async (_req, res) => {
  try {
    const manual = getActiveDashboardEvents();
    const payload = await calendar.getEvents();

    // Prefer staff-added events; keep ICS events when configured.
    // If no ICS URL is set, hide demo events whenever manual events exist.
    const remote =
      payload.source === 'demo' && manual.length
        ? []
        : payload.events || [];

    const byId = new Map();
    for (const event of [...remote, ...manual]) {
      byId.set(event.id, event);
    }

    const events = [...byId.values()].sort(
      (a, b) => Date.parse(a.start) - Date.parse(b.start)
    );

    res.json({
      fetchedAt: new Date().toISOString(),
      source: manual.length
        ? payload.source === 'ics'
          ? 'manual+ics'
          : 'manual'
        : payload.source,
      events,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campuses', (_req, res) => {
  res.json({ campuses: CAMPUSES });
});

app.get('/api/admin/events', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    campuses: CAMPUSES,
    events: listManualEvents({ includeArchived: true }),
  });
});

app.post('/api/admin/events', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const event = createManualEvent(req.body || {});
    res.status(201).json({ ok: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/events/:id', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const event = updateManualEvent(req.params.id, req.body || {});
    res.json({ ok: true, event });
  } catch (err) {
    const notFound = /not found/i.test(err.message);
    res.status(notFound ? 404 : 400).json({ error: err.message });
  }
});

app.post('/api/admin/events/:id/archive', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const event = archiveManualEvent(req.params.id);
    res.json({ ok: true, event });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/admin/events/:id', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    deleteManualEvent(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/now-playing', async (_req, res) => {
  try {
    const payload = await spotify.getCurrentlyPlaying();
    // If Spotify is disconnected / session dead, drop the Jam QR too
    if (payload.configured && payload.connected === false && getJam().url) {
      saveJam('');
      console.log('[jam] cleared because Spotify is disconnected');
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jam', async (_req, res) => {
  try {
    const jam = await getJamStatus();
    res.json(jam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jam/qr.svg', async (_req, res) => {
  try {
    const jam = await getJamStatus();
    const svg = await qrSvg(jam.url || '');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    res.status(500).send(`<!-- ${err.message} -->`);
  }
});

app.post('/api/jam', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = String(req.body?.url || '').trim();
  if (url && !/^https:\/\/(open\.)?spotify\.com\//i.test(url) && !/^https:\/\/spotify\.link\//i.test(url)) {
    return res.status(400).json({
      error: 'Jam link should be a Spotify URL (open.spotify.com or spotify.link)',
    });
  }

  const saved = saveJam(url);
  res.json({ ok: true, ...saved, active: Boolean(saved.url) });
});

app.delete('/api/jam', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const saved = saveJam('');
  res.json({ ok: true, ...saved, active: false });
});

app.get('/auth/spotify', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).send('Unauthorized — set ADMIN_PASSWORD or pass ?password=');
  }
  if (!spotify.configured) {
    return res
      .status(400)
      .send('Spotify is not configured. Copy .env.example to .env and add your Client ID/Secret.');
  }
  res.redirect(spotify.getAuthUrl());
});

app.get('/auth/spotify/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) throw new Error(String(error));
    if (!code) throw new Error('Missing authorization code');
    await spotify.exchangeCode(String(code));
    // New Connect replaces the previous account — clear any leftover Jam QR
    if (getJam().url) {
      saveJam('');
      console.log('[jam] cleared because a new Spotify account connected');
    }
    res.redirect('/admin?spotify=connected');
  } catch (err) {
    res.status(500).send(`Spotify auth failed: ${err.message}`);
  }
});

app.post('/api/spotify/disconnect', (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  spotify.disconnect();
  saveJam('');
  res.json({ ok: true, jamCleared: true });
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`\nCSL Dashboard running at http://127.0.0.1:${port}`);
  console.log(`Admin / DJ page:        http://127.0.0.1:${port}/admin`);
  console.log(`Spotify configured:     ${spotify.configured ? 'yes' : 'no (demo playback)'}`);
  console.log(`Calendar source:        ${env.CALENDAR_ICS_URL ? 'ICS URL' : 'demo events'}\n`);
});
