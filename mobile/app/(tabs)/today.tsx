import { useQuery } from '@tanstack/react-query'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/Screen'
import { Card, Subtitle, Title } from '@/components/ui'
import { getTodos } from '@/services/api'
import { useAuth } from '@/providers/AuthProvider'

export default function TodayScreen() {
  const { user, token } = useAuth()
  const todos = useQuery({ queryKey: ['todos'], queryFn: () => getTodos(token!), enabled: Boolean(token) })
  return <Screen>
    <Text style={styles.eyebrow}>AUJOURD’HUI</Text>
    <Title>Bonjour, {user?.username}</Title>
    <Subtitle>Ton point de depart pour ecrire, avancer et respirer.</Subtitle>
    <Card>
      <Text style={styles.cardTitle}>Taches ouvertes</Text>
      {todos.isLoading && <Text style={styles.muted}>Chargement...</Text>}
      {todos.data?.slice(0, 4).map(todo => <Text key={todo.id} style={styles.todo}>○  {todo.title}</Text>)}
      {!todos.isLoading && !todos.data?.length && <Text style={styles.muted}>Rien d’urgent. Profite de ton temps.</Text>}
    </Card>
    <Card>
      <Text style={styles.cardTitle}>Focus</Text>
      <Text style={styles.focus}>25:00</Text>
      <Text style={styles.muted}>Le chronometre natif arrive dans le jalon suivant.</Text>
    </Card>
  </Screen>
}

const styles = StyleSheet.create({
  eyebrow: { color: '#a18ef6', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 }, cardTitle: { color: '#f2f2f4', fontSize: 17, fontWeight: '800' }, muted: { color: '#aaaab2', fontSize: 14 }, todo: { color: '#e6e6ea', fontSize: 16, paddingVertical: 4 }, focus: { color: '#a18ef6', fontSize: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
})
