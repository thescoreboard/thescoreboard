import { Link } from "react-router-dom";
import usePageMeta from "../hooks/usePageMeta";

const EFFECTIVE_DATE = "30 May 2026";
const CONTACT_EMAIL  = "teams@thescoreboard.in";
const APP_NAME       = "TheScoreBoard";
const COMPANY        = "TheScoreBoard";
const WEBSITE        = "https://thescoreboard.in";

export default function PrivacyPolicy() {
  usePageMeta("Privacy Policy");
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
        <Link to="/terms" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>
          Terms of Service →
        </Link>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
          Legal
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 40 }}>
          Effective date: {EFFECTIVE_DATE}
        </p>

        <Section title="1. Introduction">
          <p>
            {APP_NAME} ("we", "our", or "us") is committed to protecting your personal information.
            This Privacy Policy explains what data we collect, how we use it, and what rights you have
            over it when you use our website at <a href={WEBSITE} style={linkStyle}>{WEBSITE}</a> or
            our mobile application (collectively, the "Service").
          </p>
          <p>
            By using the Service you agree to this policy. If you do not agree, please do not use the Service.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <SubHead>2.1 Account information</SubHead>
          <p>When you register, we collect:</p>
          <ul>
            <li><strong>Full name</strong></li>
            <li><strong>Email address</strong></li>
            <li><strong>Phone number</strong> (optional)</li>
            <li><strong>Password</strong> (stored as a secure hash — we never store plain-text passwords)</li>
            <li>If you sign in with Google: your Google account ID and profile picture URL</li>
          </ul>

          <SubHead>2.2 Player profile (optional)</SubHead>
          <p>If you set up a player profile for tournament registration, we also collect:</p>
          <ul>
            <li>Age</li>
            <li>Gender</li>
            <li>City / location</li>
          </ul>

          <SubHead>2.3 Tournament and match activity</SubHead>
          <p>
            When you register for or participate in tournaments, we store your registration status,
            match results, scores, and tournament history. This information is linked to your account.
          </p>

          <SubHead>2.4 Usage data</SubHead>
          <p>
            We collect standard server logs (IP address, timestamps, pages visited) for security
            and performance monitoring. We do not use third-party analytics SDKs that track you
            across other websites or apps.
          </p>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul>
            <li>To create and manage your account</li>
            <li>To register you for tournaments and display match results</li>
            <li>To send you transactional notifications (e.g. match schedule updates)</li>
            <li>To allow tournament organisers to view the list of registered players</li>
            <li>To improve and secure the Service</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p>We do not sell your personal data to third parties. Ever.</p>
        </Section>

        <Section title="4. Information Sharing">
          <p>We share your information only in these limited situations:</p>
          <ul>
            <li>
              <strong>Tournament organisers:</strong> When you register for a tournament, the organiser
              can see your name, player profile details, and registration status for that event.
            </li>
            <li>
              <strong>Public tournament pages:</strong> Match results and tournament brackets are
              publicly visible — your name may appear alongside scores.
            </li>
            <li>
              <strong>Service providers:</strong> We use third-party infrastructure (hosting, database)
              subject to their own privacy policies and bound by data processing agreements.
            </li>
            <li>
              <strong>Legal requirements:</strong> We may disclose data if required by law or to
              protect the rights and safety of users and the public.
            </li>
          </ul>
        </Section>

        <Section title="5. Data Retention">
          <p>
            We retain your account data for as long as your account is active, or as long as needed
            to provide the Service. If you delete your account, we anonymise your personal data
            (name, email, phone, location) within 30 days. Match history and tournament results
            are retained in anonymised form to preserve the integrity of historical records.
          </p>
        </Section>

        <Section title="6. Your Rights">
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access</strong> the personal data we hold about you</li>
            <li><strong>Correct</strong> inaccurate information via your profile settings</li>
            <li>
              <strong>Delete your account</strong> — go to Dashboard → Account → Delete Account
              inside the app, or email us at <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>{CONTACT_EMAIL}</a>.
              Your personal data will be anonymised within 30 days.
            </li>
            <li><strong>Export</strong> your data — contact us to request a copy</li>
            <li>
              <strong>Withdraw consent</strong> — where processing is based on consent, you may
              withdraw it at any time (this does not affect prior processing)
            </li>
          </ul>
          <p>
            To exercise any of these rights, email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="7. Cookies">
          <p>
            Our website uses a single authentication token stored in your browser's local storage
            to keep you signed in. We do not use advertising cookies or tracking pixels.
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            The Service is not directed at children under the age of 13. We do not knowingly
            collect personal data from children under 13. If you believe a child has provided us
            with personal information, please contact us and we will delete it promptly.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We use industry-standard security measures including encrypted connections (HTTPS),
            hashed passwords, and access controls. No method of transmission over the internet is
            100% secure, but we take reasonable steps to protect your data.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this policy from time to time. We will notify you of material changes by
            posting the new policy on this page with an updated effective date. Continued use of the
            Service after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            For privacy questions, data requests, or to delete your account, contact us at:
          </p>
          <div style={{
            background: "var(--elevated)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px", marginTop: 12,
          }}>
            <strong>{COMPANY}</strong><br />
            <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>{CONTACT_EMAIL}</a><br />
            <a href={WEBSITE} style={linkStyle}>{WEBSITE}</a>
          </div>
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Link to="/terms" style={{ color: "var(--primary)", fontSize: 14 }}>Terms of Service</Link>
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

function SubHead({ children }) {
  return (
    <p style={{ fontWeight: 700, fontSize: 14, marginTop: 16, marginBottom: 8 }}>{children}</p>
  );
}

const linkStyle = { color: "var(--primary)", textDecoration: "none" };
