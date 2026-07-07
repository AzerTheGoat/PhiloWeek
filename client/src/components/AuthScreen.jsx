import { useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'

export default function AuthScreen() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  return (
    <div className="welcome auth-screen">
      <div className="welcome-inner">
        <div className="welcome-logo"><Icon name="ai" size={42} /></div>
        <h1>Opuscule</h1>
        <p>Ton espace de pensée philosophique</p>
        {mode === 'login' ? <LoginForm onSwitch={() => setMode('register')} /> : <RegisterForm onSwitch={() => setMode('login')} />}
      </div>
    </div>
  )
}

function LoginForm({ onSwitch }) {
  const { login, toast } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      toast(err.message || 'Connexion impossible', 'error')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="modal-body auth-form">
      <input
        autoFocus
        type="text"
        placeholder="Nom d'utilisateur"
        value={username}
        onChange={e => setUsername(e.target.value)}
        className="modal-input"
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="modal-input"
        autoComplete="current-password"
      />
      <div className="modal-actions">
        <button type="submit" className="btn-primary" disabled={!username.trim() || !password || submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
      <button type="button" className="btn-ghost auth-switch" onClick={onSwitch}>
        Pas encore de compte ? Inscris-toi
      </button>
    </form>
  )
}

function RegisterForm({ onSwitch }) {
  const { register, toast } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (password !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return }
    if (password.length < 10) { toast('Minimum 10 caractères', 'error'); return }
    setSubmitting(true)
    try {
      await register(username.trim(), password)
    } catch (err) {
      toast(err.message || 'Inscription impossible', 'error')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="modal-body auth-form">
      <input
        autoFocus
        type="text"
        placeholder="Nom d'utilisateur (3-32 caractères)"
        value={username}
        onChange={e => setUsername(e.target.value)}
        className="modal-input"
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="Mot de passe (min. 10 caractères)"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="modal-input"
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="Confirmer le mot de passe"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        className="modal-input"
        autoComplete="new-password"
      />
      <div className="modal-actions">
        <button type="submit" className="btn-primary" disabled={!username.trim() || !password || !confirm || submitting}>
          {submitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </div>
      <button type="button" className="btn-ghost auth-switch" onClick={onSwitch}>
        Déjà un compte ? Connecte-toi
      </button>
    </form>
  )
}
