import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '@/providers/AuthProvider'

export default function Index() {
  const { user, loading } = useAuth()
  if (loading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#0e0e10' }}><ActivityIndicator color="#7c64f0" /></View>
  return <Redirect href={user ? '/(tabs)/today' : '/auth'} />
}
