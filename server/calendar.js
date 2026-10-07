import { getCampus, normalizeCampusId } from './campuses.js';
import { getCalendarCache, saveCalendarCache } from './store.js';

function withCampus(event) {
  const campusId = normalizeCampusId(event.campus || (event.isLounge ? 'csl' : 'new-brunswick'));
  const campus = getCampus(campusId);
  return {
    ...event,
    campus: campusId,
    campusLabel: campus.badgeLabel,
    campusColor: campus.color,
    campusTextColor: campus.textColor,
    isLounge: campusId === 'csl',
  };
}

function unfoldIcs(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseIcsDate(value) {
  if (!value) return null;
  const raw = value.trim();

  if (raw.includes('T')) {
    const m = raw.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
    );
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (z) {
      return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    }
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }

  const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(+y, +mo - 1, +d);
}

function unescapeText(value = '') {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseEvents(icsText) {
  const text = unfoldIcs(icsText);
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  const events = [];

  for (const block of blocks) {
    const body = block.split('END:VEVENT')[0] || '';
    const get = (key) => {
      const re = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, 'mi');
      const match = body.match(re);
      return match ? match[1].trim() : '';
    };

    const start = parseIcsDate(get('DTSTART'));
    const end = parseIcsDate(get('DTEND')) || start;
    const summary = unescapeText(get('SUMMARY'));
    if (!start || !summary) continue;

    events.push({
      id: get('UID') || `${start.toISOString()}-${summary}`,
      title: summary,
      location: unescapeText(get('LOCATION')),
      description: unescapeText(get('DESCRIPTION')),
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      allDay: !String(get('DTSTART')).includes('T'),
    });
  }

  return events;
}

function isLoungeEvent(event, keywords) {
  const haystack = `${event.title} ${event.description || ''} ${event.location || ''}`.toLowerCase();
  return keywords.some((k) => k && haystack.includes(k));
}

function demoEvents() {
  const now = new Date();
  const at = (dayOffset, hour, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'demo-csl',
      title: 'Open Mic Night',
      location: 'Coding & Social Lounge',
      description: 'Bring friends, snacks, and good vibes.',
      start: at(0, 18, 0),
      end: at(0, 21, 0),
      allDay: false,
      campus: 'csl',
    },
    {
      id: 'demo-college-ave',
      title: 'College Ave Game Night',
      location: 'College Ave Student Center',
      description: 'Board games and casual hangout.',
      start: at(1, 19, 0),
      end: at(1, 22, 0),
      allDay: false,
      campus: 'college-ave',
    },
    {
      id: 'demo-busch',
      title: 'Busch Study Sprint',
      location: 'Busch Student Center',
      description: 'Group study session.',
      start: at(2, 16, 0),
      end: at(2, 19, 0),
      allDay: false,
      campus: 'busch',
    },
    {
      id: 'demo-livingston',
      title: 'Livingston Club Fair',
      location: 'Livingston Student Center',
      description: 'Explore campus organizations.',
      start: at(3, 11, 0),
      end: at(3, 15, 0),
      allDay: false,
      campus: 'livingston',
    },
    {
      id: 'demo-cook-doug',
      title: 'Cook/Doug Farm Day',
      location: 'Cook Campus',
      description: 'Outdoor campus social.',
      start: at(4, 12, 0),
      end: at(4, 16, 0),
      allDay: false,
      campus: 'cook-doug',
    },
  ];
}

export function createCalendarService(env) {
  const keywords = (env.LOUNGE_KEYWORDS || '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const pollMs = Math.max(1, Number(env.CALENDAR_POLL_MINUTES || 10)) * 60 * 1000;
  let refreshPromise = null;

  async function fetchFresh() {
    if (!env.CALENDAR_ICS_URL) {
      const events = demoEvents().map((e) => withCampus(e));
      return saveCalendarCache(events);
    }

    const response = await fetch(env.CALENDAR_ICS_URL, {
      headers: { 'User-Agent': 'csl-dashboard/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Calendar fetch failed (${response.status})`);
    }

    const ics = await response.text();
    const now = Date.now();
    const horizon = now + 1000 * 60 * 60 * 24 * 21;

    const events = parseEvents(ics)
      .filter((e) => {
        const end = e.end ? Date.parse(e.end) : Date.parse(e.start);
        return end >= now && Date.parse(e.start) <= horizon;
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 40)
      .map((e) =>
        withCampus({
          ...e,
          campus: isLoungeEvent(e, keywords) ? 'csl' : 'college-ave',
        })
      );

    return saveCalendarCache(events);
  }

  async function ensureFresh(force = false) {
    const cache = getCalendarCache();
    const age = cache.fetchedAt ? Date.now() - Date.parse(cache.fetchedAt) : Infinity;
    if (!force && cache.events?.length && age < pollMs) {
      return cache;
    }

    if (!refreshPromise) {
      refreshPromise = fetchFresh()
        .catch((err) => {
          console.error('[calendar]', err.message);
          if (cache.events?.length) return cache;
          const events = demoEvents().map((e) => withCampus(e));
          return saveCalendarCache(events);
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    return refreshPromise;
  }

  ensureFresh(true);
  setInterval(() => ensureFresh(true), pollMs);

  return {
    async getEvents() {
      const cache = await ensureFresh(false);
      return {
        fetchedAt: cache.fetchedAt,
        source: env.CALENDAR_ICS_URL ? 'ics' : 'demo',
        events: cache.events || [],
      };
    },
    refresh: () => ensureFresh(true),
  };
}
