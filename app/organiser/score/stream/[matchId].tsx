/**
 * Live Stream Screen
 *
 * Full-screen camera view with a score overlay.
 * Uses react-native-rtmp-publisher for RTMP output and
 * useYouTubeStream for broadcast lifecycle management.
 *
 * Requires a dev build — will NOT work in Expo Go.
 * Run: eas build --profile development --platform android
 *      then install the resulting APK on your device.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Alert, StatusBar,
  ActivityIndicator, Linking, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuthStore } from '../../../../src/store/auth';
import { apiGetWorkspace } from '../../../../src/api/client';
import { useYouTubeStream } from '../../../../src/hooks/useYouTubeStream';

// ── Platform detection ────────────────────────────────────────────────────────
const IS_WEB     = Platform.OS === 'web';
const IS_EXPO_GO = !IS_WEB && Constants.appOwnership === 'expo';

// ── Lazily require RTMPPublisher (native Android only) ───────────────────────
// Default export: import RTMPPublisher from 'react-native-rtmp-publisher'
let RTMPPublisher: any = null;
if (!IS_WEB && !IS_EXPO_GO) {
  try {
    const mod = require('react-native-rtmp-publisher');
    RTMPPublisher = mod.default ?? mod;
  } catch {
    // Package not installed yet — handled below
  }
}

// ── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg:       '#000',
  surface:  'rgba(0,0,0,0.72)',
  green:    '#22c55e',
  red:      '#ef4444',
  gold:     '#facc15',
  ink:      '#ffffff',
  muted:    'rgba(255,255,255,0.55)',
  border:   'rgba(255,255,255,0.15)',
};

// ── LiveDot ───────────────────────────────────────────────────────────────────
function LiveDot({ active }: { active: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: active ? C.red : C.muted,
      }} />
      <Text style={{
        fontSize: 10, fontWeight: '900', letterSpacing: 1.5,
        color: active ? C.red : C.muted,
        textTransform: 'uppercase',
      }}>
        {active ? 'LIVE' : 'OFFLINE'}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function StreamScreen() {
  const params    = useLocalSearchParams<{
    matchId: string;
    eventId?: string;
    tournamentId?: string;
    sport?: string;
  }>();
  const router    = useRouter();
  const { token } = useAuthStore();

  const yt = useYouTubeStream();

  const publisherRef = useRef<any>(null);

  const [match,       setMatch]       = useState<any>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);

  // Local stream state
  const [rtmpConnected, setRtmpConnected] = useState(false);
  const [goingLive,     setGoingLive]     = useState(false);
  const [bitrate,       setBitrate]       = useState(0);
  const [muted,         setMuted]         = useState(false);

  // ── Load match data for score overlay ───────────────────────────────────
  const loadMatch = useCallback(async () => {
    if (!params.tournamentId) { setLoadingMatch(false); return; }
    try {
      const ws = await apiGetWorkspace(token!, parseInt(params.tournamentId));
      const ev = (ws.events ?? []).find((e: any) =>
        e.event_id === parseInt(params.eventId ?? '0')
      );
      const m = (ev?.matches ?? []).find((m: any) =>
        m.match_id === parseInt(params.matchId)
      );
      if (m) setMatch(m);
    } catch {}
    setLoadingMatch(false);
  }, [params.matchId, params.tournamentId, params.eventId, token]);

  useEffect(() => { loadMatch(); }, [loadMatch]);

  // ── Derived score values ──────────────────────────────────────────────────
  const sport  = params.sport ?? match?.sport_key ?? 'tt';
  const p1Name = match?.player_1?.name ?? match?.team_1?.name ?? 'Player 1';
  const p2Name = match?.player_2?.name ?? match?.team_2?.name ?? 'Player 2';

  // Generic score summary (works for TT, badminton, football, cricket)
  const scoreLabel = (() => {
    if (!match) return '— vs —';
    const s = match.score_summary;
    if (s) return s;
    // TT / badminton: sets
    const sets = (match.sets ?? []).filter((s: any) => s.is_complete);
    if (sets.length > 0) {
      const sw1 = sets.filter((s: any) => s.winner === 1).length;
      const sw2 = sets.filter((s: any) => s.winner === 2).length;
      return `${sw1} – ${sw2}`;
    }
    // Football / cricket: direct score
    if (match.score_p1 != null) {
      return `${match.score_p1} – ${match.score_p2}`;
    }
    return '0 – 0';
  })();

  // ── YouTube OAuth + Broadcast creation ───────────────────────────────────
  const handleSetupStream = async () => {
    // 1. Sign in
    const tok = await yt.signIn();
    if (!tok) return;

    // 2. Create broadcast
    await yt.createBroadcast({
      title: match
        ? `${p1Name} vs ${p2Name} — ${match.tournament_name ?? 'TheScoreBoard'}`
        : 'Live Match — TheScoreBoard',
      description: `Watch this match live on TheScoreBoard.\nhttps://thescoreboard.in`,
      privacy: 'public',
      token: tok,
    });
  };

  // ── Start RTMP publisher ──────────────────────────────────────────────────
  const handleStartPublishing = () => {
    if (!publisherRef.current) return;
    if (!yt.rtmpUrl || !yt.streamKey) return;
    publisherRef.current.startStream();
  };

  // ── Once RTMP connects, transition broadcast to live ─────────────────────
  const handleConnectionSuccess = useCallback(async () => {
    setRtmpConnected(true);
    setGoingLive(true);
    // YouTube needs a few seconds to detect the RTMP feed
    let attempts = 0;
    const tryGoLive = async () => {
      attempts++;
      try {
        await yt.goLive();
        setGoingLive(false);
      } catch {
        if (attempts < 8) {
          setTimeout(tryGoLive, 3000);
        } else {
          setGoingLive(false);
          Alert.alert(
            'Broadcast transition failed',
            'The RTMP feed is connected but YouTube did not confirm the "live" status. The stream may still be visible on YouTube.'
          );
        }
      }
    };
    setTimeout(tryGoLive, 4000);
  }, [yt.goLive]);

  // ── Stop stream ───────────────────────────────────────────────────────────
  const handleStop = () => {
    Alert.alert('End Stream', 'This will end the YouTube live broadcast.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Stream', style: 'destructive',
        onPress: async () => {
          try {
            publisherRef.current?.stopStream();
          } catch {}
          await yt.endStream();
          setRtmpConnected(false);
        },
      },
    ]);
  };

  // ── Share broadcast URL ───────────────────────────────────────────────────
  const handleShare = () => {
    if (!yt.broadcastUrl) return;
    if (IS_WEB) {
      // Web Share API if available, else open in new tab
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        (navigator as any).share({ title: 'Watch Live', url: yt.broadcastUrl }).catch(() => {});
      } else {
        Linking.openURL(yt.broadcastUrl);
      }
      return;
    }
    Share.share({
      message: `Watch the match live: ${yt.broadcastUrl}`,
      url: yt.broadcastUrl,
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Web / desktop — full OAuth + broadcast setup, no camera
  // ─────────────────────────────────────────────────────────────────────────
  if (IS_WEB) {
    const isCreatingWeb  = yt.phase === 'creating' || yt.phase === 'signing-in';
    const broadcastReady = yt.phase === 'ready' || yt.phase === 'live' || yt.phase === 'done';

    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Top bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
          }}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}>
              <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>← Back</Text>
            </TouchableOpacity>
            <Text style={{ color: C.ink, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>
              YouTube Stream Setup
            </Text>
            <LiveDot active={yt.phase === 'live'} />
          </View>

          <View style={{ flex: 1, padding: 24, gap: 20, maxWidth: 560, alignSelf: 'center', width: '100%' }}>

            {/* Match info */}
            {match && (
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                padding: 16, alignItems: 'center', gap: 6,
              }}>
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  {sport.toUpperCase()} · MATCH
                </Text>
                <Text style={{ color: C.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' }}>
                  {p1Name}  {scoreLabel}  {p2Name}
                </Text>
              </View>
            )}

            {/* Step 1 — Sign in + create broadcast */}
            {yt.phase === 'idle' && (
              <TouchableOpacity
                onPress={handleSetupStream}
                style={{ backgroundColor: '#ff0000', borderRadius: 12, paddingVertical: 18, alignItems: 'center', gap: 6 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>📺  Connect YouTube</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Sign in and create a live broadcast</Text>
              </TouchableOpacity>
            )}

            {/* Loading */}
            {isCreatingWeb && (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
                <ActivityIndicator color={C.red} size="large" />
                <Text style={{ color: C.muted, fontSize: 14 }}>
                  {yt.phase === 'signing-in' ? 'Waiting for Google sign-in…' : 'Creating YouTube broadcast…'}
                </Text>
              </View>
            )}

            {/* Error */}
            {yt.phase === 'error' && (
              <View style={{ gap: 12 }}>
                <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                  <Text style={{ color: C.red, fontSize: 13, textAlign: 'center' }}>{yt.error}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { yt.reset(); handleSetupStream(); }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: C.ink, fontWeight: '700' }}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Broadcast ready — show RTMP details */}
            {broadcastReady && (
              <View style={{ gap: 14 }}>
                <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', padding: 16, gap: 10 }}>
                  <Text style={{ color: C.green, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
                    ✓ Broadcast Created
                  </Text>

                  {/* YouTube watch URL */}
                  {yt.broadcastUrl && (
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Watch URL (share with viewers)
                      </Text>
                      <TouchableOpacity onPress={() => Linking.openURL(yt.broadcastUrl!)}>
                        <Text style={{ color: '#60a5fa', fontSize: 13, textDecorationLine: 'underline' }}>
                          {yt.broadcastUrl}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* RTMP ingestion address */}
                  {yt.rtmpUrl && (
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                        RTMP Server URL
                      </Text>
                      <Text selectable style={{ color: C.ink, fontSize: 12, fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 6 }}>
                        {yt.rtmpUrl}
                      </Text>
                    </View>
                  )}

                  {/* Stream key */}
                  {yt.streamKey && (
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Stream Key
                      </Text>
                      <Text selectable style={{ color: C.ink, fontSize: 12, fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 6 }}>
                        {yt.streamKey}
                      </Text>
                    </View>
                  )}
                </View>

                {/* OBS / external encoder tip */}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14, gap: 6 }}>
                  <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                    💡 Stream from desktop with OBS
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                    OBS Studio → Settings → Stream → Service: Custom → paste the RTMP URL + Stream Key above. Start streaming in OBS to go live on YouTube.
                  </Text>
                  <TouchableOpacity onPress={() => Linking.openURL('https://obsproject.com')}>
                    <Text style={{ color: '#60a5fa', fontSize: 12, textDecorationLine: 'underline' }}>Download OBS →</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {yt.broadcastUrl && (
                    <TouchableOpacity
                      onPress={handleShare}
                      style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                      <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13 }}>Share Link</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={async () => { await yt.endStream(); }}
                    style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, paddingVertical: 14,
                      alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14 }}>⏹</Text>
                    <Text style={{ color: C.red, fontWeight: '800', fontSize: 13 }}>End Broadcast</Text>
                  </TouchableOpacity>
                </View>

                {/* Android reminder */}
                <View style={{ backgroundColor: 'rgba(251,191,36,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)', padding: 14 }}>
                  <Text style={{ color: '#fbbf24', fontSize: 12, lineHeight: 18 }}>
                    📱 <Text style={{ fontWeight: '800' }}>Phone streaming:</Text> On your Android dev build, tap 📡 Stream on the same match to stream directly from the phone camera with the score overlay.
                  </Text>
                </View>
              </View>
            )}

            {/* Done */}
            {yt.phase === 'done' && (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Text style={{ color: C.green, fontSize: 15, fontWeight: '800' }}>✓ Broadcast ended</Text>
                <TouchableOpacity
                  onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 }}>
                  <Text style={{ color: C.muted, fontWeight: '700' }}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Expo Go guard
  // ─────────────────────────────────────────────────────────────────────────
  if (IS_EXPO_GO || !RTMPPublisher) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <Text style={{ fontSize: 40, marginBottom: 20 }}>📡</Text>
        <Text style={{ color: C.ink, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
          Dev Build Required
        </Text>
        <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          Live streaming uses native camera APIs that aren't available in Expo Go.
          You need to build and install the development APK.
        </Text>

        <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, width: '100%', marginBottom: 24 }}>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            One-time setup
          </Text>
          {[
            '1. Install EAS CLI:  npm i -g eas-cli',
            '2. Login:  eas login',
            '3. Build:  eas build --profile development --platform android',
            '4. Install the APK on your Android device',
            '5. Open the dev build — streaming will be enabled',
          ].map((step, i) => (
            <Text key={i} style={{ color: C.ink, fontSize: 12, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
              {step}
            </Text>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: C.muted, fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Error
  // ─────────────────────────────────────────────────────────────────────────
  if (yt.phase === 'error' && yt.error?.includes('client ID')) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 36, marginBottom: 16 }}>⚙️</Text>
        <Text style={{ color: C.ink, fontSize: 17, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
          YouTube API Not Configured
        </Text>
        <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
          Add your Google OAuth client ID to app.config.js to enable YouTube streaming.
        </Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, width: '100%', marginBottom: 24 }}>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Setup steps</Text>
          {[
            '1. Go to console.cloud.google.com',
            '2. Create project → Enable YouTube Data API v3',
            '3. OAuth consent screen → External',
            '4. Add scope: .../auth/youtube',
            '5. Credentials → OAuth 2.0 Client ID → Android',
            '6. Package: in.thescoreboard.app',
            '7. Add clientId to app.config.js extra.googleClientId',
          ].map((s, i) => (
            <Text key={i} style={{ color: C.ink, fontSize: 12, lineHeight: 20 }}>{s}</Text>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => Linking.openURL('https://console.cloud.google.com')}
          style={{ backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 12 }}>
          <Text style={{ color: '#000', fontWeight: '900', fontSize: 13 }}>Open Google Console →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
          style={{ borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: C.muted, fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Pre-stream setup (idle / creating / ready)
  // ─────────────────────────────────────────────────────────────────────────
  const isStreaming = yt.phase === 'live' || (yt.phase === 'ready' && rtmpConnected);
  const isCreating  = yt.phase === 'creating' || yt.phase === 'signing-in';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Camera view (always mounted so permissions are requested) ── */}
      {yt.rtmpUrl && yt.streamKey ? (
        <RTMPPublisher
          ref={publisherRef}
          streamURL={yt.rtmpUrl}
          streamName={yt.streamKey}
          onConnectionSuccessRtmp={handleConnectionSuccess}
          onConnectionFailedRtmp={(code: string) => {
            setRtmpConnected(false);
            Alert.alert('Connection failed', `RTMP error: ${code}\n\nCheck your internet connection.`);
          }}
          onDisconnectRtmp={() => {
            setRtmpConnected(false);
          }}
          onNewBitrateRtmp={(b: number) => setBitrate(b)}
          onStreamStateChanged={(status: string) => {
            if (status === 'CONNECTING') setBitrate(0);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      ) : (
        // Placeholder when no RTMP URL yet
        <View style={{ position: 'absolute', inset: 0, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📹</Text>
          <Text style={{ color: C.muted, fontSize: 14 }}>Camera preview will appear here</Text>
        </View>
      )}

      {/* ── SAFE AREA OVERLAY ── */}
      <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">

        {/* ── TOP BAR ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: C.surface,
        }}>
          <TouchableOpacity
            onPress={() => {
              if (isStreaming) { handleStop(); return; }
              router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any);
            }}
            style={{ borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>
              {isStreaming ? '⏹ Stop' : '← Back'}
            </Text>
          </TouchableOpacity>

          <LiveDot active={isStreaming} />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Camera flip */}
            {yt.rtmpUrl && (
              <TouchableOpacity
                onPress={() => publisherRef.current?.switchCamera()}
                style={{ borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: C.muted, fontSize: 14 }}>🔄</Text>
              </TouchableOpacity>
            )}
            {/* Mute */}
            {yt.rtmpUrl && (
              <TouchableOpacity
                onPress={() => {
                  if (muted) {
                    publisherRef.current?.unmute();
                    setMuted(false);
                  } else {
                    publisherRef.current?.mute();
                    setMuted(true);
                  }
                }}
                style={{ borderRadius: 6, borderWidth: 1, borderColor: muted ? C.red + '80' : C.border,
                  paddingHorizontal: 10, paddingVertical: 6, backgroundColor: muted ? C.red + '18' : 'transparent' }}>
                <Text style={{ fontSize: 14 }}>{muted ? '🔇' : '🎙️'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── SCORE OVERLAY (floating, center-bottom) ─────────────────────── */}
        {match && (
          <View style={{
            position: 'absolute',
            bottom: 160,
            left: 16,
            right: 16,
            alignItems: 'center',
          }} pointerEvents="none">
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.82)',
              borderRadius: 16,
              paddingHorizontal: 24,
              paddingVertical: 14,
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              minWidth: 260,
            }}>
              {/* Sport label */}
              <Text style={{
                fontSize: 9, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase',
                color: C.muted, marginBottom: 8,
              }}>
                {sport.toUpperCase()} · LIVE
              </Text>

              {/* Players + score */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Text style={{
                  fontSize: 14, fontWeight: '800', color: C.ink, flex: 1, textAlign: 'right',
                }} numberOfLines={1}>
                  {p1Name}
                </Text>
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8,
                  paddingHorizontal: 14, paddingVertical: 6,
                }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: 2 }}>
                    {scoreLabel}
                  </Text>
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: '800', color: C.ink, flex: 1,
                }} numberOfLines={1}>
                  {p2Name}
                </Text>
              </View>

              {/* Current set score for TT/badminton */}
              {match.sets && (() => {
                const cur = (match.sets ?? []).find((s: any) => !s.is_complete);
                if (!cur) return null;
                return (
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                    Set {cur.set_number}: {cur.score_p1} – {cur.score_p2}
                  </Text>
                );
              })()}

              {/* Powered-by */}
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 8, letterSpacing: 1 }}>
                THESCOREBOARD.IN
              </Text>
            </View>
          </View>
        )}

        {/* ── BITRATE INDICATOR ── */}
        {isStreaming && bitrate > 0 && (
          <View style={{
            position: 'absolute', top: 68, right: 16,
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
          }}>
            <Text style={{ color: C.green, fontSize: 10, fontWeight: '700' }}>
              {(bitrate / 1000).toFixed(0)} kbps
            </Text>
          </View>
        )}

        {/* ── GOING LIVE indicator ── */}
        {goingLive && (
          <View style={{
            position: 'absolute', top: 68, left: 0, right: 0,
            alignItems: 'center',
          }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={C.red} />
              <Text style={{ color: C.muted, fontSize: 12 }}>Activating broadcast…</Text>
            </View>
          </View>
        )}

        {/* ── BOTTOM CONTROLS ── */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: C.surface,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 12,
        }}>

          {/* Phase: idle — "Set up YouTube Stream" */}
          {yt.phase === 'idle' && (
            <TouchableOpacity
              onPress={handleSetupStream}
              style={{ backgroundColor: C.red, borderRadius: 12, paddingVertical: 18, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 }}>
                📺  Connect YouTube & Go Live
              </Text>
            </TouchableOpacity>
          )}

          {/* Phase: error (non-config) — retry */}
          {yt.phase === 'error' && !yt.error?.includes('client ID') && (
            <>
              <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8, padding: 12 }}>
                <Text style={{ color: C.red, fontSize: 12, textAlign: 'center' }}>{yt.error}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { yt.reset(); handleSetupStream(); }}
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: C.ink, fontWeight: '700' }}>Try Again</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Phase: signing-in / creating — spinner */}
          {isCreating && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 14 }}>
              <ActivityIndicator color={C.red} />
              <Text style={{ color: C.muted, fontSize: 14 }}>
                {yt.phase === 'signing-in' ? 'Waiting for Google sign-in…' : 'Setting up broadcast…'}
              </Text>
            </View>
          )}

          {/* Phase: ready — "Start Streaming" */}
          {yt.phase === 'ready' && !rtmpConnected && (
            <>
              <View style={{ backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 10, gap: 4 }}>
                <Text style={{ color: C.green, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                  ✓ YouTube broadcast ready
                </Text>
                {yt.broadcastUrl && (
                  <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center' }} numberOfLines={1}>
                    {yt.broadcastUrl}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={handleStartPublishing}
                style={{ backgroundColor: C.red, borderRadius: 12, paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 }}>
                  🔴  Start Streaming
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Phase: live — share URL + end stream */}
          {isStreaming && (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {yt.broadcastUrl && (
                  <TouchableOpacity
                    onPress={handleShare}
                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14 }}>🔗</Text>
                    <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13 }}>Share Link</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleStop}
                  style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 10, paddingVertical: 14,
                    alignItems: 'center', borderWidth: 1.5, borderColor: C.red + '55', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>⏹</Text>
                  <Text style={{ color: C.red, fontWeight: '800', fontSize: 13 }}>End Stream</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Phase: done */}
          {(yt.phase === 'done' || yt.phase === 'ending') && (
            <View style={{ alignItems: 'center', gap: 12 }}>
              {yt.phase === 'ending' && <ActivityIndicator color={C.muted} />}
              {yt.phase === 'done' && (
                <>
                  <Text style={{ color: C.green, fontWeight: '700', fontSize: 14 }}>✓ Stream ended</Text>
                  {yt.broadcastUrl && (
                    <TouchableOpacity onPress={handleShare}>
                      <Text style={{ color: C.muted, fontSize: 12, textDecorationLine: 'underline' }}>
                        View recording on YouTube
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/organiser' as any)}
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 }}>
                    <Text style={{ color: C.muted, fontWeight: '700' }}>← Back to Scorer</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
