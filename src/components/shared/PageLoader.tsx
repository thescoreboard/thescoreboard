import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export default function PageLoader() {
  const { theme } = useTheme();
  const dots = [useRef(new Animated.Value(0)).current,
                useRef(new Animated.Value(0)).current,
                useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.delay((dots.length - i) * 180),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={[s.wrap, { backgroundColor: theme.colors.bg }]}>
      <Text style={[s.brand, { color: theme.colors.ink }]}>
        <Text style={{ color: theme.colors.primary }}>THE</Text>
        <Text style={{ color: theme.colors.ink }}>SCORE</Text>
        <Text style={{ color: theme.colors.primary }}>BOARD</Text>
      </Text>
      <View style={s.dots}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[s.dot, { backgroundColor: theme.colors.primary, opacity: dot }]}
          />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  brand: { fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  dots:  { flexDirection: 'row', gap: 8 },
  dot:   { width: 8, height: 8, borderRadius: 4 },
});
