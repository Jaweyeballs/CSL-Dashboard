import {
  clearSpotifyTokens,
  getSpotifyTokens,
  saveSpotifyTokens,
} from './store.js';

const SPOTIFY_AUTH = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
].join(' ');

function basicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export function createSpotifyService(env) {
  const configured = Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);

  function getAuthUrl(state = 'csl') {
    const params = new URLSearchParams({
      client_id: env.SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      scope: SCOPES,
      state,
      show_dialog: 'true',
    });
    return `${SPOTIFY_AUTH}/authorize?${params}`;
  }

  async function exchangeCode(code) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
    });

    const response = await fetch(`${SPOTIFY_AUTH}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed: ${text}`);
    }

    const data = await response.json();
    saveSpotifyTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
      scope: data.scope,
    });
  }

  async function refreshAccessToken(refreshToken) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch(`${SPOTIFY_AUTH}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      clearSpotifyTokens();
      throw new Error('Spotify refresh failed — reconnect at /admin');
    }

    const data = await response.json();
    const previous = getSpotifyTokens() || {};
    saveSpotifyTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token || previous.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type || previous.token_type,
      scope: data.scope || previous.scope,
    });
  }

  async function getValidAccessToken() {
    const tokens = getSpotifyTokens();
    if (!tokens?.access_token) return null;

    if (Date.now() > (tokens.expires_at || 0) - 60_000) {
      if (!tokens.refresh_token) return null;
      await refreshAccessToken(tokens.refresh_token);
    }

    return getSpotifyTokens()?.access_token || null;
  }

  function demoNowPlaying() {
    const duration = 217000;
    const progress = Math.floor((Date.now() / 40) % duration);
    return {
      isPlaying: true,
      demo: true,
      track: {
        id: 'demo-track',
        name: 'Midnight Circuits',
        artists: ['Lounge Frequency', 'CSL Beats'],
        album: 'After Hours Study Pack',
        albumArt: '/img/demo-art.svg',
        durationMs: duration,
        progressMs: progress,
        externalUrl: 'https://open.spotify.com',
      },
    };
  }

  async function getCurrentlyPlaying() {
    if (!configured) {
      return { connected: false, configured: false, ...demoNowPlaying() };
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return {
        connected: false,
        configured: true,
        isPlaying: false,
        track: null,
        message: 'Connect Spotify from /admin',
      };
    }

    const response = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204) {
      return {
        connected: true,
        configured: true,
        isPlaying: false,
        track: null,
        message: 'Nothing playing right now',
      };
    }

    if (response.status === 401) {
      clearSpotifyTokens();
      return {
        connected: false,
        configured: true,
        isPlaying: false,
        track: null,
        message: 'Spotify session expired — reconnect at /admin',
      };
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify player error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const item = data.item;
    if (!item) {
      return {
        connected: true,
        configured: true,
        isPlaying: Boolean(data.is_playing),
        track: null,
        message: 'Nothing playing right now',
      };
    }

    return {
      connected: true,
      configured: true,
      isPlaying: Boolean(data.is_playing),
      track: {
        id: item.id,
        name: item.name,
        artists: (item.artists || []).map((a) => a.name),
        album: item.album?.name || '',
        albumArt: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || '',
        durationMs: item.duration_ms,
        progressMs: data.progress_ms || 0,
        externalUrl: item.external_urls?.spotify || '',
      },
    };
  }

  return {
    configured,
    getAuthUrl,
    exchangeCode,
    getCurrentlyPlaying,
    isConnected: () => Boolean(getSpotifyTokens()?.refresh_token),
    disconnect: () => clearSpotifyTokens(),
  };
}
