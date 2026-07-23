import { useQuery } from '@tanstack/react-query'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/Screen'
import { Card, Subtitle, Title } from '@/components/ui'
import { FileNode, getFiles } from '@/services/api'
import { useAuth } from '@/providers/AuthProvider'

type Row = FileNode & { depth: number }
function flatten(nodes: FileNode[], depth = 0): Row[] {
  return nodes.flatMap(node => [{ ...node, depth }, ...flatten(node.children || [], depth + 1)])
}

export default function NotesScreen() {
  const { token } = useAuth()
  const files = useQuery({ queryKey: ['files'], queryFn: () => getFiles(token!), enabled: Boolean(token) })
  const rows = flatten(files.data || [])
  return <Screen scroll={false} style={styles.page}>
    <View style={styles.heading}><Title>Notes</Title><Subtitle>Ton espace de pensee, synchronise avec le web.</Subtitle></View>
    {files.isLoading ? <Text style={styles.muted}>Chargement des fichiers...</Text> : (
      <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={styles.list} ListEmptyComponent={<Card><Text style={styles.muted}>Aucune note lisible pour le moment.</Text></Card>} renderItem={({ item }) => (
        <View style={[styles.row, { paddingLeft: 14 + item.depth * 18 }]}><Text style={styles.icon}>{item.type === 'folder' ? '▸' : '•'}</Text><Text style={styles.name}>{item.name}</Text></View>
      )} />
    )}
  </Screen>
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20 }, heading: { gap: 8, marginBottom: 18 }, list: { gap: 3, paddingBottom: 24 }, row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, backgroundColor: '#1a1a1e' }, icon: { color: '#a18ef6', fontSize: 17 }, name: { color: '#f2f2f4', fontSize: 16 }, muted: { color: '#aaaab2' },
})
