import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { F } from '../../theme';
import { apiUploadMedia } from '../../api/client';
import { pickSquareImage } from '../../utils/pickImage';

interface Props {
  token: string;
  bucket: string;
  path: string;            // storage path, e.g. "tournaments/12/logo.jpg"
  maxWidth: number;
  imageUrl?: string | null;
  size?: number;
  onUploaded: (url: string) => void | Promise<void>;
}

/** Square image picker + upload to /media/upload. Mirrors web MediaUpload (1:1). */
export default function LogoUpload({ token, bucket, path, maxWidth, imageUrl, size = 96, onUploaded }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    if (busy) return;
    try {
      const img = await pickSquareImage(maxWidth);
      if (!img) return;
      setBusy(true);
      const { public_url } = await apiUploadMedia(token, img.uri, img.mimeType, bucket, path);
      await onUploaded(public_url);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Please try again.');
    }
    setBusy(false);
  };

  return (
    <TouchableOpacity onPress={pick} activeOpacity={0.8} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: size, height: size, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed',
        borderColor: c.border, backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          : <Text style={{ fontFamily: F.body, fontSize: 12, color: c.muted, textAlign: 'center', paddingHorizontal: 6 }}>Tap to add</Text>}
        {busy && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
      {!!imageUrl && !busy && (
        <Text style={{ fontFamily: F.body, fontSize: 12, color: c.muted, marginTop: 6, textDecorationLine: 'underline' }}>Replace image</Text>
      )}
    </TouchableOpacity>
  );
}
