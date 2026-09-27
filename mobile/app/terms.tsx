import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { F } from '../src/theme';

const EFFECTIVE_DATE = '30 May 2026';
const CONTACT_EMAIL  = 'support@thescoreboard.in';

export default function TermsScreen() {
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
        <Text style={[s.title, { color: c.ink }]}>Terms of Service</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: 60 }]}
      >
        <Text style={[s.updated, { color: c.muted }]}>
          Effective date: {EFFECTIVE_DATE}
        </Text>

        <Block title="1. Acceptance of terms" c={c}>
          By using TheScoreBoard — including our mobile app and website — you agree to be bound by
          these Terms of Service. If you do not agree, do not use the Service.
        </Block>

        <Block title="2. Eligibility" c={c}>
          You must be at least 13 years old to use the Service. By creating an account, you confirm
          that you are at least 13 and that the information you provide is accurate and complete.
        </Block>

        <Block title="3. Your account" c={c}>
          <BulletItem c={c}>You are responsible for keeping your password confidential.</BulletItem>
          <BulletItem c={c}>You are responsible for all activity that occurs under your account.</BulletItem>
          <BulletItem c={c}>Notify us immediately if you suspect unauthorised access.</BulletItem>
          <BulletItem c={c}>You may not create accounts for others or use another person's account without permission.</BulletItem>
        </Block>

        <Block title="4. Player rules" c={c}>
          <BulletItem c={c}>Provide accurate profile information when registering for tournaments.</BulletItem>
          <BulletItem c={c}>Honour your registrations — withdraw promptly if you cannot attend.</BulletItem>
          <BulletItem c={c}>Behave with sportsmanship and respect toward other participants and organisers.</BulletItem>
          <BulletItem c={c}>Accept match results as recorded by the tournament organiser. Disputes should be raised with the organiser directly.</BulletItem>
        </Block>

        <Block title="5. Organiser rules" c={c}>
          <BulletItem c={c}>Provide accurate and complete tournament information.</BulletItem>
          <BulletItem c={c}>Run events as advertised and communicate changes promptly to registered players.</BulletItem>
          <BulletItem c={c}>Use player data only for running the registered tournament — not for marketing or resale.</BulletItem>
          <BulletItem c={c}>Record match results accurately and in a timely manner.</BulletItem>
          <BulletItem c={c}>Do not discriminate against players on any protected grounds.</BulletItem>
        </Block>

        <Block title="6. Prohibited activities" c={c}>
          <BulletItem c={c}>Using the Service for any unlawful purpose</BulletItem>
          <BulletItem c={c}>Posting false or fraudulent tournament listings</BulletItem>
          <BulletItem c={c}>Attempting to gain unauthorised access to any part of the Service</BulletItem>
          <BulletItem c={c}>Scraping or harvesting data from the Service</BulletItem>
          <BulletItem c={c}>Using automated tools (bots, scrapers) to interact with the Service</BulletItem>
          <BulletItem c={c}>Impersonating another person or entity</BulletItem>
        </Block>

        <Block title="7. Intellectual property" c={c}>
          All content on the Service — including the brand, logo, design, and software — is owned by
          or licensed to TheScoreBoard. You may not copy, reproduce, or distribute any part without
          prior written permission.{'\n\n'}
          Tournament data entered by organisers remains their property. By submitting it, you grant
          us a licence to display it as part of the Service.
        </Block>

        <Block title="8. Account deletion" c={c}>
          You may delete your account at any time from the Account section of the app. Upon deletion,
          your personal data will be anonymised within 30 days. Tournament history and match results
          are retained in anonymised form.{'\n\n'}
          We may also suspend or terminate accounts that violate these Terms.
        </Block>

        <Block title="9. Disclaimers" c={c}>
          The Service is provided "as is" without warranties of any kind. We do not guarantee
          uninterrupted availability or the accuracy of tournament data entered by organisers.
        </Block>

        <Block title="10. Limitation of liability" c={c}>
          To the fullest extent permitted by law, TheScoreBoard shall not be liable for any indirect
          or consequential damages arising from your use of the Service — including disputes between
          players and organisers or cancelled tournaments.
        </Block>

        <Block title="11. Governing law" c={c}>
          These Terms are governed by the laws of India. Disputes shall be subject to the exclusive
          jurisdiction of courts in India.
        </Block>

        <Block title="12. Changes to these terms" c={c}>
          We may update these Terms from time to time. Continued use of the Service after changes
          constitutes acceptance of the revised Terms.
        </Block>

        <Block title="13. Contact us" c={c}>
          For questions about these Terms:{'\n\n'}
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

function BulletItem({ children, c }: { children: any; c: any }) {
  return (
    <View style={s.bulletRow}>
      <Text style={[s.bullet, { color: c.muted }]}>•</Text>
      <Text style={[s.bulletTxt, { color: c.ink }]}>{children}</Text>
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
