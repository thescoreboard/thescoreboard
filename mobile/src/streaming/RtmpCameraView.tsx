/**
 * Non-Android stub (web / iOS). The real implementation is
 * RtmpCameraView.android.tsx — keeping the native SDK in an .android file
 * stops Metro from bundling it (and React Native internals) for web.
 */
import React, { forwardRef } from 'react';
import { Text, View } from 'react-native';
import type { RtmpCameraHandle, RtmpCameraProps } from './types';

export type { RtmpCameraHandle, RtmpCameraProps } from './types';

export const isRtmpCameraAvailable = false;

export const RtmpCameraView = forwardRef<RtmpCameraHandle, RtmpCameraProps>((props, _ref) => (
  <View style={[{ backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 16 }, props.style]}>
    <Text style={{ color: '#aaa', textAlign: 'center' }}>Camera streaming is Android-only.</Text>
  </View>
));
