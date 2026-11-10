export interface RtmpCameraHandle {
  /** Resolves false if the native layer refused (e.g. missing permission). */
  start: (ingestUrl: string, streamKey: string) => Promise<boolean>;
  stop: () => void;
}

export interface RtmpCameraProps {
  style?: import('react-native').ViewStyle;
  camera?: 'front' | 'back';
  /** Output size/bitrate. The SDK always encodes landscape-oriented frames. */
  video?: { width: number; height: number; fps: number; bitrate: number };
  onConnected?: () => void;
  onConnectionFailed?: (reason: string) => void;
  onDisconnected?: () => void;
  onPermissionsDenied?: (permissions: string[]) => void;
}
