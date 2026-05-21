import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/auth';
import { F } from '../../src/theme';

function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 8, gap: 4 }}>
      <Text style={{ fontFamily: F.bold, fontSize: 10, color, fontWeight: focused ? '700' : '500', letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ width: focused ? 18 : 0, height: 2, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();
  const mode = useAuthStore(s => s.mode);
  const isPlayer = mode === 'player';

  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarStyle:             {
          backgroundColor:    theme.colors.surface,
          borderTopColor:     theme.colors.border,
          borderTopWidth:     1,
          height:             66,
          paddingBottom:      8,
        },
        tabBarActiveTintColor:   theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarShowLabel:         false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon label="Home"     focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon label="Explore"  focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="organiser"
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon label={isPlayer ? 'Matches' : 'Organise'} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ color, focused }) => <TabIcon label={isPlayer ? 'Dashboard' : 'Profile'} focused={focused} color={color} /> }}
      />
    </Tabs>
  );
}
