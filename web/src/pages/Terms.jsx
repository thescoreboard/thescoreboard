import { Link } from "react-router-dom";
import usePageMeta from "../hooks/usePageMeta";

const EFFECTIVE_DATE = "30 May 2026";
const CONTACT_EMAIL  = "support@thescoreboard.in";
const APP_NAME       = "TheScoreBoard";
const WEBSITE        = "https://thescoreboard.in";

export default function Terms() {
  usePageMeta("Terms of Service");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      {/* Nav bar */}
      <div style={{
        borderBottom: "1px solid var(--border)", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, color: "var(--ink)" }}>
            THE<span style={{ color: "var(--primary)" }}>SCORE</span>BOARD
          </span>
        </Link>
        <Link to="/privacy" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>
          Privacy Policy →
        </Link>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
          Legal
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 40 }}>
          Effective date: {EFFECTIVE_DATE}
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using {APP_NAME} (the "Service") — including our website at{" "}
            <a href={WEBSITE} style={linkStyle}>{WEBSITE}</a> and our mobile application — you agree
            to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 13 years old to use the Service. By creating an account, you
            represent that you are at least 13 years old and that the information you provide is
            accurate and complete.
          </p>
        </Section>

        <Section title="3. Your Account">
          <ul>
            <li>You are responsible for maintaining the confidentiality of your password.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>Notify us immediately if you suspect unauthorised access to your account.</li>
            <li>You may not create accounts for others without their permission.</li>
            <li>You may not use another person's account without their permission.</li>
          </ul>
        </Section>

        <Section title="4. Player Rules">
          <p>As a player using the Service you agree to:</p>
          <ul>
            <li>Provide accurate profile information when registering for tournaments.</li>
            <li>Honour your registrations — if you cannot attend, withdraw promptly so the organiser can fill your spot.</li>
            <li>Behave with sportsmanship and respect toward other participants and organisers.</li>
            <li>Accept match results as recorded by the tournament organiser. Disputes should be raised with the organiser directly.</li>
          </ul>
        </Section>

        <Section title="5. Organiser Rules">
          <p>As a tournament organiser you agree to:</p>
          <ul>
            <li>Provide accurate and complete tournament information.</li>
            <li>Run events as advertised and communicate promptly with registered players about any changes.</li>
            <li>
              Use player data (name, contact information) only for the purpose of running the registered
              tournament — not for marketing, resale, or any other purpose.
            </li>
            <li>Record match results accurately and in a timely manner.</li>
            <li>
              Not discriminate against players based on gender, religion, nationality, disability,
              or any other protected characteristic.
            </li>
          </ul>
        </Section>

        <Section title="6. Prohibited Activities">
          <p>You must not:</p>
          <ul>
            <li>Use the Service for any unlawful purpose.</li>
            <li>Post false, misleading, or fraudulent tournament listings.</li>
            <li>Attempt to gain unauthorised access to any part of the Service.</li>
            <li>Scrape, harvest, or systematically collect data from the Service.</li>
            <li>Interfere with or disrupt the Service or its servers.</li>
            <li>Use automated tools (bots, scrapers) to interact with the Service.</li>
            <li>Impersonate another person or entity.</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All content on the Service — including the brand name, logo, design, and software — is
            owned by or licensed to {APP_NAME} and is protected by applicable intellectual property laws.
            You may not copy, reproduce, or distribute any part of the Service without our prior
            written permission.
          </p>
          <p>
            Tournament data (names, results, brackets) entered by organisers remains the property of
            the respective organiser. By submitting data to the Service, you grant us a worldwide,
            royalty-free licence to display that data as part of the Service.
          </p>
        </Section>

        <Section title="8. Account Deletion">
          <p>
            You may delete your account at any time from the Account section of the app or website.
            Upon deletion, your personal data will be anonymised within 30 days in accordance with
            our <Link to="/privacy" style={linkStyle}>Privacy Policy</Link>.
            Tournament history and match results will be retained in anonymised form.
          </p>
          <p>
            We reserve the right to suspend or terminate accounts that violate these Terms, at our
            sole discretion and without prior notice.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            The Service is provided "as is" without warranties of any kind, express or implied.
            We do not guarantee that the Service will be error-free, uninterrupted, or available at
            all times. Tournament results and match data are entered by organisers — we do not
            independently verify their accuracy.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, {APP_NAME} shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising out of or related to your
            use of the Service — including, without limitation, disputes between players and organisers,
            cancelled tournaments, or inaccurate match results.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms are governed by the laws of India. Any disputes arising under these Terms
            shall be subject to the exclusive jurisdiction of courts in India.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify you of material changes by
            posting the revised Terms on this page with an updated effective date. Continued use of
            the Service after changes constitutes acceptance of the new Terms.
          </p>
        </Section>

        <Section title="13. Contact Us">
          <p>
            For questions about these Terms, contact us at:
          </p>
          <div style={{
            background: "var(--elevated)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px", marginTop: 12,
          }}>
            <strong>{APP_NAME}</strong><br />
            <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>{CONTACT_EMAIL}</a><br />
            <a href={WEBSITE} style={linkStyle}>{WEBSITE}</a>
          </div>
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Link to="/privacy" style={{ color: "var(--primary)", fontSize: 14 }}>Privacy Policy</Link>
          <Link to="/" style={{ color: "var(--muted)", fontSize: 14 }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: "var(--ink)" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.75, color: "var(--ink)", opacity: 0.85 }}>
        {children}
      </div>
    </div>
  );
}

const linkStyle = { color: "var(--primary)", textDecoration: "none" };
