import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { isLoggedIn, saveLoginRedirect } from "./api/client";

// Landing stays eagerly loaded — it's the entry page and should paint
// without waiting on a second chunk. Everything else is code-split so
// visitors don't download the organiser/admin bundles up front.
import Landing from "./pages/Landing";
import ScrollToTop from "./components/shared/ScrollToTop";

// Public
const SportPage          = lazy(() => import("./pages/SportPage"));
const Tournaments        = lazy(() => import("./pages/Tournaments"));
const TournamentPublic   = lazy(() => import("./pages/TournamentPublic"));
const Login              = lazy(() => import("./pages/auth/Login"));
const Register           = lazy(() => import("./pages/auth/Register"));
const PrivacyPolicy      = lazy(() => import("./pages/PrivacyPolicy"));
const Terms              = lazy(() => import("./pages/Terms"));
const About              = lazy(() => import("./pages/About"));
const JoinTournament     = lazy(() => import("./pages/JoinTournament"));

// Admin
const AdminPanel = lazy(() => import("./pages/admin/AdminPanel"));

// Organiser
const OrgDashboard       = lazy(() => import("./pages/organiser/Dashboard"));
const CreateTournament   = lazy(() => import("./pages/organiser/CreateTournament"));
const TournamentOverview = lazy(() => import("./pages/organiser/workspace/TournamentOverview"));
const EventWorkspace     = lazy(() => import("./pages/organiser/workspace/EventWorkspace"));

// Shown while a route chunk downloads — matches the app's skeleton style.
function RouteFallback() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg)",
    }}>
      <div className="skeleton" style={{ width: 120, height: 12, borderRadius: 6 }} />
    </div>
  );
}

function RequireAuth({ children, orgTheme = true, requireAdmin = false }) {
  const location = useLocation();
  if (!isLoggedIn()) {
    saveLoginRedirect(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  if (requireAdmin) {
    // Read is_superadmin from the JWT payload (it's not stored there — we gate
    // in the API, so the frontend just redirects away from the URL if somehow
    // reached without the correct server-side panel data loading).
    // Real guard is server-side; this is just a UX redirect.
    return <>{children}</>;
  }
  if (!orgTheme) return <>{children}</>;
  return <div className="organizer-flow">{children}</div>;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/"                              element={<Landing />} />
        <Route path="/tournaments"                   element={<Tournaments />} />
        <Route path="/football"                      element={<SportPage />} />
        <Route path="/cricket"                       element={<SportPage />} />
        <Route path="/table-tennis"                  element={<SportPage />} />
        <Route path="/badminton"                     element={<SportPage />} />
        <Route path="/:sportUrl/tournament/:slug"    element={<TournamentPublic />} />
        <Route path="/t/:slug"                       element={<TournamentPublic />} />

        {/* Auth */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Tournament invite links — public route, page handles auth itself */}
        <Route path="/join/:token" element={<JoinTournament />} />

        {/* Legal / company */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms"   element={<Terms />} />
        <Route path="/about"   element={<About />} />

        {/* Organiser */}
        <Route path="/organiser" element={<RequireAuth><OrgDashboard /></RequireAuth>} />
        <Route path="/organiser/create" element={<RequireAuth><CreateTournament /></RequireAuth>} />

        <Route
          path="/organiser/tournament/:tournamentId"
          element={<RequireAuth><TournamentOverview /></RequireAuth>}
        />

        <Route
          path="/organiser/tournament/:tournamentId/event/:eventId"
          element={<RequireAuth><EventWorkspace /></RequireAuth>}
        />

        {/* Super-admin */}
        <Route path="/admin" element={<RequireAuth orgTheme={false}><AdminPanel /></RequireAuth>} />
        <Route path="/admin/*" element={<RequireAuth orgTheme={false}><AdminPanel /></RequireAuth>} />

        {/* Legacy redirect */}
        <Route path="/dashboard/*" element={<Navigate to="/organiser" replace />} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}