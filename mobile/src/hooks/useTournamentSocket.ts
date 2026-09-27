/**
 * WebSocket hook — mirrors frontend/src/hooks/useTournamentSocket.js
 * Reconnects with exponential back-off (3s → 30s). Pings every 20s.
 */
import { useEffect, useRef, useCallback } from 'react';
import { WS_BASE } from '../api/client';

interface Options {
  slug:             string | null;
  onData:           (payload: any) => void;
  onConnected?:     () => void;
  onDisconnected?:  () => void;
  enabled?:         boolean;
}

export function useTournamentSocket({
  slug,
  onData,
  onConnected,
  onDisconnected,
  enabled = true,
}: Options) {
  const wsRef       = useRef<WebSocket | null>(null);
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryDelay  = useRef(3000);
  const mounted     = useRef(true);

  const onDataRef       = useRef(onData);
  const onConnectedRef  = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  onDataRef.current         = onData;
  onConnectedRef.current    = onConnected;
  onDisconnectedRef.current = onDisconnected;

  const connect = useCallback(() => {
    if (!slug || !enabled || !mounted.current) return;

    const url = `${WS_BASE}/ws/tournament/${slug}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelay.current = 3000;
      onConnectedRef.current?.();
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 20_000);
    };

    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        const payload = JSON.parse(e.data);
        onDataRef.current(payload);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      clearInterval(pingTimer.current!);
      onDisconnectedRef.current?.();
      if (!mounted.current) return;
      retryTimer.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 1.5, 30_000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = () => ws.close();
  }, [slug, enabled]);

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      clearTimeout(retryTimer.current!);
      clearInterval(pingTimer.current!);
      wsRef.current?.close();
    };
  }, [connect]);
}
