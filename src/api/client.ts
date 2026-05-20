/**
 * API client — mirrors frontend/src/api/client.js exactly.
 * Token is passed in rather than read from localStorage so it works
 * with the zustand auth store and expo-secure-store.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Dynamically resolve the API base URL:
 *
 *  • Production build (__DEV__ === false)
 *      → https://thescoreboard.in/api
 *
 *  • Dev on web (localhost:8081)
 *      → http://localhost:8000/api   (same machine, no IP needed)
 *
 *  • Dev on a physical device / emulator via Expo Go
 *      → http://<your-machine-LAN-IP>:8000/api
 *        (Expo sets hostUri = "192.168.x.x:8081", we extract the host)
 *
 * No .env file, no manual IP changes — it just works.
 */
function resolveUrls(): { api: string; ws: string } {
  if (!__DEV__) {
    return {
      api: 'https://thescoreboard.in/api',
      ws:  'wss://thescoreboard.in/api',
    };
  }

  if (Platform.OS === 'web') {
    return {
      api: 'http://localhost:8000/api',
      ws:  'ws://localhost:8000/api',
    };
  }

  // Native in dev: Metro exposes the LAN host in hostUri ("192.168.x.x:8081")
  const host =
    Constants.expoConfig?.hostUri?.split(':')[0]   // Expo Go / dev client
    ?? Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(':')[0]  // fallback
    ?? '192.168.1.1';  // last-resort: replace with your LAN IP if auto-detect fails

  return {
    api: `http://${host}:8000/api`,
    ws:  `ws://${host}:8000/api`,
  };
}

const { api: BASE_URL, ws: WS_BASE_RESOLVED } = resolveUrls();
export const WS_BASE: string = WS_BASE_RESOLVED;

// ── Core fetch wrapper ──────────────────────────────────────────

async function request(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // bubble up — caller should clear token
    throw Object.assign(new Error('Unauthorised'), { status: 401 });
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.detail ?? j.message ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────────

export const apiRegister   = (d: any)         => request('POST', '/auth/register', null, d);
export const apiLogin      = (d: any)         => request('POST', '/auth/login', null, d);
export const apiGoogleAuth = (accessToken: string) =>
  request('POST', '/auth/google', null, { access_token: accessToken });
export const apiGetMe = (token: string)       => request('GET',  '/auth/me', token);
export const apiGetPlayerProfile = (token: string) =>
  request('GET',  '/auth/player-profile', token);
export const apiSavePlayerProfile = (token: string, d: any) =>
  request('PUT',  '/auth/player-profile', token, d);

// ── Dashboard ───────────────────────────────────────────────────
export const apiGetDashboard = (token: string) => request('GET', '/dashboard', token);

// ── Organisations ───────────────────────────────────────────────
export const apiCreateOrg    = (token: string, d: any) => request('POST',   '/orgs/', token, d);
export const apiGetMyOrgs    = (token: string)          => request('GET',    '/orgs/', token);
export const apiDeleteOrg    = (token: string, id: number) => request('DELETE', `/orgs/${id}`, token);

// ── Tournaments ─────────────────────────────────────────────────
export const apiCreateTournament = (token: string, orgId: number, d: any) =>
  request('POST',   `/orgs/${orgId}/tournaments`, token, d);
export const apiGetTournaments   = (token: string, orgId: number) =>
  request('GET',    `/orgs/${orgId}/tournaments`, token);
export const apiGetTournament    = (token: string, tId: number) =>
  request('GET',    `/orgs/tournaments/${tId}`, token);
export const apiUpdateTournament = (token: string, orgId: number, tId: number, d: any) =>
  request('PATCH',  `/orgs/${orgId}/tournaments/${tId}`, token, d);
export const apiDeleteTournament = (token: string, orgId: number, tId: number) =>
  request('DELETE', `/orgs/${orgId}/tournaments/${tId}`, token);
export const apiGetWorkspace     = (token: string, tId: number) =>
  request('GET',    `/orgs/tournaments/${tId}/workspace`, token);
export const apiTransitionTournament = (token: string, tId: number, status: string) =>
  request('POST',   `/orgs/tournaments/${tId}/transition?target_status=${status}`, token);

// ── Sponsors ────────────────────────────────────────────────────
export const apiCreateSponsor = (token: string, tId: number, d: any) =>
  request('POST',   `/orgs/tournaments/${tId}/sponsors`, token, d);
export const apiUpdateSponsor = (token: string, tId: number, sId: number, d: any) =>
  request('PATCH',  `/orgs/tournaments/${tId}/sponsors/${sId}`, token, d);
export const apiDeleteSponsor = (token: string, tId: number, sId: number) =>
  request('DELETE', `/orgs/tournaments/${tId}/sponsors/${sId}`, token);

// ── Events ──────────────────────────────────────────────────────
export const apiCreateEvent   = (token: string, tId: number, d: any) =>
  request('POST',  `/tournaments/${tId}/events`, token, d);
export const apiGetEvents     = (token: string, tId: number) =>
  request('GET',   `/tournaments/${tId}/events`, token);
export const apiUpdateEvent   = (token: string, eId: number, d: any) =>
  request('PATCH', `/events/${eId}`, token, d);
export const apiConfigureEvent = (token: string, eId: number, d: any) =>
  request('POST',  `/events/${eId}/configure`, token, d);

// ── Players ─────────────────────────────────────────────────────
export const apiCreatePlayer  = (token: string, d: any, orgId?: number) =>
  request('POST',   `/players/${orgId ? `?org_id=${orgId}` : ''}`, token, d);
export const apiGetPlayers    = (token: string, orgId?: number) =>
  request('GET',    `/players/${orgId ? `?org_id=${orgId}` : ''}`, token);
export const apiDeletePlayer  = (token: string, id: number) =>
  request('DELETE', `/players/${id}`, token);
export const apiAddPlayerToEvent = (token: string, eId: number, pId: number, gId?: number, seed?: number) => {
  let url = `/players/events/${eId}/participants?player_id=${pId}`;
  if (gId)        url += `&group_id=${gId}`;
  if (seed != null) url += `&seed=${seed}`;
  return request('POST', url, token);
};
export const apiRemovePlayerFromEvent = (token: string, eId: number, pId: number) =>
  request('DELETE', `/players/events/${eId}/participants/${pId}`, token);
export const apiAssignPlayerGroup = (token: string, eId: number, pId: number, gId?: number) =>
  request('PATCH', `/players/events/${eId}/participants/${pId}${gId ? `?group_id=${gId}` : ''}`, token);
export const apiUpdateParticipantSeed = (token: string, eId: number, pId: number, level: string) =>
  request('PATCH', `/players/events/${eId}/participants/${pId}?seed_level=${level}`, token);
export const apiCreateGroup = (token: string, eId: number, name: string) =>
  request('POST', `/players/events/${eId}/groups?name=${encodeURIComponent(name)}`, token);
export const apiGetStandings = (token: string, eId: number) =>
  request('GET', `/orgs/events/${eId}/standings`, token);

// ── Fixtures ────────────────────────────────────────────────────
export const apiGenerateFixtures = (token: string, eId: number, thirdPlace = false) =>
  request('POST', `/orgs/events/${eId}/generate-fixtures${thirdPlace ? '?third_place=true' : ''}`, token);
export const apiGenerateGroupMatches = (token: string, eId: number) =>
  request('POST', `/events/${eId}/generate-group-matches`, token);
export const apiGenerateGroups = (token: string, eId: number, numGroups: number) =>
  request('POST', `/events/${eId}/generate-groups?num_groups=${numGroups}`, token);
export const apiGenerateKnockoutFromGroups = (token: string, eId: number, qpg: number, thirdPlace: boolean) =>
  request('POST', `/events/${eId}/generate-knockout-from-groups?qualifiers_per_group=${qpg}&third_place=${thirdPlace}`, token);

// ── Matches ─────────────────────────────────────────────────────
export const apiGetMatches     = (token: string, eId: number) =>
  request('GET',    `/events/${eId}/matches`, token);
export const apiCreateMatch    = (token: string, eId: number, d: any) =>
  request('POST',   `/events/${eId}/matches`, token, d);
export const apiUpdateMatchStatus = (token: string, mId: number, d: any) =>
  request('PATCH',  `/matches/${mId}/status`, token, d);
export const apiUpdateScore    = (token: string, mId: number, d: any) =>
  request('PATCH',  `/matches/${mId}/score`, token, d);
export const apiUndoSet        = (token: string, mId: number) =>
  request('POST',   `/matches/${mId}/undo-set`, token);
export const apiWalkoverMatch  = (token: string, mId: number, winnerPos: number) =>
  request('POST',   `/matches/${mId}/walkover?winner_position=${winnerPos}`, token);
export const apiRematchMatch   = (token: string, mId: number) =>
  request('POST',   `/matches/${mId}/rematch`, token);
export const apiDeleteMatch    = (token: string, mId: number) =>
  request('DELETE', `/matches/${mId}`, token);
export const apiFinishMatch    = (token: string, mId: number, d: any) =>
  request('POST',   `/matches/${mId}/finish`, token, d);
export const apiBulkCreateMatches = (token: string, eId: number, d: any) =>
  request('POST',   `/events/${eId}/matches/bulk`, token, d);

// ── Teams ───────────────────────────────────────────────────────
export const apiCreateTeam       = (token: string, orgId: number, d: any) =>
  request('POST',   `/orgs/${orgId}/teams`, token, d);
export const apiGetOrgTeams      = (token: string, orgId: number, sport?: string) =>
  request('GET',    `/orgs/${orgId}/teams${sport ? `?sport_key=${sport}` : ''}`, token);
export const apiDeleteTeam       = (token: string, teamId: number) =>
  request('DELETE', `/teams/${teamId}`, token);
export const apiAddTeamToEvent   = (token: string, eId: number, tId: number, gId?: number) => {
  let url = `/events/${eId}/teams?team_id=${tId}`;
  if (gId) url += `&group_id=${gId}`;
  return request('POST', url, token);
};
export const apiRemoveTeamFromEvent = (token: string, eId: number, tId: number) =>
  request('DELETE', `/events/${eId}/teams/${tId}`, token);
export const apiGetEventTeams = (token: string, eId: number) =>
  request('GET', `/events/${eId}/teams`, token);

// ── Public ──────────────────────────────────────────────────────
export const apiGetHomepage       = (q?: string) =>
  request('GET', `/public/home${q ? `?q=${encodeURIComponent(q)}` : ''}`, null);
// Backend URL slugs differ from internal sport keys (table-tennis vs table_tennis)
const SPORT_KEY_TO_URL: Record<string, string> = {
  table_tennis: 'table-tennis',
  football:     'football',
  cricket:      'cricket',
  badminton:    'badminton',
};
export const apiGetSportPage = (sport: string, city?: string, q?: string) => {
  const sportUrl = SPORT_KEY_TO_URL[sport] ?? sport;
  const params = new URLSearchParams();
  if (city) params.append('city', city);
  if (q)    params.append('q', q);
  const qs = params.toString();
  return request('GET', `/public/sport/${sportUrl}${qs ? `?${qs}` : ''}`, null);
};
export const apiGetTournamentBySlug = (slug: string) =>
  request('GET', `/public/t/${slug}`, null);
export const apiPublicRegisterIndividual = (tId: number, d: any) =>
  request('POST', `/public/tournaments/${tId}/register`, null, d);
export const apiPublicRegisterTeam = (tId: number, d: any) =>
  request('POST', `/public/tournaments/${tId}/register-team`, null, d);

// ── Share URLs (for native share sheet) ─────────────────────────
export const shareUrl = {
  tournament: (slug: string) => `${BASE_URL.replace('/api', '')}/api/share/t/${slug}`,
  match:      (matchId: number) => `${BASE_URL.replace('/api', '')}/api/share/m/${matchId}`,
};

// ── Media upload (multipart) ─────────────────────────────────────
export async function apiUploadMedia(
  token: string,
  fileUri: string,
  mimeType: string,
  bucket: string,
  path: string,
): Promise<{ public_url: string }> {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: path.split('/').pop() } as any);
  formData.append('bucket', bucket);
  formData.append('path', path);

  const res = await fetch(`${BASE_URL}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}
