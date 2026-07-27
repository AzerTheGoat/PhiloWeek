import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import * as api from '../api'
import Icon from './Icons'

export default function RequiredChanges() {
  const { openFile, toast } = useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.getRequiredChanges()) } catch (error) { toast(error.message, 'error') }
    finally { setLoading(false) }
  }, [toast])
  useEffect(() => { load() }, [load])
  const save = useCallback(async () => {
    try {
      const file = await api.getFile(editing.file_id)
      await api.updateFile(file.id, { content: updateMarkedItem(file.content, editing), base_version: Number(file.content_version || 0) })
      setEditing(null)
      await load()
      toast('Modification enregistrée et marquage retiré', 'success')
    } catch (error) { toast(error.message, 'error') }
  }, [editing, load, toast])
  return (
    <section className="required-changes-page">
      <header className="required-changes-head">
        <div><span>Révision éditoriale</span><h2>À modifier</h2><p>Questions, définitions et cartes marquées pendant tes révisions.</p></div>
        <button type="button" className="btn-ghost" onClick={load}><Icon name="refresh" size={16} /> Actualiser</button>
      </header>
      {loading ? <div className="required-changes-empty">Chargement…</div> : items.length === 0 ? (
        <div className="required-changes-empty"><Icon name="check" size={28} /><strong>Tout est à jour</strong><p>Utilise « À modifier » sur une carte de révision pour l’ajouter ici.</p></div>
      ) : <div className="required-changes-list">{items.map(item => (
        <article key={`${item.file_id}:${item.kind}:${item.item_id || item.index}`}>
          <div className="required-change-meta"><span>{kindLabel(item.kind)}</span><button type="button" onClick={() => openFile(item.file_id)}>{item.file_name.replace(/\.(json|md)$/i, '')}</button></div>
          <h3>{item.title}</h3>{item.answer && <p>{item.answer}</p>}
          <button type="button" className="btn-primary" onClick={() => setEditing({ ...item })}><Icon name="edit" size={15} /> Modifier</button>
        </article>
      ))}</div>}
      {editing && <div className="required-change-modal-backdrop" onMouseDown={() => setEditing(null)}>
        <form className="required-change-modal" onSubmit={event => { event.preventDefault(); save() }} onMouseDown={event => event.stopPropagation()}>
          <span>{kindLabel(editing.kind)} · {editing.file_name}</span><h3>Corriger cet élément</h3>
          <label>Titre ou question<textarea value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label>
          <label>Réponse ou contenu<textarea value={editing.answer} onChange={event => setEditing({ ...editing, answer: event.target.value })} /></label>
          {editing.kind !== 'graph' && <label>Explication ou exemple<textarea value={editing.explanation} onChange={event => setEditing({ ...editing, explanation: event.target.value })} /></label>}
          <div><button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button><button type="submit" className="btn-primary">Enregistrer et retirer</button></div>
        </form>
      </div>}
    </section>
  )
}

function updateMarkedItem(content, item) {
  let parsed; let fenced = false; let match = null
  try { parsed = JSON.parse(content) } catch (_) {
    match = String(content).match(/```philoweek-graph\s*([\s\S]*?)```/i)
    if (!match) throw new Error('Format du fichier non reconnu.')
    parsed = JSON.parse(match[1]); fenced = true
  }
  const collection = item.kind === 'questionnaire' ? parsed.questions : item.kind === 'definition' ? parsed.definitions : parsed.nodes || parsed.cards
  if (!Array.isArray(collection)) throw new Error('Élément introuvable dans le fichier.')
  const index = item.item_id ? collection.findIndex(row => String(row?.id || '') === item.item_id) : Number(item.index)
  const row = collection[index]
  if (!row) throw new Error('Cet élément a été déplacé ou supprimé.')
  if (item.kind === 'questionnaire') Object.assign(row, { prompt: item.title, answer: item.answer, explanation: item.explanation })
  else if (item.kind === 'definition') Object.assign(row, { term: item.title, definition: item.answer, example: item.explanation })
  else if (item.kind === 'actor') Object.assign(row, { name: item.title, summary: item.answer, details: item.explanation })
  else Object.assign(row, { title: item.title, body: item.answer })
  delete row.require_change
  parsed.modified = new Date().toISOString()
  const json = JSON.stringify(parsed, null, 2)
  return fenced ? content.replace(match[0], `\`\`\`philoweek-graph\n${json}\n\`\`\``) : json
}

function kindLabel(kind) {
  return ({ questionnaire: 'Question', definition: 'Définition', actor: 'Carte acteur', graph: 'Carte mentale' })[kind] || 'Élément'
}
