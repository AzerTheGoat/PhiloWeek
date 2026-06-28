import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as api from '../api'

const MODES = [
  { id: 'socratic', label: 'Socratique', icon: '?', desc: 'Pose des questions qui dérangent' },
  { id: 'critique', label: 'Critique', icon: '!', desc: 'Détecte les failles logiques' },
  { id: 'explorer', label: 'Explorateur', icon: '↗', desc: 'Penseurs, textes, cadres alternatifs' },
  { id: 'synthesis', label: 'Synthèse', icon: '◉', desc: 'Résume et relie' },
]

const DEFAULT_OUTPUT_TOKENS = 1200

export default function AIPanel() {
  const { openFileId, currentFile, toast, insertRef, dispatch } = useApp()
  const [mode, setMode] = useState('socratic')
  const [modelsConfig, setModelsConfig] = useState(null)
  const [provider, setProvider] = useState(() => localStorage.getItem('pw-ai-provider') || 'anthropic')
  const [model, setModel] = useState(() => localStorage.getItem('pw-ai-model') || 'claude-sonnet-4-6')
  const [maxTokens, setMaxTokens] = useState(() => Number(localStorage.getItem('pw-ai-output-tokens')) || DEFAULT_OUTPUT_TOKENS)
  const [estimate, setEstimate] = useState(null)
  const [responseCost, setResponseCost] = useState(null)
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const responseRef = useRef(null)

  const providerConfig = modelsConfig?.providers?.[provider]
  const models = providerConfig?.models || []
  const selectedModel = models.find(m => m.id === model) || models[0]

  const requestOptions = useMemo(() => ({
    provider,
    model: selectedModel?.id || model,
    max_tokens: maxTokens,
  }), [provider, selectedModel?.id, model, maxTokens])

  useEffect(() => {
    let mounted = true
    api.getAIModels()
      .then(config => {
        if (!mounted) return
        setModelsConfig(config)
        const hasProvider = Boolean(config.providers?.[provider])
        const nextProvider = hasProvider ? provider : config.defaultProvider
        const nextModels = config.providers?.[nextProvider]?.models || []
        const hasModel = nextModels.some(m => m.id === model)
        const nextModel = hasModel ? model : (nextModels[0]?.id || config.defaultModel)
        setProvider(nextProvider)
        setModel(nextModel)
      })
      .catch(err => toast(err.message, 'error'))
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!providerConfig) return
    if (!models.some(m => m.id === model) && models[0]) {
      setModel(models[0].id)
      setMaxTokens(models[0].defaultOutputTokens || DEFAULT_OUTPUT_TOKENS)
    }
  }, [provider, providerConfig, models, model])

  useEffect(() => {
    localStorage.setItem('pw-ai-provider', provider)
    localStorage.setItem('pw-ai-model', selectedModel?.id || model)
    localStorage.setItem('pw-ai-output-tokens', String(maxTokens))
  }, [provider, selectedModel?.id, model, maxTokens])

  useEffect(() => {
    if (!selectedModel) return
    if (!openFileId && mode !== 'profile') {
      setEstimate(null)
      return
    }

    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const data = await api.estimateAI({
          file_id: mode === 'profile' ? null : openFileId,
          mode,
          ...requestOptions,
        })
        if (!ctrl.signal.aborted) setEstimate(data.cost)
      } catch {
        if (!ctrl.signal.aborted) setEstimate(null)
      }
    }, 250)

    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [openFileId, mode, requestOptions, selectedModel, currentFile?.id])

  const generate = async () => {
    if (!openFileId && mode !== 'profile') {
      toast('Ouvre une note pour que l\'IA la lise', 'error')
      return
    }
    setLoading(true)
    setResponse('')
    setResponseCost(null)
    try {
      const { text, cost } = await api.generateAI(openFileId, mode, requestOptions)
      setResponse(text)
      setResponseCost(cost || null)
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
    setResponseCost(null)
    try {
      const { text, cost } = await api.generateAI(null, 'profile', requestOptions)
      setResponse(text)
      setResponseCost(cost || null)
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
        <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_AI' })} title="Fermer">×</button>
      </div>

      {currentFile && (
        <div className="ai-context">
          Contexte : <strong>{currentFile.name.replace(/\.md$/i, '')}</strong>
        </div>
      )}

      <div className="ai-settings">
        <div className="ai-provider-tabs">
          {modelsConfig && Object.entries(modelsConfig.providers).map(([id, cfg]) => (
            <button
              key={id}
              className={`ai-provider-btn ${provider === id ? 'active' : ''}`}
              onClick={() => {
                setProvider(id)
                setResponseCost(null)
                const firstModel = cfg.models[0]
                if (firstModel) {
                  setModel(firstModel.id)
                  setMaxTokens(firstModel.defaultOutputTokens || DEFAULT_OUTPUT_TOKENS)
                }
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        <label className="ai-field">
          <span>Modèle</span>
          <select
            value={selectedModel?.id || model}
            onChange={e => {
              const next = models.find(m => m.id === e.target.value)
              setModel(e.target.value)
              if (next?.defaultOutputTokens) setMaxTokens(next.defaultOutputTokens)
              setResponseCost(null)
            }}
          >
            {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>

        {selectedModel && (
          <div className="ai-model-desc">{selectedModel.description}</div>
        )}

        <label className="ai-field">
          <span>Sortie prédite</span>
          <input
            type="number"
            min="100"
            max="8000"
            step="100"
            value={maxTokens}
            onChange={e => setMaxTokens(Number(e.target.value) || DEFAULT_OUTPUT_TOKENS)}
          />
        </label>

        <input
          className="ai-token-slider"
          type="range"
          min="100"
          max="4000"
          step="100"
          value={Math.min(maxTokens, 4000)}
          onChange={e => setMaxTokens(Number(e.target.value))}
        />

        <CostLine cost={responseCost || estimate} actual={Boolean(responseCost)} />
      </div>

      <div className="ai-modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`ai-mode-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => {
              setMode(m.id)
              setResponseCost(null)
            }}
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

      <button
        className="btn-primary ai-generate"
        onClick={generate}
        disabled={loading || !selectedModel}
      >
        {loading ? '...' : 'Générer'}
      </button>

      {response && (
        <div className="ai-response" ref={responseRef}>
          <div className="ai-response-text">{renderResponse()}</div>
          <button className="ai-insert-btn" onClick={insertIntoNote}>
            ↓ Insérer dans la note
          </button>
        </div>
      )}

      <div className="ai-profile-section">
        <button
          className="btn-ghost ai-profile-btn"
          onClick={generateProfile}
          disabled={profileLoading || !selectedModel}
        >
          {profileLoading ? '...' : '◎ Portrait philosophique'}
        </button>
        <div className="ai-profile-hint">Analyse toutes tes notes</div>
      </div>
    </aside>
  )
}

function CostLine({ cost, actual }) {
  if (!cost) {
    return <div className="ai-cost muted">Estimation indisponible</div>
  }

  return (
    <div className="ai-cost">
      <span>{actual ? 'Coût réel' : 'Coût estimé'}</span>
      <strong>{formatUsd(cost.totalUsd)}</strong>
      <small>{formatTokens(cost.inputTokens)} in · {formatTokens(cost.outputTokens)} out</small>
    </div>
  )
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return '$0.0000'
  if (value < 0.0001) return '< $0.0001'
  return `$${value.toFixed(4)}`
}

function formatTokens(value) {
  if (!Number.isFinite(value)) return '0'
  return Intl.NumberFormat('fr-FR').format(Math.round(value))
}
