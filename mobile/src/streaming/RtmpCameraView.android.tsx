/**
 * RtmpCameraView — the ONLY file that knows which native streaming SDK is in
 * use (currently @api.video/react-native-livestream: Camera → encoder → RTMP).
 *
 * The rest of the app talks to this small interface (preview + start/stop with
 * a URL and key). When we need the scoreboard compositor we swap the body of
 * this file for a RootEncoder-based native module (OpenGL filter pipeline)
 * without touching callers.
 *
 * Needs a development build — the native view does not exist in Expo Go, so it
 * is required lazily and the component degrades to a placeholder.
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Text, View } from 'react-native';
import Constants from 'expo-constants';

import type { RtmpCameraHandle, RtmpCameraProps } from './types';

export type { RtmpCameraHandle, RtmpCameraProps } from './types';

let NativeView: any = null;
if (Constants.appOwnership !== 'expo') {
  try {
    NativeView = require('@api.video/react-native-livestream').ApiVideoLiveStreamView;
  } catch {
    NativeView = null;
  }
}

export const isRtmpCameraAvailable = NativeView != null;

export const RtmpCameraView = forwardRef<RtmpCameraHandle, RtmpCameraProps>((props, ref) => {
  const inner = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    start: async (url, key) => !!(await inner.current?.startStreaming(key, url)),
    stop: () => inner.current?.stopStreaming(),
  }));

  if (!NativeView) {
    return (
      <View style={[{ backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 16 }, props.style]}>
        <Text style={{ color: '#aaa', textAlign: 'center' }}>
          Camera streaming needs the Android development build (not Expo Go / web / iOS).
        </Text>
      </View>
    );
  }

  const v = props.video;
  return (
    <NativeView
      ref={inner}
      style={props.style}
      camera={props.camera ?? 'back'}
      video={v ? { resolution: { width: v.width, height: v.height }, fps: v.fps, bitrate: v.bitrate } : undefined}
      audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
      onConnectionSuccess={props.onConnected}
      onConnectionFailed={(code: string) => props.onConnectionFailed?.(code)}
      onDisconnect={props.onDisconnected}
      onPermissionsDenied={props.onPermissionsDenied}
    />
  );
});
