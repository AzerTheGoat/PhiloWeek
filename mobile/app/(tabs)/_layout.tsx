import { Redirect, Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useAuth } from '@/providers/AuthProvider'

const icon = (value: string) => () => <Text style={{ fontSize: 18 }}>{value}</Text>

export default function TabLayout() {
  const { user, loading } = useAuth()
  if (!loading && !user) return <Redirect href="/auth" />
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#7c64f0', tabBarStyle: { backgroundColor: '#16161a', borderTopColor: '#2b2b31' } }}>
      <Tabs.Screen name="today" options={{ title: "Aujourd'hui", tabBarIcon: icon('◷') }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes', tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="capture" options={{ title: 'Capturer', tabBarIcon: icon('＋') }} />
      <Tabs.Screen name="articles" options={{ title: 'Articles', tabBarIcon: icon('◉') }} />
      <Tabs.Screen name="account" options={{ title: 'Compte', tabBarIcon: icon('◌') }} />
    </Tabs>
  )
}
