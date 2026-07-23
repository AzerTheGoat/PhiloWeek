import { useQuery } from '@tanstack/react-query'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/Screen'
import { Card, Subtitle, Title } from '@/components/ui'
import { getArticles } from '@/services/api'
import { useAuth } from '@/providers/AuthProvider'

export default function ArticlesScreen() {
  const { token } = useAuth()
  const articles = useQuery({ queryKey: ['articles'], queryFn: () => getArticles(token!), enabled: Boolean(token) })
  return <Screen scroll={false} style={styles.page}>
    <View style={styles.heading}><Title>Articles</Title><Subtitle>Les textes publies par la communaute.</Subtitle></View>
    <FlatList data={articles.data || []} keyExtractor={article => article.id} contentContainerStyle={styles.list} refreshing={articles.isFetching} onRefresh={() => articles.refetch()} ListEmptyComponent={<Card><Text style={styles.muted}>{articles.isLoading ? 'Chargement...' : 'Aucun article pour le moment.'}</Text></Card>} renderItem={({ item }) => (
      <Card><Text style={styles.date}>{item.published_on || 'Brouillon'}</Text><Text style={styles.title}>{item.title}</Text>{item.excerpt ? <Text style={styles.excerpt}>{item.excerpt}</Text> : null}<Text style={styles.meta}>{item.author_username || 'Compte supprime'} · {item.comment_count || 0} commentaire(s)</Text></Card>
    )} />
  </Screen>
}

const styles = StyleSheet.create({ page: { flex: 1, padding: 20 }, heading: { gap: 8, marginBottom: 18 }, list: { gap: 12, paddingBottom: 24 }, date: { color: '#a18ef6', fontSize: 12, fontWeight: '800' }, title: { color: '#f2f2f4', fontSize: 19, fontWeight: '800' }, excerpt: { color: '#d1d1d6', fontSize: 15, lineHeight: 22 }, meta: { color: '#aaaab2', fontSize: 13 }, muted: { color: '#aaaab2' },
})
