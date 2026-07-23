import { PropsWithChildren } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollView, StyleSheet, ViewStyle } from 'react-native'

export function Screen({ children, scroll = true, style }: PropsWithChildren<{ scroll?: boolean; style?: ViewStyle }>) {
  const content = scroll ? <ScrollView contentContainerStyle={[styles.content, style]}>{children}</ScrollView> : children
  return <SafeAreaView style={styles.safe}>{content}</SafeAreaView>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0e0e10' },
  content: { padding: 20, gap: 16 },
})
