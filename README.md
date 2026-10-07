# CSL Dashboard

Kiosk dashboard for the Coding & Social Lounge TV (Raspberry Pi friendly).

Shows upcoming campus/lounge events, Spotify Now Playing, and a dynamic Spotify Jam QR code.

## Quick start (on your Windows PC)

### 1. Install Node.js (one-time, if needed)

Preferred: install **LTS** from [nodejs.org](https://nodejs.org/), then reopen Cursor / PowerShell.

Check:

```powershell
node -v
npm -v
```

### 2. Install and run this project

In PowerShell, from this folder:

```powershell
cd "d:\CSL RASPBERRY PI DASHBOARD\CSL-Dashboard"
npm install
npm run dev
```

Then open in your browser:

- Dashboard: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Admin / DJ: [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin)

You should immediately see **demo events** and a **demo Now Playing** track — no Spotify or calendar required yet.

> **Already running?** If the agent started the server for you, just open those links now — no need to start it again.

### 3. Try the Jam QR (no Spotify app needed)

1. Open `/admin`
2. Paste any Spotify URL, e.g. `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`
3. Click **Save Jam link**
4. Refresh the dashboard — the right panel expands with a scannable QR

## What you need to provide later

| Item | Why | Where |
|------|-----|--------|
| Spotify Client ID + Secret | Live Now Playing | [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → create app → Redirect URI: `http://127.0.0.1:3000/auth/spotify/callback` → put values in `.env` |
| Public calendar `.ics` URL | Real events | Google Calendar → Settings → Integrate calendar → secret iCal address → `CALENDAR_ICS_URL` in `.env` |
| Jam invite link (during socials) | TV QR code | Host starts a Jam in Spotify → paste at `/admin` |

After editing `.env`, restart `npm run dev`.

## Raspberry Pi (later, when HDMI / network is ready)

1. Flash Raspberry Pi OS with SSH + Wi‑Fi enabled (headless is fine)
2. Copy this project to the Pi (or `git clone`)
3. Install Node on the Pi, then `npm install && npm start`
4. On the Pi browser, open `http://127.0.0.1:3000` fullscreen (F11)
5. Optional later: auto-start Chromium in kiosk mode on boot

## Project layout

```
server/          Express API (Spotify OAuth, calendar cache, Jam QR)
public/          TV dashboard + /admin page
data/            Local tokens / jam link / calendar cache (gitignored)
.env             Your secrets (not committed)
```

## Stability

The dashboard auto-reloads the browser page once per hour to reduce long-run memory issues on a lounge TV.
