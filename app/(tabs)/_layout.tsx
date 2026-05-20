import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useTheme } from '../../src/hooks/useTheme';
import { F } from '../../src/theme';

function TabIcon({ label, abbrev, focused, color }: { label: string; abbrev: string; focused: boolean; color: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 4, gap: 3 }}>
      <View style={{
        width: 36, height: 22, borderRadius: 6,
        backgroundColor: focused ? color + '1A' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontFamily: F.display, fontSize: 9, color, letterSpacing: 0.5 }}>{abbrev}</Text>
      </View>
      <Text style={{ fontFamily: F.bold, fontSize: 8, color, fontWeight: focused ? '700' : '500', letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown:       false,
        tabBarStyle:       {
          backgroundColor:    theme.colors.surface,
          borderTopColor:     theme.colors.border,
          borderTopWidth:     1,
          height:             64,
          paddingBottom:      8,
        },
        tabBarActiveTintColor:   theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Home" abbrev="HM" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Explore" abbrev="EX" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="organiser"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Organise" abbrev="ORG" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon label="Profile" abbrev="ME" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
