import { getJam, saveJam } from './store.js';

const DEAD_PATTERNS = [
  /session (has )?ended/i,
  /no longer available/i,
  /jam (has )?ended/i,
  /can't join/i,
  /cannot join/i,
  /unable to join/i,
  /invite (has )?expired/i,
  /link (has )?expired/i,
  /not found/i,
  /page not found/i,
];

let lastCheckAt = 0;
let lastCheckUrl = '';
let checkPromise = null;

async function probeJamUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CSL-Dashboard/1.0; +https://localhost)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (response.status === 404 || response.status === 410) {
      return { alive: false, reason: `HTTP ${response.status}` };
    }

    const finalUrl = response.url || url;
    if (/\/error|\/404|\/not-found/i.test(finalUrl)) {
      return { alive: false, reason: 'error redirect' };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text') || contentType.includes('json') || contentType.includes('html')) {
      const text = (await response.text()).slice(0, 80_000);
      if (DEAD_PATTERNS.some((re) => re.test(text))) {
        return { alive: false, reason: 'ended copy in page' };
      }
    }

    return { alive: true };
  } catch (err) {
    // Network blips shouldn't wipe an active Jam QR.
    return { alive: true, skipped: true, reason: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns current jam payload. Periodically probes the invite link and
 * auto-clears it when Spotify indicates the session is over.
 */
export async function getJamStatus({ forceCheck = false } = {}) {
  const jam = getJam();
  const url = (jam.url || '').trim();

  if (!url) {
    return { url: '', updatedAt: jam.updatedAt, active: false };
  }

  const now = Date.now();
  const due =
    forceCheck ||
    url !== lastCheckUrl ||
    now - lastCheckAt > 45_000;

  if (due) {
    if (!checkPromise) {
      checkPromise = probeJamUrl(url)
        .then((result) => {
          lastCheckAt = Date.now();
          lastCheckUrl = url;
          if (result.alive === false) {
            console.log(`[jam] invite looks ended (${result.reason}) — clearing QR`);
            saveJam('');
          }
          return result;
        })
        .finally(() => {
          checkPromise = null;
        });
    }
    await checkPromise;
  }

  const fresh = getJam();
  return {
    url: fresh.url || '',
    updatedAt: fresh.updatedAt,
    active: Boolean(fresh.url),
  };
}
