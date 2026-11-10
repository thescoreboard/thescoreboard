import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Let the user pick a square-cropped image, resized to `maxWidth` and
 * re-encoded as JPEG (matches the web MediaUpload: 1:1 crop, compressed).
 * Returns null if the user cancels.
 */
export async function pickSquareImage(maxWidth: number): Promise<{ uri: string; mimeType: string } | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });
  if (res.canceled || !res.assets?.length) return null;
  const out = await ImageManipulator.manipulateAsync(
    res.assets[0].uri,
    [{ resize: { width: maxWidth } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: out.uri, mimeType: 'image/jpeg' };
}
