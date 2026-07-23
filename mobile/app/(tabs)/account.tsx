import { Alert, StyleSheet, Text } from 'react-native'
import { Screen } from '@/components/Screen'
import { Card, PrimaryButton, Subtitle, Title } from '@/components/ui'
import { useAuth } from '@/providers/AuthProvider'

export default function AccountScreen() {
  const { user, signOut } = useAuth()
  const leave = () => Alert.alert('Se deconnecter ?', 'La session securisee sera retiree de cet iPhone.', [
    { text: 'Annuler', style: 'cancel' }, { text: 'Se deconnecter', style: 'destructive', onPress: () => { void signOut() } },
  ])
  return <Screen>
    <Title>Compte</Title>
    <Subtitle>Les donnees restent synchronisees avec ton espace PhiloWeek.</Subtitle>
    <Card><Text style={styles.label}>CONNECTE EN TANT QUE</Text><Text style={styles.username}>{user?.username}</Text><Text style={styles.detail}>La session est stockee dans le trousseau securise de cet iPhone.</Text></Card>
    <Card><Text style={styles.label}>MVP MOBILE</Text><Text style={styles.detail}>Notes, aujourd’hui, capture et articles sont les premieres fondations de l’app native.</Text></Card>
    <PrimaryButton label="Se deconnecter" onPress={leave} />
  </Screen>
}

const styles = StyleSheet.create({ label: { color: '#a18ef6', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, username: { color: '#f2f2f4', fontSize: 22, fontWeight: '800' }, detail: { color: '#aaaab2', fontSize: 14, lineHeight: 21 } })
