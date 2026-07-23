import { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export function Title({ children }: { children: ReactNode }) { return <Text style={styles.title}>{children}</Text> }
export function Subtitle({ children }: { children: ReactNode }) { return <Text style={styles.subtitle}>{children}</Text> }
export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View> }
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.primaryText}>{label}</Text></Pressable>
}
export function Field(props: React.ComponentProps<typeof TextInput>) { return <TextInput placeholderTextColor="#83838b" style={styles.field} {...props} /> }

const styles = StyleSheet.create({
  title: { color: '#f2f2f4', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#aaaab2', fontSize: 15, lineHeight: 22 },
  card: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: '#1a1a1e', borderWidth: 1, borderColor: '#2b2b31' },
  field: { minHeight: 52, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#1a1a1e', borderWidth: 1, borderColor: '#31313a', color: '#f2f2f4', fontSize: 16 },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#7c64f0' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.45 },
})
