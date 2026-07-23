import { useState } from 'react'
import { Alert, StyleSheet, TextInput } from 'react-native'
import { Screen } from '@/components/Screen'
import { PrimaryButton, Subtitle, Title } from '@/components/ui'
import { createIdea } from '@/services/api'
import { useAuth } from '@/providers/AuthProvider'

export default function CaptureScreen() {
  const { token } = useAuth()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!text.trim() || !token) return
    setSaving(true)
    try { await createIdea(token, text.trim()); setText(''); Alert.alert('Idee enregistree', 'Elle t’attend dans ta Boite a idees sur le web.') }
    catch (error) { Alert.alert('Enregistrement impossible', error instanceof Error ? error.message : 'Reessaie.') }
    finally { setSaving(false) }
  }
  return <Screen>
    <Title>Capturer</Title>
    <Subtitle>Une idee merite d’etre gardee avant de disparaitre.</Subtitle>
    <TextInput autoFocus multiline value={text} onChangeText={setText} placeholder="Ecris sans te censurer..." placeholderTextColor="#83838b" style={styles.input} textAlignVertical="top" />
    <PrimaryButton label={saving ? 'Enregistrement...' : 'Garder cette idee'} onPress={save} disabled={saving || !text.trim()} />
  </Screen>
}

const styles = StyleSheet.create({ input: { minHeight: 260, padding: 16, borderRadius: 16, color: '#f2f2f4', backgroundColor: '#1a1a1e', borderWidth: 1, borderColor: '#31313a', fontSize: 18, lineHeight: 27 } })
