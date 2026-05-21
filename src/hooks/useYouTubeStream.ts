/**
 * useYouTubeStream
 *
 * Handles the full YouTube live-streaming lifecycle:
 *   1. OAuth 2.0 (implicit token via expo-auth-session)
 *   2. Create a liveBroadcast
 *   3. Create a liveStream (RTMP ingestion)
 *   4. Bind broadcast ↔ stream
 *   5. Provide rtmpUrl + streamKey for RTMPPublisher
 *   6. Transition broadcast → live on start, → complete on stop
 *
 * Usage:
 *   const yt = useYouTubeStream();
 *   await yt.signIn();
 *   await yt.createBroadcast({ title: 'Match Name' });
 *   // pass yt.rtmpUrl + yt.streamKey to RTMPPublisher
 *   await yt.goLive();   // after RTMP connection established
 *   await yt.endStream(); // on stop
 */

import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

// Required so the browser popup closes itself after redirect
WebBrowser.maybeCompleteAuthSession();

// ── YouTube API base ────────────────────────────────────────────────────────
const YT = 'https://www.googleapis.com/youtube/v3';

// ── OAuth discovery ─────────────────────────────────────────────────────────
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// ── Types ────────────────────────────────────────────────────────────────────
export type StreamPhase =
  | 'idle'        // not started
  | 'signing-in'  // OAuth browser open
  | 'creating'    // calling YouTube API
  | 'ready'       // RTMP URL ready, waiting for publisher to connect
  | 'live'        // broadcast is live on YouTube
  | 'ending'      // transitioning to complete
  | 'done'        // ended
  | 'error';

export interface YouTubeStreamState {
  phase: StreamPhase;
  error: string | null;
  broadcastUrl: string | null;  // youtube.com/watch?v=... for sharing
  rtmpUrl: string | null;       // RTMP ingestion address (without stream key)
  streamKey: string | null;     // RTMP stream name / key
  accessToken: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ytFetch(
  endpoint: string,
  method: 'GET' | 'POST',
  token: string,
  params?: Record<string, string>,
  body?: object,
) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${YT}${endpoint}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `YouTube API error ${res.status}`;
    throw new Error(msg);
  }
  return method === 'POST' && res.status === 204 ? null : res.json();
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useYouTubeStream() {
  const [state, setState] = useState<YouTubeStreamState>({
    phase: 'idle',
    error: null,
    broadcastUrl: null,
    rtmpUrl: null,
    streamKey: null,
    accessToken: null,
  });

  // Keep broadcastId in a ref-like state so goLive / endStream can use it
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  // ── Build the OAuth redirect URI ──────────────────────────────────────────
  // For a dev build this will be the reverse-DNS scheme: in.thescoreboard.app://
  // For production it should match what is registered in Google Cloud Console.
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'thescoreboard',
    path: 'oauth',
  });

  // ── Read client ID from app.config extra ─────────────────────────────────
  // Android builds use the Android OAuth client; web uses the Web client.
  const extra = Constants.expoConfig?.extra ?? {};
  const clientId: string = Platform.OS === 'web'
    ? ((extra.googleClientIdWeb     as string) ?? '')
    : ((extra.googleClientIdAndroid as string) ?? '');

  // Build the auth request (implicit / token grant — no PKCE needed)
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: ['https://www.googleapis.com/auth/youtube'],
      responseType: AuthSession.ResponseType.Token,
      redirectUri,
      extraParams: {
        // Force Google to show the account picker every time
        prompt: 'consent',
        access_type: 'online',
      },
    },
    DISCOVERY,
  );

  // ── Sign in ───────────────────────────────────────────────────────────────
  const signIn = useCallback(async (): Promise<string | null> => {
    if (!clientId) {
      const which = Platform.OS === 'web' ? 'Web application' : 'Android';
      setState(s => ({
        ...s,
        phase: 'error',
        error: `Google OAuth client ID not configured for ${which}. Add googleClientId${Platform.OS === 'web' ? 'Web' : 'Android'} to app.config.js extra.`,
      }));
      return null;
    }
    setState(s => ({ ...s, phase: 'signing-in', error: null }));
    try {
      const result = await promptAsync();
      if (result.type === 'success' && result.params?.access_token) {
        const token = result.params.access_token;
        setState(s => ({ ...s, accessToken: token }));
        return token;
      }
      if (result.type === 'cancel' || result.type === 'dismiss') {
        setState(s => ({ ...s, phase: 'idle' }));
        return null;
      }
      throw new Error('Sign-in failed or was cancelled');
    } catch (e: any) {
      setState(s => ({ ...s, phase: 'error', error: e.message }));
      return null;
    }
  }, [clientId, promptAsync]);

  // ── Create broadcast + stream, bind them ─────────────────────────────────
  const createBroadcast = useCallback(async (opts: {
    title: string;
    description?: string;
    privacy?: 'public' | 'unlisted' | 'private';
    token?: string;
  }) => {
    const token = opts.token ?? state.accessToken;
    if (!token) {
      setState(s => ({ ...s, phase: 'error', error: 'Not signed in to YouTube' }));
      return;
    }

    setState(s => ({ ...s, phase: 'creating', error: null }));

    try {
      const now   = new Date();
      const start = new Date(now.getTime() + 30_000).toISOString(); // 30 s from now

      // 1. Create broadcast
      const broadcast = await ytFetch(
        '/liveBroadcasts',
        'POST',
        token,
        { part: 'snippet,status,contentDetails' },
        {
          snippet: {
            title: opts.title,
            description: opts.description ?? 'Live match on TheScoreBoard',
            scheduledStartTime: start,
          },
          status: {
            privacyStatus: opts.privacy ?? 'public',
            selfDeclaredMadeForKids: false,
          },
          contentDetails: {
            enableAutoStart: true,
            enableAutoStop: true,
            latencyPreference: 'ultraLow',
          },
        },
      );

      const bId: string = broadcast.id;

      // 2. Create liveStream (RTMP ingestion)
      const stream = await ytFetch(
        '/liveStreams',
        'POST',
        token,
        { part: 'snippet,cdn,status' },
        {
          snippet: {
            title: `${opts.title} — stream`,
          },
          cdn: {
            frameRate: '30fps',
            ingestionType: 'rtmp',
            resolution: '720p',
          },
        },
      );

      const ingestionAddress: string = stream.cdn?.ingestionInfo?.ingestionAddress ?? '';
      const streamName: string       = stream.cdn?.ingestionInfo?.streamName ?? '';
      const sId: string              = stream.id;

      if (!ingestionAddress || !streamName) {
        throw new Error('YouTube did not return RTMP ingestion info. Check your Google account has YouTube access.');
      }

      // 3. Bind broadcast to stream
      await ytFetch(
        '/liveBroadcasts/bind',
        'POST',
        token,
        { id: bId, part: 'id,contentDetails', streamId: sId },
      );

      setBroadcastId(bId);
      setState(s => ({
        ...s,
        phase: 'ready',
        rtmpUrl: ingestionAddress,
        streamKey: streamName,
        broadcastUrl: `https://youtube.com/watch?v=${bId}`,
      }));
    } catch (e: any) {
      setState(s => ({ ...s, phase: 'error', error: e.message }));
    }
  }, [state.accessToken]);

  // ── Transition broadcast to "live" (call after RTMP connected) ────────────
  const goLive = useCallback(async () => {
    const token = state.accessToken;
    const bId   = broadcastId;
    if (!token || !bId) return;
    try {
      await ytFetch(
        '/liveBroadcasts/transition',
        'POST',
        token,
        { broadcastStatus: 'live', id: bId, part: 'id,status' },
      );
      setState(s => ({ ...s, phase: 'live' }));
    } catch (e: any) {
      // YouTube sometimes takes a few seconds before it allows the transition.
      // The caller should retry after a short delay.
      throw e;
    }
  }, [state.accessToken, broadcastId]);

  // ── Transition broadcast to "complete" (call after RTMP disconnected) ─────
  const endStream = useCallback(async () => {
    const token = state.accessToken;
    const bId   = broadcastId;
    setState(s => ({ ...s, phase: 'ending' }));
    if (token && bId) {
      try {
        await ytFetch(
          '/liveBroadcasts/transition',
          'POST',
          token,
          { broadcastStatus: 'complete', id: bId, part: 'id,status' },
        );
      } catch {
        // Best-effort; the broadcast auto-completes once RTMP disconnects anyway
      }
    }
    setState(s => ({
      ...s,
      phase: 'done',
      rtmpUrl: null,
      streamKey: null,
    }));
  }, [state.accessToken, broadcastId]);

  // ── Reset to idle ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setBroadcastId(null);
    setState({
      phase: 'idle',
      error: null,
      broadcastUrl: null,
      rtmpUrl: null,
      streamKey: null,
      accessToken: null,
    });
  }, []);

  return {
    ...state,
    request,   // needed so useAuthRequest registers properly
    signIn,
    createBroadcast,
    goLive,
    endStream,
    reset,
  };
}
