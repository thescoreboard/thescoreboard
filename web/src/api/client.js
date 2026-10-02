const BASE = import.meta.env.VITE_API_URL || "/api";
function getToken() { return localStorage.getItem("tsb_token"); }
export function setToken(token) { localStorage.setItem("tsb_token", token); }
export function clearToken() {
  localStorage.removeItem("tsb_token");
  localStorage.removeItem("tsb_user");
}

// ── Stored user / role helpers ───────────────────────────────────────────────
// Mirrors the mobile auth store's user/roles pattern.
// setStoredUser() is called after every successful login/register to cache the
// /auth/me response (which includes the computed `roles` array) so that any
// component can check permissions synchronously without an extra network round-trip.
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("tsb_user")); } catch { return null; }
}
export function setStoredUser(user) {
  if (user) localStorage.setItem("tsb_user", JSON.stringify(user));
  else localStorage.removeItem("tsb_user");
}
/** True if the cached /me response includes `role` (e.g. "organiser"). */
export function hasRole(role) {
  const u = getStoredUser();
  return Array.isArray(u?.roles) && u.roles.includes(role);
}

// ── Post-login redirect helpers ─────────────────────────────────────────────
// Call saveLoginRedirect(path) before sending a user to /login so that after
// they authenticate they land where they originally intended, not /organiser.
export function saveLoginRedirect(path) {
  if (path && path !== "/login" && path !== "/register") {
    localStorage.setItem("tsb_next", path);
  }
}
export function consumeLoginRedirect(fallback = "/organiser") {
  const next = localStorage.getItem("tsb_next");
  if (next) { localStorage.removeItem("tsb_next"); return next; }
  return fallback;
}

// ── Admin API ───────────────────────────────────────────────────────────────
export const adminGetStats   = ()           => request("GET",   "/admin/stats");
export const adminListUsers  = ()           => request("GET",   "/admin/users");
export const adminUpdateUser = (userId, d)  => request("PATCH", `/admin/users/${userId}`, d);
export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  try {
    const p = JSON.parse(atob(token.split(".")[1]));
    if (!p.exp || Date.now() / 1000 > p.exp) { clearToken(); return false; }
    return true;
  } catch { clearToken(); return false; }
}
function authHeaders() { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { if (res.status === 401) clearToken(); const e = await res.json().catch(() => ({})); throw new Error(e.detail || `Request failed: ${res.status}`); }
  return res.status === 204 ? null : res.json();
}

// Dashboard (aggregated — replaces getMe + getMyOrgs + getTournaments)
export const getDashboard = () => request("GET", "/dashboard");

// Auth
export const register = (d) => request("POST", "/auth/register", d);
export const login = (d) => request("POST", "/auth/login", d);
export const googleAuth = (accessToken) => request("POST", "/auth/google", { access_token: accessToken });
export const getMe             = ()  => request("GET", "/auth/me");
export const deleteAccount      = ()  => request("DELETE", "/auth/me");

// Orgs
export const createOrg = (d) => request("POST", "/orgs/", d);
export const getMyOrgs = () => request("GET", "/orgs/");
export const deleteOrg = (orgId) => request("DELETE", `/orgs/${orgId}`);

// Tournaments
export const createTournament = (orgId, d) => request("POST", `/orgs/${orgId}/tournaments`, d);
export const getTournaments = (orgId) => request("GET", `/orgs/${orgId}/tournaments`);
export const getTournament = (tId) => request("GET", `/orgs/tournaments/${tId}`);
export const updateTournament = (orgId, tId, d) => request("PATCH", `/orgs/${orgId}/tournaments/${tId}`, d);
export const deleteTournament = (orgId, tournamentId) =>
  request("DELETE", `/orgs/${orgId}/tournaments/${tournamentId}`);
export const getWorkspace = (tId) => request("GET", `/orgs/tournaments/${tId}/workspace`);
export const transitionTournament = (tId, status) => request("POST", `/orgs/tournaments/${tId}/transition?target_status=${status}`);

// Sponsors
export const createSponsor = (tId, d)         => request("POST",   `/orgs/tournaments/${tId}/sponsors`, d);
export const updateSponsor = (tId, sId, d)     => request("PATCH",  `/orgs/tournaments/${tId}/sponsors/${sId}`, d);
export const deleteSponsor = (tId, sId)        => request("DELETE", `/orgs/tournaments/${tId}/sponsors/${sId}`);


// Events
export const createEvent = (tId, d) => request("POST", `/tournaments/${tId}/events`, d);
export const getEvents = (tId) => request("GET", `/tournaments/${tId}/events`);
export const updateEvent = (eId, d) => request("PATCH", `/events/${eId}`, d);
export const configureEvent = (eId, d) => request("POST", `/events/${eId}/configure`, d);
export const generateFixtures = (eId, thirdPlace = false) =>
  request("POST", `/orgs/events/${eId}/generate-fixtures${thirdPlace ? "?third_place=true" : ""}`);
export const generateGroupMatches = (eId) =>
  request("POST", `/events/${eId}/generate-group-matches`);
export const getStandings = (eId) => request("GET", `/orgs/events/${eId}/standings`);

// Players
export const createPlayer = (d, orgId) => request("POST", `/players/${orgId ? `?org_id=${orgId}` : ""}`, d);
export const getPlayers = (orgId) => request("GET", `/players/${orgId ? `?org_id=${orgId}` : ""}`);
export const deletePlayer = (id) => request("DELETE", `/players/${id}`);
export const addPlayerToEvent = (eId, pId, gId, seed) => {
  let qs = `player_id=${pId}`; if (gId) qs += `&group_id=${gId}`; if (seed) qs += `&seed=${seed}`;
  return request("POST", `/players/events/${eId}/participants?${qs}`);
};
export const getEventParticipants = (eId) => request("GET", `/players/events/${eId}/participants`);
export const removePlayerFromEvent = (eId, pId) => request("DELETE", `/players/events/${eId}/participants/${pId}`);
export const assignPlayerGroup = (eId, pId, gId) =>
  request("PATCH", `/players/events/${eId}/participants/${pId}${gId != null ? `?group_id=${gId}` : ""}`);
export const updateParticipantSeed = (eId, pId, seedLevel) =>
  request("PATCH", `/players/events/${eId}/participants/${pId}?seed_level=${encodeURIComponent(seedLevel)}`);
export const createGroup = (eId, name) => request("POST", `/players/events/${eId}/groups?name=${encodeURIComponent(name)}`);

// Matches
export const getMatches = (eId) => request("GET", `/events/${eId}/matches`);
export const createMatch = (eId, d) => request("POST", `/events/${eId}/matches`, d);
export const updateMatchStatus = (mId, d) => request("PATCH", `/matches/${mId}/status`, d);
export const updateScore = (mId, d) => request("PATCH", `/matches/${mId}/score`, d);
export const undoSet = (mId) => request("POST", `/matches/${mId}/undo-set`);
export const walkoverMatch = (mId, winnerPos) => request("POST", `/matches/${mId}/walkover?winner_position=${winnerPos}`);
export const rematchMatch = (mId) => request("POST", `/matches/${mId}/rematch`);
export const deleteMatch = (mId) => request("DELETE", `/matches/${mId}`);


// Public
export const getHomepageData = (q) => request("GET", `/public/home${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getAllTournaments = ({ q, sport, status, city } = {}) => {
  const qs = new URLSearchParams();
  if (q)      qs.set("q",      q);
  if (sport)  qs.set("sport",  sport);
  if (status) qs.set("status", status);
  if (city)   qs.set("city",   city);
  const str = qs.toString();
  return request("GET", `/public/tournaments${str ? `?${str}` : ""}`);
};
export const getSportPageData = (u, city, q) => {
  let qs = []; if (city) qs.push(`city=${encodeURIComponent(city)}`); if (q) qs.push(`q=${encodeURIComponent(q)}`);
  return request("GET", `/public/sport/${u}${qs.length ? "?" + qs.join("&") : ""}`);
};
export const getTournamentBySlug = (slug) => request("GET", `/public/t/${slug}`);
export const getSportTournament = (u, slug) => request("GET", `/public/sport/${u}/tournament/${slug}`);

// Organiser team management
export const createTeam        = (orgId, d)       => request("POST",   `/orgs/${orgId}/teams`, d);
export const getOrgTeams       = (orgId, sport)   => request("GET",    `/orgs/${orgId}/teams${sport ? `?sport_key=${sport}` : ""}`);
export const deleteTeam        = (teamId)         => request("DELETE", `/teams/${teamId}`);
export const addTeamToEvent    = (eId, tId, gId)  => request("POST",   `/events/${eId}/teams?team_id=${tId}${gId ? `&group_id=${gId}` : ""}`);
export const assignTeamGroup   = (eId, tId, gId)  => request("PATCH",  `/events/${eId}/teams/${tId}${gId != null ? `?group_id=${gId}` : ""}`);
export const removeTeamFromEvent = (eId, tId)     => request("DELETE", `/events/${eId}/teams/${tId}`);
export const getEventTeams     = (eId)            => request("GET",    `/events/${eId}/teams`);
 
// Match finish (cricket/football)
export const finishMatch       = (mId, winnerPos) => request("POST", `/matches/${mId}/finish`, { winner_position: winnerPos });
 
// Public team registration
export const publicRegisterTeam = (tournamentId, d) =>
  fetch(`${BASE}/public/tournaments/${tournamentId}/register-team`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  }).then(async (r) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.status); }
    return r.json();
  });

// Media upload (direct — file goes to backend, backend proxies to Supabase)

// Share URLs point to the backend share route (/api/share/…) on the same origin.
// WhatsApp and other crawlers hit this route and get proper OG meta tags (og:image,
// og:title, og:description). Human users are JS-redirected to the frontend SPA.
// The /api prefix is proxied to the FastAPI backend in both dev (Vite) and prod (nginx).
const SITE_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
export const shareUrl = {
  tournament: (slug)    => `${SITE_ORIGIN}/api/share/t/${slug}`,
  match:      (matchId) => `${SITE_ORIGIN}/api/share/m/${matchId}`,
};
