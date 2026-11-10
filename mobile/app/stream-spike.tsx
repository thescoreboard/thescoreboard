/**
 * LIVESTREAM SPIKE — Android camera → RTMP → YouTube Live. Nothing else.
 *
 * Not linked from the UI. Open with:
 *   adb shell am start -a android.intent.action.VIEW -d "thescoreboard://stream-spike"
 * Not wired to the backend, tournaments or matches by design.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { RtmpCameraView, RtmpCameraHandle, isRtmpCameraAvailable } from '../src/streaming/RtmpCameraView';
import { useYouTubeAuth } from '../src/streaming/useYouTubeAuth';
import {
  createLiveSession, getBroadcastLifecycle, getIngestStatus, transitionBroadcast, LiveSession,
} from '../src/streaming/youtubeLive';

type Phase =
  | 'idle' | 'preparing' | 'connecting' | 'waiting-yt' | 'live'
  | 'reconnecting' | 'lost' | 'stopping' | 'ended' | 'error';

const VIDEO = { width: 1280, height: 720, fps: 30, bitrate: 2_000_000 };
const MAX_RECONNECTS = 3;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const LABEL: Record<Phase, string> = {
  'idle': 'Not streaming',
  'preparing': 'Creating YouTube broadcast…',
  'connecting': 'Connecting to YouTube (RTMP)…',
  'waiting-yt': 'RTMP connected — waiting for YouTube to go live…',
  'live': 'LIVE',
  'reconnecting': 'Connection dropped — reconnecting…',
  'lost': 'Connection lost',
  'stopping': 'Ending broadcast…',
  'ended': 'Ended — you can start another test stream',
  'error': 'Error',
};

export default function StreamSpike() {
  const router = useRouter();
  const auth = useYouTubeAuth();
  const camera = useRef<RtmpCameraHandle>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Bumped to remount the camera view: the SDK stops the camera on app pause
  // (e.g. while the Google sign-in browser is open) and the preview stays black.
  const [camKey, setCamKey] = useState(0);

  // Session lives in refs: the stream key must never reach state, UI or logs.
  const session = useRef<LiveSession | null>(null);
  const tokenRef = useRef<string | null>(null);
  const stopping = useRef(false);
  const reconnects = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const fail = (msg: string) => { setError(msg); setPhaseBoth('error'); };

  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      const p = phaseRef.current;
      if (st === 'active' && (p === 'idle' || p === 'ended' || p === 'error')) setCamKey(k => k + 1);
    });
    return () => sub.remove();
  }, []);

  // Elapsed timer while live.
  useEffect(() => {
    if (phase !== 'live') return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Leaving the screen mid-stream must not leave a dangling YouTube broadcast.
  useEffect(() => () => {
    const s = session.current, tok = tokenRef.current;
    if (s && tok && phaseRef.current !== 'ended' && phaseRef.current !== 'idle') {
      camera.current?.stop();
      transitionBroadcast(tok, s.broadcastId, 'complete').catch(() => {});
    }
  }, []);

  /** Wait until YouTube really receives video, then make sure it is LIVE. */
  const waitForYouTubeLive = useCallback(async () => {
    const s = session.current, tok = tokenRef.current;
    if (!s || !tok) return;
    setPhaseBoth('waiting-yt');
    try {
      let activeSince: number | null = null;
      for (let i = 0; i < 40 && !stopping.current; i++) {          // ~80 s budget
        const [ingest, life] = await Promise.all([
          getIngestStatus(tok, s.streamId),
          getBroadcastLifecycle(tok, s.broadcastId),
        ]);
        if (life === 'live') { setPhaseBoth('live'); return; }
        if (ingest === 'active') {
          activeSince ??= Date.now();
          // enableAutoStart normally flips it; nudge manually if it hasn't after 8 s.
          if (Date.now() - activeSince > 8000) {
            await transitionBroadcast(tok, s.broadcastId, 'live').catch(() => {});
          }
        }
        await sleep(2000);
      }
      if (!stopping.current) fail('YouTube did not report the broadcast LIVE within 80 s. Check the stream in YouTube Studio.');
    } catch (e: any) {
      fail(e.message);
    }
  }, []);

  const startRtmp = useCallback(async () => {
    const s = session.current;
    if (!s) return false;
    const ok = await camera.current?.start(s.ingestUrl, s.streamKey);
    if (!ok) fail('The camera/encoder refused to start (check camera & microphone permissions).');
    return !!ok;
  }, []);

  const handleStart = async () => {
    setError(null); setWatchUrl(null);
    stopping.current = false; reconnects.current = 0;
    try {
      setPhaseBoth('preparing');
      let tok = tokenRef.current ?? auth.token;
      if (!tok) tok = await auth.connect();
      if (!tok) { setPhaseBoth('idle'); if (auth.error) setError(auth.error); return; }
      tokenRef.current = tok;

      session.current = await createLiveSession(tok, {
        title: `TheScoreBoard stream test ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        privacy: 'unlisted',
      });
      setWatchUrl(session.current.watchUrl);
      setPhaseBoth('connecting');
      await startRtmp();
    } catch (e: any) {
      fail(e.message);
    }
  };

  const handleStop = async () => {
    stopping.current = true;
    setPhaseBoth('stopping');
    camera.current?.stop();
    const s = session.current, tok = tokenRef.current;
    try {
      if (s && tok) await transitionBroadcast(tok, s.broadcastId, 'complete');
    } catch (e: any) {
      // Not fatal: enableAutoStop completes the broadcast once RTMP stops.
      setError(`Stopped, but YouTube said: ${e.message}`);
    }
    session.current = null;               // forget the stream key
    setPhaseBoth('ended');
  };

  const tryReconnect = useCallback(async () => {
    if (stopping.current || !session.current) return;
    if (reconnects.current >= MAX_RECONNECTS) { setPhaseBoth('lost'); return; }
    reconnects.current += 1;
    setPhaseBoth('reconnecting');
    await sleep(3000);
    if (stopping.current) return;
    await startRtmp();
  }, [startRtmp]);

  const onConnected = useCallback(() => {
    reconnects.current = 0;
    if (phaseRef.current === 'live') return;          // reconnect to an already-live broadcast
    waitForYouTubeLive();
  }, [waitForYouTubeLive]);

  const onConnectionFailed = useCallback((reason: string) => {
    if (stopping.current) return;
    setError(`RTMP connection failed: ${reason}`);
    if (phaseRef.current === 'connecting' || phaseRef.current === 'reconnecting') tryReconnect();
  }, [tryReconnect]);

  const onDisconnected = useCallback(() => {
    if (stopping.current) return;
    if (phaseRef.current === 'live' || phaseRef.current === 'waiting-yt') {
      setError('Stream disconnected (network drop or app was backgrounded).');
      tryReconnect();
    }
  }, [tryReconnect]);

  const busy = ['preparing', 'connecting', 'waiting-yt', 'stopping', 'reconnecting'].includes(phase);
  const streaming = ['connecting', 'waiting-yt', 'live', 'reconnecting', 'lost'].includes(phase);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  if (Platform.OS !== 'android') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Streaming spike is Android-only.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))}>
          <Text style={{ color: '#aaa', fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '800' }}>Livestream spike</Text>
        <View style={{ width: 40 }} />
      </View>

      <RtmpCameraView
        key={camKey}
        ref={camera}
        style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' }}
        video={VIDEO}
        onConnected={onConnected}
        onConnectionFailed={onConnectionFailed}
        onDisconnected={onDisconnected}
        onPermissionsDenied={p => fail(`Permission denied: ${p.join(', ')}`)}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ color: '#ddd' }}>
          YouTube: <Text style={{ fontWeight: '800', color: auth.token ? '#22c55e' : '#f59e0b' }}>
            {auth.token ? 'Connected' : 'Not connected'}
          </Text>
        </Text>
        <Text style={{ color: '#ddd' }}>
          Status: <Text style={{ fontWeight: '800', color: phase === 'live' ? '#ef4444' : phase === 'error' || phase === 'lost' ? '#f87171' : '#fff' }}>
            {LABEL[phase]}{phase === 'live' ? `  ${mm}:${ss}` : ''}
          </Text>
        </Text>
        <Text style={{ color: '#888', fontSize: 12 }}>
          Encoder: {VIDEO.width}×{VIDEO.height} @ {VIDEO.fps}fps, {(VIDEO.bitrate / 1e6).toFixed(1)} Mbps video + 128 kbps audio
          {' '}(configured; the SDK exposes no live bitrate stats)
        </Text>

        {error && (
          <Text style={{ color: '#f87171', backgroundColor: 'rgba(239,68,68,0.12)', padding: 10, borderRadius: 8 }}>
            {error}
          </Text>
        )}

        {!isRtmpCameraAvailable && (
          <Text style={{ color: '#fbbf24' }}>
            Native streaming module not found. This needs the Android development build, not Expo Go.
          </Text>
        )}

        {busy && <ActivityIndicator color="#ef4444" />}

        {streaming ? (
          <>
            {phase === 'lost' && (
              <TouchableOpacity
                onPress={() => { reconnects.current = 0; setError(null); tryReconnect(); }}
                style={{ backgroundColor: '#2563eb', padding: 16, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>RECONNECT</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleStop}
              style={{ backgroundColor: '#ef4444', padding: 16, borderRadius: 10, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900', letterSpacing: 1 }}>STOP STREAM</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={handleStart} disabled={busy || !isRtmpCameraAvailable}
            style={{ backgroundColor: busy || !isRtmpCameraAvailable ? '#444' : '#16a34a', padding: 16, borderRadius: 10, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', letterSpacing: 1 }}>
              {auth.token ? 'START STREAM' : 'CONNECT YOUTUBE & START'}
            </Text>
          </TouchableOpacity>
        )}

        {watchUrl && (
          <TouchableOpacity onPress={() => Linking.openURL(watchUrl)}>
            <Text style={{ color: '#60a5fa', textDecorationLine: 'underline' }}>Watch URL (open on another device): {watchUrl}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
