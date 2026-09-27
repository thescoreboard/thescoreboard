import { Stack } from 'expo-router';

export default function ScoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#080b08' },
        animation: 'slide_from_bottom',
      }}
    />
  );
}
