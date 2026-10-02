import { Link } from "react-router-dom";
import { isLoggedIn } from "../../api/client";
import { SPORT_LABELS } from "./TournamentCard";

const FOOTER_SPORTS = [
  { key: "football",     url: "football"     },
  { key: "cricket",      url: "cricket"      },
  { key: "table_tennis", url: "table-tennis" },
  { key: "badminton",    url: "badminton"    },
];

// Shared site footer — identical on the landing page and public tournament pages.
// All links are real anchors (react-router <Link>) so crawlers can follow them.
export default function SiteFooter() {
  const loggedIn = isLoggedIn();

  return (
    <footer style={{
      background: "var(--elevated)", borderTop: "2px solid var(--border)",
      padding: "52px 24px 36px",
    }}>
      <div style={{
        maxWidth: 1100, margin: "0 auto", display: "grid", gap: 40,
      }} className="landing-footer-content">
        <div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900,
            textTransform: "uppercase", letterSpacing: -0.5, marginBottom: 12,
            color: "var(--ink)",
          }}>
            The<span style={{ color: "var(--primary)" }}>Score</span>Board
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.85, maxWidth: 260 }}>
            Live tournament scores for every sport. Built for communities, trusted by organizers.
          </p>
          {/* Instagram */}
          <a
            href="https://www.instagram.com/thescoreboard.in/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              marginTop: 16, textDecoration: "none",
              color: "#E1306C", fontSize: 13, fontWeight: 700,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
            </svg>
            @thescoreboard.in
          </a>
          {/* About Us */}
          <div style={{ marginTop: 12 }}>
            <Link
              to="/about"
              style={{
                cursor: "pointer", fontSize: 13, fontWeight: 700,
                color: "var(--ink)", textDecoration: "none",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--ink)"}
            >
              About Us →
            </Link>
          </div>
        </div>
        {[
          {
            title: "Explore",
            links: [
              { label: "Find Tournaments",   to: "/tournaments" },
              { label: "Live Scores",        to: "/tournaments" },
            ],
          },
          {
            title: "For Organizers",
            links: [
              { label: "Create Tournament",  to: loggedIn ? "/organiser" : "/login" },
              { label: "Dashboard",          to: loggedIn ? "/organiser" : "/login" },
            ],
          },
          {
            title: "Sports",
            links: FOOTER_SPORTS.map(s => ({ label: SPORT_LABELS[s.key], to: `/${s.url}` })),
          },
          {
            title: "Legal",
            links: [
              { label: "Privacy Policy", to: "/privacy" },
              { label: "Terms of Service", to: "/terms" },
            ],
          },
        ].map(col => (
          <div key={col.title} className="footer-col">
            <h4>{col.title}</h4>
            {col.links.map(l => (
              <Link key={l.label} to={l.to} onClick={l.onClick} style={{ cursor: "pointer", textDecoration: "none" }}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div style={{
        maxWidth: 1100, margin: "24px auto 0", paddingTop: 20,
        borderTop: "1px solid var(--border)", textAlign: "center",
        color: "var(--muted)", fontSize: 12,
      }}>
        © {new Date().getFullYear()} TheScoreBoard · Built for sports communities
      </div>
    </footer>
  );
}
