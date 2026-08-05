import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { F } from '../src/theme';

const EFFECTIVE_DATE  = '30 May 2026';
const CONTACT_EMAIL   = 'teams@thescoreboard.in';

export default function PrivacyPolicyScreen() {
  const { theme } = useTheme();
  const router    = useRouter();
  const c         = theme.colors;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[s.backTxt, { color: c.muted }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: c.ink }]}>Privacy Policy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: 60 }]}
      >
        <Text style={[s.updated, { color: c.muted }]}>
          Effective date: {EFFECTIVE_DATE}
        </Text>

        <Block title="1. Introduction" c={c}>
          TheScoreBoard is committed to protecting your personal information. This Privacy Policy
          explains what data we collect, how we use it, and what rights you have when you use our
          app and website.{'\n\n'}
          By using the app, you agree to this policy.
        </Block>

        <Block title="2. Information we collect" c={c}>
          <BulletItem c={c} bold="Account:">Name, email address, password (stored as a secure hash). If you sign in with Google, we also store your Google account ID and profile picture.</BulletItem>
          <BulletItem c={c} bold="Player profile (optional):">Age, gender, city/location — only if you choose to fill in your profile.</BulletItem>
          <BulletItem c={c} bold="Tournament activity:">Registrations, match results, scores, and tournament history linked to your account.</BulletItem>
          <BulletItem c={c} bold="Usage data:">Standard server logs (IP address, timestamps) for security and performance. No third-party tracking SDKs.</BulletItem>
        </Block>

        <Block title="3. How we use your information" c={c}>
          <BulletItem c={c}>To create and manage your account</BulletItem>
          <BulletItem c={c}>To register you for tournaments and display match results</BulletItem>
          <BulletItem c={c}>To allow organisers to view their registered players</BulletItem>
          <BulletItem c={c}>To send transactional notifications (e.g. schedule updates)</BulletItem>
          <BulletItem c={c}>To improve and secure the Service</BulletItem>
          <Text style={[s.para, { color: c.ink, marginTop: 10, fontWeight: '600' }]}>
            We do not sell your personal data. Ever.
          </Text>
        </Block>

        <Block title="4. Information sharing" c={c}>
          <BulletItem c={c} bold="Tournament organisers:">When you register for a tournament, the organiser can see your name and profile details for that event only.</BulletItem>
          <BulletItem c={c} bold="Public pages:">Match results and tournament brackets are publicly visible — your name may appear alongside scores.</BulletItem>
          <BulletItem c={c} bold="Service providers:">We use third-party infrastructure (hosting, database) bound by data processing agreements.</BulletItem>
          <BulletItem c={c} bold="Legal requirements:">We may disclose data if required by law.</BulletItem>
        </Block>

        <Block title="5. Data retention" c={c}>
          We retain your account data while your account is active. If you delete your account, your
          personal data (name, email, phone, location) is anonymised within 30 days. Match history is
          retained in anonymised form to preserve the integrity of historical records.
        </Block>

        <Block title="6. Your rights" c={c}>
          <BulletItem c={c} bold="Access:">Request a copy of the data we hold about you.</BulletItem>
          <BulletItem c={c} bold="Correct:">Update inaccurate information via your profile settings.</BulletItem>
          <BulletItem c={c} bold="Delete:">Delete your account from Dashboard → Account → Delete Account. Your personal data will be anonymised within 30 days.</BulletItem>
          <BulletItem c={c} bold="Contact:">Email us at {CONTACT_EMAIL} for any privacy questions or data requests.</BulletItem>
        </Block>

        <Block title="7. Cookies & storage" c={c}>
          Our app stores your authentication token securely on your device using encrypted storage
          (iOS Keychain / Android Keystore). We do not use advertising cookies or tracking pixels.
        </Block>

        <Block title="8. Children's privacy" c={c}>
          The Service is not directed at children under 13. We do not knowingly collect personal data
          from children under 13. If you believe a child has provided us with personal information,
          please contact us and we will delete it promptly.
        </Block>

        <Block title="9. Security" c={c}>
          We use HTTPS for all data transmission, bcrypt for password hashing, and encrypted storage
          for tokens. No method of transmission over the internet is 100% secure, but we take
          reasonable steps to protect your data.
        </Block>

        <Block title="10. Changes to this policy" c={c}>
          We may update this policy from time to time. We will notify you of material changes by
          updating the effective date above. Continued use of the Service after changes constitutes
          acceptance.
        </Block>

        <Block title="11. Contact us" c={c}>
          For privacy questions or data deletion requests:{'\n\n'}
          <Text style={{ color: c.primary }}>{CONTACT_EMAIL}</Text>
          {'\n'}thescoreboard.in
        </Block>
      </ScrollView>
    </SafeAreaView>
  );
}

function Block({ title, children, c }: { title: string; children: any; c: any }) {
  return (
    <View style={s.block}>
      <Text style={[s.blockTitle, { color: c.ink }]}>{title}</Text>
      {typeof children === 'string'
        ? <Text style={[s.para, { color: c.ink }]}>{children}</Text>
        : children
      }
    </View>
  );
}

function BulletItem({ children, bold, c }: { children: any; bold?: string; c: any }) {
  return (
    <View style={s.bulletRow}>
      <Text style={[s.bullet, { color: c.muted }]}>•</Text>
      <Text style={[s.bulletTxt, { color: c.ink }]}>
        {bold ? <Text style={{ fontFamily: F.bold }}>{bold} </Text> : null}
        {children}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:   { width: 60 },
  backTxt:   { fontFamily: F.body, fontSize: 14 },
  title:     { fontFamily: F.bold, fontSize: 15, letterSpacing: -0.2 },
  content:   { paddingHorizontal: 20, paddingTop: 20 },
  updated:   { fontFamily: F.body, fontSize: 12, marginBottom: 24 },
  block:     { marginBottom: 28 },
  blockTitle:{ fontFamily: F.bold, fontSize: 15, letterSpacing: -0.2, marginBottom: 10 },
  para:      { fontFamily: F.body, fontSize: 14, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bullet:    { fontFamily: F.body, fontSize: 14, lineHeight: 22 },
  bulletTxt: { fontFamily: F.body, fontSize: 14, lineHeight: 22, flex: 1 },
});
