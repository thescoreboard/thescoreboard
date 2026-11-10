/**
 * YouTube Live Streaming API helpers (pure functions, no React).
 *
 * Extracted from the working API calls in hooks/useYouTubeStream.ts. Changes:
 *  - enableEmbed: true, monitorStream off (no "testing" state), latency 'low'
 *  - eligibility / quota errors mapped to readable messages
 *  - status polling helpers so the UI can show the *real* YouTube state
 *
 * Quota (default 10,000 units/day per Cloud project, list = 1, insert/bind/
 * transition = 50): one test stream = 2 inserts + bind + 1-2 transitions
 * ≈ 200-250 units, plus ~1 unit per status poll.
 */

const YT = 'https://www.googleapis.com/youtube/v3';

export type BroadcastLifecycle =
  | 'created' | 'ready' | 'testing' | 'testStarting'
  | 'live' | 'liveStarting' | 'complete' | 'revoked';

export type IngestStreamStatus = 'created' | 'ready' | 'active' | 'inactive' | 'error';

export interface LiveSession {
  broadcastId: string;
  streamId: string;
  /** RTMP ingest base URL, e.g. rtmp://a.rtmp.youtube.com/live2 */
  ingestUrl: string;
  /** Secret — keep in memory only, never log or render. */
  streamKey: string;
  watchUrl: string;
}

export class YouTubeApiError extends Error {
  constructor(message: string, public status: number, public reason?: string) {
    super(message);
    this.name = 'YouTubeApiError';
  }
}

function friendly(status: number, reason: string | undefined, raw: string): string {
  switch (reason) {
    case 'liveStreamingNotEnabled':
      return 'Live streaming is not enabled on this YouTube channel. Enable it at youtube.com/features (phone verification; can take up to 24 h to activate).';
    case 'insufficientPermissions':
    case 'forbidden':
      return 'This Google account did not grant YouTube access. Sign in again and accept all requested permissions.';
    case 'quotaExceeded':
    case 'rateLimitExceeded':
    case 'userRequestsExceedRateLimit':
      return 'YouTube API quota exceeded for today. Try again tomorrow or request a quota increase.';
    case 'youtubeSignupRequired':
      return 'This Google account has no YouTube channel. Create one at youtube.com first.';
    case 'invalidCredentials':
      return 'Google sign-in expired. Please connect YouTube again.';
  }
  if (status === 401) return 'Google sign-in expired. Please connect YouTube again.';
  return raw || `YouTube API error ${status}`;
}

async function ytFetch<T = any>(
  endpoint: string,
  method: 'GET' | 'POST',
  token: string,
  params: Record<string, string>,
  body?: object,
): Promise<T> {
  const res = await fetch(`${YT}${endpoint}?${new URLSearchParams(params).toString()}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const reason: string | undefined = err?.error?.errors?.[0]?.reason;
    throw new YouTubeApiError(friendly(res.status, reason, err?.error?.message), res.status, reason);
  }
  return res.json();
}

/** Create broadcast + RTMP stream and bind them. Returns what the encoder needs. */
export async function createLiveSession(
  token: string,
  opts: { title: string; description?: string; privacy?: 'public' | 'unlisted' | 'private' },
): Promise<LiveSession> {
  const broadcast = await ytFetch('/liveBroadcasts', 'POST', token,
    { part: 'snippet,status,contentDetails' },
    {
      snippet: {
        title: opts.title,
        description: opts.description ?? 'Live on TheScoreBoard',
        scheduledStartTime: new Date(Date.now() + 15_000).toISOString(),
      },
      status: { privacyStatus: opts.privacy ?? 'unlisted', selfDeclaredMadeForKids: false },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableEmbed: true,
        enableDvr: true,
        latencyPreference: 'low',
        monitorStream: { enableMonitorStream: false },
      },
    });

  const stream = await ytFetch('/liveStreams', 'POST', token,
    { part: 'snippet,cdn,status' },
    {
      snippet: { title: `${opts.title} — stream` },
      cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
    });

  const info = stream.cdn?.ingestionInfo;
  if (!info?.ingestionAddress || !info?.streamName) {
    throw new YouTubeApiError('YouTube did not return RTMP ingestion info.', 200);
  }

  await ytFetch('/liveBroadcasts/bind', 'POST', token,
    { id: broadcast.id, part: 'id,contentDetails', streamId: stream.id });

  return {
    broadcastId: broadcast.id,
    streamId: stream.id,
    ingestUrl: info.ingestionAddress,
    streamKey: info.streamName,
    watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`,
  };
}

/** Is YouTube actually receiving video on the bound ingest stream? */
export async function getIngestStatus(token: string, streamId: string): Promise<IngestStreamStatus> {
  const r = await ytFetch('/liveStreams', 'GET', token, { part: 'status', id: streamId });
  return (r.items?.[0]?.status?.streamStatus ?? 'created') as IngestStreamStatus;
}

export async function getBroadcastLifecycle(token: string, broadcastId: string): Promise<BroadcastLifecycle> {
  const r = await ytFetch('/liveBroadcasts', 'GET', token, { part: 'status', id: broadcastId });
  return (r.items?.[0]?.status?.lifeCycleStatus ?? 'created') as BroadcastLifecycle;
}

export async function transitionBroadcast(
  token: string, broadcastId: string, to: 'live' | 'complete',
): Promise<void> {
  try {
    await ytFetch('/liveBroadcasts/transition', 'POST', token,
      { broadcastStatus: to, id: broadcastId, part: 'id,status' });
  } catch (e) {
    // Already in the target state (auto-start/auto-stop beat us to it) is fine.
    if (e instanceof YouTubeApiError && e.reason === 'redundantTransition') return;
    throw e;
  }
}
