import { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import * as api from '../api'

const MODES = [
  { id: 'socratic', label: 'Socratique', icon: '❓', desc: 'Pose des questions qui dérangent' },
  { id: 'critique', label: 'Critique', icon: '⚡', desc: 'Détecte les failles logiques' },
  { id: 'explorer', label: 'Explorateur', icon: '🗺', desc: 'Penseurs, textes, cadres alternatifs' },
  { id: 'synthesis', label: 'Synthèse', icon: '◉', desc: 'Résume et relie' },
]

export default function AIPanel() {
  const { openFileId, openFile, toast, insertRef, dispatch } = useApp()
  const [mode, setMode] = useState('socratic')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const responseRef = useRef(null)

  const generate = async () => {
    if (!openFileId && mode !== 'profile') {
      toast('Ouvre une note pour que l\'IA la lise', 'error')
      return
    }
    setLoading(true)
    setResponse('')
    try {
      const { text } = await api.generateAI(openFileId, mode)
      setResponse(text)
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const generateProfile = async () => {
    setProfileLoading(true)
    setResponse('')
    try {
      const { text } = await api.generateAI(null, 'profile')
      setResponse(text)
      setMode('synthesis')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setProfileLoading(false)
    }
  }

  const insertIntoNote = () => {
    if (!response) return
    if (insertRef.current) {
      insertRef.current(`---\n*Suggestion IA (${mode}) :*\n\n${response}\n`)
      toast('Inséré dans la note')
    } else {
      toast('Ouvre une note d\'abord', 'error')
    }
  }

  const renderResponse = () => {
    if (!response) return null
    // Simple markdown-like formatting for AI response
    return response
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="ai-bold">{line.slice(2, -2)}</p>
        }
        if (line.startsWith('*') && line.endsWith('*')) {
          return <p key={i} className="ai-italic">{line.slice(1, -1)}</p>
        }
        if (line.startsWith('# ')) return <h3 key={i}>{line.slice(2)}</h3>
        if (line.startsWith('## ')) return <h4 key={i}>{line.slice(3)}</h4>
        if (line === '') return <br key={i} />
        return <p key={i}>{line}</p>
      })
  }

  return (
    <aside className="ai-panel">
      <div className="ai-header">
        <span className="ai-title">✦ Penseur</span>
        <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_AI' })} title="Fermer">✕</button>
      </div>

      {/* Context indicator */}
      {openFile && (
        <div className="ai-context">
          Contexte : <strong>{openFile.name.replace(/\.md$/i, '')}</strong>
        </div>
      )}

      {/* Mode tabs */}
      <div className="ai-modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`ai-mode-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
            title={m.desc}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="ai-mode-desc">
        {MODES.find(m => m.id === mode)?.desc}
      </div>

      {/* Generate button */}
      <button
        className="btn-primary ai-generate"
        onClick={generate}
        disabled={loading}
      >
        {loading ? '…' : 'Générer'}
      </button>

      {/* Response */}
      {response && (
        <div className="ai-response" ref={responseRef}>
          <div className="ai-response-text">{renderResponse()}</div>
          <button className="ai-insert-btn" onClick={insertIntoNote}>
            ↓ Insérer dans la note
          </button>
        </div>
      )}

      {/* Profile analysis */}
      <div className="ai-profile-section">
        <button
          className="btn-ghost ai-profile-btn"
          onClick={generateProfile}
          disabled={profileLoading}
        >
          {profileLoading ? '…' : '◎ Portrait philosophique'}
        </button>
        <div className="ai-profile-hint">Analyse toutes tes notes</div>
      </div>
    </aside>
  )
}
