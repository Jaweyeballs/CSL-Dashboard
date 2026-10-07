import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readJson(filename, fallback) {
  ensureDataDir();
  const filePath = path.join(dataDir, filename);
  try {
    if (!fs.existsSync(filePath)) return structuredClone(fallback);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(filename, value) {
  ensureDataDir();
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function getSpotifyTokens() {
  return readJson('spotify-tokens.json', null);
}

export function saveSpotifyTokens(tokens) {
  writeJson('spotify-tokens.json', {
    ...tokens,
    updatedAt: new Date().toISOString(),
  });
}

export function clearSpotifyTokens() {
  const filePath = path.join(dataDir, 'spotify-tokens.json');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function getJam() {
  return readJson('jam.json', { url: '', updatedAt: null });
}

export function saveJam(url) {
  const payload = {
    url: (url || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  writeJson('jam.json', payload);
  return payload;
}

export function getCalendarCache() {
  return readJson('calendar-cache.json', { fetchedAt: null, events: [] });
}

export function saveCalendarCache(events) {
  const payload = {
    fetchedAt: new Date().toISOString(),
    events,
  };
  writeJson('calendar-cache.json', payload);
  return payload;
}
