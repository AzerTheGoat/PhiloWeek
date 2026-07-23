import { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import { Screen } from '@/components/Screen'
import { Field, PrimaryButton, Subtitle, Title } from '@/components/ui'
import { useAuth } from '@/providers/AuthProvider'

export default function AuthScreen() {
  const { user, loading, signIn, signUp } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [registerMode, setRegisterMode] = useState(false)
  const [sending, setSending] = useState(false)
  if (loading) return null
  if (user) return <Redirect href="/(tabs)/today" />

  const submit = async () => {
    setSending(true)
    try {
      if (registerMode) await signUp(username.trim(), password)
      else await signIn(username.trim(), password)
    } catch (error) {
      Alert.alert('Connexion impossible', error instanceof Error ? error.message : 'Reessaie dans un instant.')
    } finally { setSending(false) }
  }

  return (
    <Screen scroll={false} style={styles.content}>
      <KeyboardAvoidingView style={styles.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <Text style={styles.brand}>PhiloWeek</Text>
          <Title>{registerMode ? 'Creer ton espace' : 'Bon retour'}</Title>
          <Subtitle>Une version native, personnelle et synchronisee avec tes notes.</Subtitle>
        </View>
        <View style={styles.form}>
          <Field value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="Identifiant" />
          <Field value={password} onChangeText={setPassword} secureTextEntry placeholder="Mot de passe" />
          <PrimaryButton disabled={sending || !username.trim() || password.length < 10} onPress={submit} label={sending ? 'Connexion...' : registerMode ? 'Creer mon compte' : 'Se connecter'} />
          <Text onPress={() => setRegisterMode(value => !value)} style={styles.switch}>{registerMode ? 'J’ai deja un compte' : 'Creer un compte'}</Text>
        </View>
      </KeyboardAvoidingView>
      {sending && <ActivityIndicator color="#7c64f0" />}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 24 }, grow: { flex: 1, justifyContent: 'center' }, hero: { gap: 10, marginBottom: 42 }, brand: { color: '#a18ef6', fontSize: 18, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' }, form: { gap: 14 }, switch: { padding: 12, color: '#a18ef6', textAlign: 'center', fontSize: 15, fontWeight: '700' },
})
