import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getWorkspace, transitionTournament, updateTournament, clearToken, getMe } from "../../../api/client";
import OrgHeader from "../../../components/shared/OrgHeader";
import PageLoader from "../../../components/shared/PageLoader";
import SportSetupModal from "../../../components/organiser/SportSetupModal";
import { ShareButton } from "../../../components/shared/ShareButton";
import { MediaUpload } from "../../../components/shared/MediaUpload";
import SponsorsSection from "../../../components/organiser/SponsorsSection";
import MembersSection from "../../../components/organiser/MembersSection";
import TournamentBasicInfoSection from "../../../components/organiser/TournamentBasicInfoSection";
import SetupSection from "../../../components/organiser/SetupSection";
import { SetupProgressHeader, SetupCreatedBanner, PublishCTA } from "../../../components/organiser/SetupProgressChrome";
import { getTournamentSetupChecklist, summarizeChecklist, isSectionComplete } from "../../../utils/tournamentCompleteness";


const SPORT_META = {
  table_tennis: { abbrev: "🏓", label: "Table Tennis", type: "individual" },
  badminton:    { abbrev: "🏸", label: "Badminton",    type: "individual" },
  cricket:      { abbrev: "🏏", label: "Cricket",      type: "team"       },
  football:     { abbrev: "⚽", label: "Football",     type: "team"       },
};

export default function TournamentOverview() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [data, setData]           = useState(null);
  const [user, setUser]           = useState(null);
  const [msg,  setMsg]            = useState("");
  const [setupTarget, setSetupTarget] = useState(null); // event being configured
  const [setupBannerDismissed, setSetupBannerDismissed] = useState(false);

  const flash = (txt) => { setMsg(txt); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try { setData(await getWorkspace(tournamentId)); }
    catch (e) { console.error(e); }
  }, [tournamentId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);

  const handleTransition = async (status) => {
    try {
      await transitionTournament(tournamentId, status);
      loadData();
      flash(
        status === "live"      ? "Tournament published — it's now live!" :
        status === "completed" ? "Tournament marked completed." :
        "Tournament moved back to draft."
      );
    } catch (e) { flash("Error: " + e.message); }
  };

  // "End Registration Now" closes registration immediately by moving
  // registration_end_date to yesterday (no separate manual-close flag).
  const handleEndRegistrationNow = async () => {
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      await updateTournament(data.tournament.org_id, tournamentId, { registration_end_date: yesterday });
      loadData();
      flash("Registration closed.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleSetupComplete = (updatedEvent) => {
    setSetupTarget(null);
    loadData(); // refresh so badges update
    flash(`${updatedEvent.name} configured!`);
  };

  if (!data) return <PageLoader />;

  const { tournament: t, events, stats } = data;

  // Single-sport with one configured event → skip this page, go straight to workspace
  if (!t.is_multi_sport && events.length === 1 && events[0].is_configured !== false) {
    navigate(`/organiser/tournament/${t.tournament_id}/event/${events[0].event_id}`, { replace: true });
    return null;
  }

  const unconfiguredCount = events.filter(ev => ev.is_configured === false).length;
  const allConfigured     = unconfiguredCount === 0;

  const setupChecklist  = getTournamentSetupChecklist(t, allConfigured);
  const setupSummary    = summarizeChecklist(setupChecklist);
  const detailsComplete = setupSummary.complete;

  // ── My role — gates the danger zone. Old backends don't send my_role;
  // anyone with access then was an owner, so default to admin.
  const myRole  = data.my_role || "admin";
  const isAdmin = myRole === "admin";

  const handleEventCardClick = (ev) => {
    if (ev.is_configured === false) {
      // First click on unconfigured sport → open setup wizard
      setSetupTarget(ev);
    } else {
      navigate(`/organiser/tournament/${tournamentId}/event/${ev.event_id}`);
    }
  };

  const labelStyle = { fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", fontFamily: "var(--font-display)", marginBottom: 4, display: "block" };
  const fieldStyle = { marginBottom: 14 };

  const sportsConfigExtra = {
    statusSections: ["format"],
    editableFields: () => (
      <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
        <label style={labelStyle}>Sports Configuration</label>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {allConfigured
            ? "All sports in this tournament are configured."
            : `${unconfiguredCount} sport${unconfiguredCount !== 1 ? "s" : ""} still need setup — click each sport card below to configure it.`}
        </div>
      </div>
    ),
  };

  const setupSections = (
    <>
      <TournamentBasicInfoSection
        t={t} checklist={setupChecklist}
        defaultOpen={
          !isSectionComplete(setupChecklist, "basic") ||
          !isSectionComplete(setupChecklist, "format")
        }
        onSaved={loadData} flash={flash}
        extras={[sportsConfigExtra]}
      />

      <SetupSection icon="🎨" title="Branding" status="optional" defaultOpen={false}>
        <div style={{ position: "relative" }}>
          {user?.plan !== "pro" && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10, borderRadius: "inherit",
              background: "var(--surface)", opacity: 0.92,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <span style={{ fontSize: 22 }}>🔒</span>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink)" }}>Pro Feature</div>
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", maxWidth: 220 }}>
                Custom banners &amp; logos require a Pro account.
              </div>
              <a href="mailto:hi@thescoreboard.in?subject=Upgrade to Pro" style={{
                marginTop: 4, padding: "7px 18px", borderRadius: 8,
                background: "#f59e0b", color: "#fff", fontFamily: "var(--font-display)",
                fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1,
                textDecoration: "none",
              }}>
                Upgrade →
              </a>
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            Images are automatically cropped to the correct size before upload.
          </div>

          {/* Banner — full width, 16:9 */}
          <MediaUpload
            label="Banner"
            hint="Any image · auto-cropped to 16:9 landscape · shown as hero on tournament page"
            bucket="tournament-posters"
            resourceType="tournaments"
            resourceId={t.tournament_id}
            filename="poster"
            enforceAspect="16:9"
            maxWidth={1920}
            previewUrl={t.poster_url}
            onUploaded={async (url) => {
              try {
                await updateTournament(t.org_id, t.tournament_id, { poster_url: url });
                flash("Banner updated!");
                loadData();
              } catch (e) { flash("Error saving banner: " + e.message); }
            }}
          />

          {/* Logo — square, shown as circle on public page */}
          <div style={{ marginTop: 16, maxWidth: 180 }}>
            <MediaUpload
              label="Logo"
              hint="Any image · auto-cropped to 1:1 · shown as circle over banner"
              bucket="logos"
              resourceType="tournaments"
              resourceId={t.tournament_id}
              filename="logo"
              enforceAspect="1:1"
              maxWidth={800}
              previewUrl={t.logo_url}
              previewStyle={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
              onUploaded={async (url) => {
                try {
                  await updateTournament(t.org_id, t.tournament_id, { logo_url: url });
                  flash("Logo updated!");
                  loadData();
                } catch (e) { flash("Error saving logo: " + e.message); }
              }}
            />
          </div>
        </div>
      </SetupSection>
    </>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name },
        ]}
      />

      {msg && <div className="flash success">{msg}</div>}

      <div className="tournament-overview-content" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── Finish-setup banner + progress OR Get It Match-Ready checklist ── */}
        {!detailsComplete ? (
          <>
            {!setupBannerDismissed && (
              <SetupCreatedBanner onDismiss={() => setSetupBannerDismissed(true)} />
            )}
            <SetupProgressHeader doneCount={setupSummary.doneCount} totalCount={setupSummary.totalCount} percent={setupSummary.percent} />
          </>
        ) : (() => {
          const checklist = [
            { label: "Tournament created", done: true },
            { label: "Registration open",  done: !!t.registration_open },
            { label: "Add first fixtures", done: (stats.total_matches || 0) > 0 },
          ];
          const doneCount = checklist.filter(i => i.done).length;
          return (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink)" }}>
                  Get It Match-Ready
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)" }}>{doneCount}/{checklist.length}</span>
              </div>
              {checklist.map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: item.done ? "var(--primary)" : "transparent",
                    border: item.done ? "none" : "2px solid var(--border-mid)",
                    color: "#fff", fontSize: 11, fontWeight: 900,
                  }}>
                    {item.done && "✓"}
                  </span>
                  <span style={{ fontSize: 13, color: item.done ? "var(--ink)" : "var(--muted)" }}>{item.label}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── TITLE ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 900,
            textTransform: "uppercase", letterSpacing: -1, color: "var(--ink)", margin: "0 0 8px" }}>
            {t.name}
          </h1>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13,
            color: "var(--muted)", alignItems: "center" }}>
            {t.venue && (
              <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span>📍 {[t.venue, t.city, t.state].filter(Boolean).join(", ")}</span>
                {t.venue_lat && t.venue_lng && (
                  <a
                    href={`https://www.google.com/maps?q=${t.venue_lat},${t.venue_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize:11, fontWeight:700, color:"var(--primary)", textDecoration:"none", padding:"2px 7px", borderRadius:5, border:"1px solid var(--primary-dim)", background:"var(--primary-dim)" }}
                  >
                    Open in Maps ↗
                  </a>
                )}
              </span>
            )}
            {t.is_multi_sport && (
              <span className="pill pill-gold">Multi-Sport</span>
            )}
          </div>
        </div>

        {/* ── SETUP WARNING BANNER (multi-sport only) ── */}
        {t.is_multi_sport && !allConfigured && (
          <div style={{
            background: "rgba(255,204,0,0.12)", border: "1px solid rgba(255,204,0,0.4)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: 1, color: "var(--gold)" }}>SETUP</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink)", marginBottom: 2 }}>
                {unconfiguredCount} sport{unconfiguredCount !== 1 ? "s" : ""} need setup
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Click each sport card below to configure it. Fixture generation is disabled until all sports are set up.
              </div>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        {(() => {
          // For team sports show "Teams" instead of "Players"
          const isTeamSport = events.some(ev => ev.participant_type === "team");
          const participantLabel = isTeamSport ? "Teams" : "Players";
          const statCards = [
            // Hide "Events" for single-sport — it's always 1 and adds no info
            ...(t.is_multi_sport ? [{ label: "Events", value: stats.total_events }] : []),
            { label: participantLabel, value: stats.total_players },
            { label: "Matches", value: stats.total_matches },
            { label: "Live",    value: stats.live_matches,
              color: stats.live_matches > 0 ? "var(--primary)" : undefined },
          ];
          return (
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {statCards.map(({ label, value, color }) => (
                <div key={label} className="stat-card">
                  <div className="stat-num" style={color ? { color } : {}}>{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── PUBLISHING & REGISTRATION (unlocked once details are complete) ── */}
        {detailsComplete && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Publishing &amp; Registration</div>

            {t.status === "draft" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 420 }}>
                  {isAdmin
                    ? "This tournament is only visible to you. Publish it to make it public and open registration."
                    : "This tournament is in draft — only an admin can publish it."}
                </div>
                {isAdmin && (
                  <button className="btn btn-primary" onClick={() => handleTransition("live")}>
                    Publish Tournament →
                  </button>
                )}
              </div>
            )}

            {t.status === "live" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {t.registration_open ? "Registration is open." : "Registration is currently closed."}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {t.registration_open && (
                    <button className="btn btn-outline btn-sm" onClick={handleEndRegistrationNow}>
                      End Registration Now
                    </button>
                  )}
                  {isAdmin && (
                    <button className="btn btn-outline btn-sm" onClick={() => handleTransition("completed")}>
                      Mark Tournament Completed
                    </button>
                  )}
                </div>
              </div>
            )}

            {t.status === "completed" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  This tournament is marked completed and shown as finished to spectators.
                </div>
                {isAdmin && (
                  <button className="btn btn-outline btn-sm" onClick={() => handleTransition("live")}>
                    Reopen Tournament
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {setupSections}

        {/* ── Team — manage who can help run this tournament (admins only) ── */}
        {isAdmin && (
          <SetupSection icon="👥" title="Team & Access" status="optional" defaultOpen={false}>
            <MembersSection
              tournamentId={t.tournament_id}
              currentUserId={user?.user_id}
              flash={flash}
            />
          </SetupSection>
        )}

        {!detailsComplete && isAdmin && (
          <div style={{ marginBottom: 24 }}>
            <PublishCTA complete={false} remaining={setupSummary.totalCount - setupSummary.doneCount} />
          </div>
        )}

        {/* ── SHARE LINK (unlocked once details are complete) ── */}
        {detailsComplete && (
          <div className="card share-link-card"
            style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>
              Share Tournament
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <ShareButton
                type="tournament"
                slug={t.slug}
                title={`${t.name} — Live on TheScoreBoard`}
              />
              <button className="btn btn-outline btn-sm"
                onClick={() => window.open(`/t/${t.slug}`, "_blank")}>
                View ↗
              </button>
            </div>
          </div>
        )}

        {/* ── SPONSORS ── */}
        <div style={{ position: "relative", marginBottom: 28 }}>
          <SponsorsSection
            tournamentId={t.tournament_id}
            sponsors={t.sponsors || []}
            onRefresh={loadData}
            flash={flash}
          />
        </div>

        {/* ── EVENTS ── */}
        {t.is_multi_sport && (
          <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800,
            letterSpacing: "2.5px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>
            Sports
          </div>
        )}

        {events.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--elevated)", margin: "0 auto 10px", opacity: .3 }} />
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 6 }}>
              No Events Yet
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              This tournament has no events configured.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}
            className="events-grid">
            {events.map(ev => {
              const sm = SPORT_META[ev.sport_key] || { abbrev: ev.sport_key?.slice(0,2).toUpperCase() || "?", label: ev.sport_key, type: "individual" };
              const needsSetup = ev.is_configured === false;

              return (
                <div
                  key={ev.event_id}
                  className="card card-interactive"
                  onClick={() => handleEventCardClick(ev)}
                  style={{
                    borderTop: needsSetup
                      ? "3px solid var(--gold)"
                      : "3px solid var(--primary)",
                    padding: "16px 18px",
                    opacity: needsSetup ? 0.92 : 1,
                    position: "relative",
                  }}
                >
                  {/* Setup Required badge */}
                  {needsSetup && (
                    <div style={{
                      position: "absolute", top: 10, right: 10,
                      background: "var(--gold)", color: "#1a1a1a",
                      borderRadius: 6, padding: "3px 8px",
                      fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: 1,
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      Setup Required
                    </div>
                  )}

                  {/* Sport icon + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                    paddingRight: needsSetup ? 100 : 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: needsSetup ? "rgba(255,204,0,0.12)" : "var(--primary-dim)",
                      border: `1px solid ${needsSetup ? "rgba(255,204,0,0.3)" : "rgba(255,107,53,0.2)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                    }}>
                      {sm.abbrev}
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
                        {ev.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {needsSetup
                          ? "Click to configure this sport"
                          : `${sm.label} · ${ev.format?.replace(/_/g, " ") || ""}`}
                      </div>
                    </div>
                  </div>

                  {/* Type badge */}
                  <div style={{ marginBottom: 12 }}>
                    {needsSetup ? (
                      <span className="pill pill-gold">Pending Setup</span>
                    ) : (
                      <span className={sm.type === "team" ? "pill pill-gold" : "pill pill-green"}>
                        {sm.type === "team" ? "Team Sport" : "Individual"}
                      </span>
                    )}
                  </div>

                  {/* Stats (only for configured events) */}
                  {!needsSetup && (
                    <div style={{ display: "flex", gap: 16, paddingTop: 10,
                      borderTop: "1px solid var(--border)" }}>
                      {[
                        { label: ev.participant_type === "team" ? "Teams" : "Players", value: ev.player_count },
                        { label: "Matches", value: ev.match_count },
                        { label: "Done",    value: `${ev.done_count || 0}/${ev.match_count}` },
                        ev.live_count > 0 && { label: "Live", value: ev.live_count, color: "var(--primary)" },
                      ].filter(Boolean).map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900,
                            color: color || "var(--ink)", lineHeight: 1 }}>{value}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: .5, marginTop: 2 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 10, textAlign: "right", fontFamily: "var(--font-display)",
                    fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                    color: needsSetup ? "var(--gold)" : "var(--primary)" }}>
                    {needsSetup ? "Configure →" : "Manage →"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sport setup modal ── */}
      {setupTarget && (
        <SportSetupModal
          event={setupTarget}
          onClose={() => setSetupTarget(null)}
          onSetupComplete={handleSetupComplete}
        />
      )}
    </div>
  );
}
