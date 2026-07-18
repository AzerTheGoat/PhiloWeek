import { useEffect, useState } from 'react'
import { useApp } from '../context/useApp'
import Icon from './Icons'
import * as api from '../api'

export default function CloudCollaborationBar() {
  const { currentFile, fileConflicts, fileHistory, resolveFileConflict, openFile } = useApp()
  const [participants, setParticipants] = useState([])
  const [remoteUpdate, setRemoteUpdate] = useState(false)
  const [resolving, setResolving] = useState(false)
  const conflict = currentFile?.id ? fileConflicts[currentFile.id] : null

  useEffect(() => {
    if (!currentFile?.id || currentFile.type !== 'file') return undefined
    let active = true
    const heartbeat = async () => {
      try {
        const result = await api.heartbeatFilePresence(currentFile.id)
        if (active) {
          setParticipants(result.participants || [])
          const knownVersion = fileHistory[currentFile.id]?.contentVersion ?? Number(currentFile.content_version || 0)
          setRemoteUpdate(Number(result.content_version || 0) > knownVersion)
        }
      } catch (_) {}
    }
    heartbeat()
    const timer = setInterval(heartbeat, 15000)
    return () => {
      active = false
      clearInterval(timer)
      api.leaveFilePresence(currentFile.id).catch(() => {})
    }
  }, [currentFile?.id, currentFile?.type, fileHistory[currentFile?.id]?.contentVersion])

  const resolve = async (choice) => {
    setResolving(true)
    try { await resolveFileConflict(currentFile.id, choice) }
    finally { setResolving(false) }
  }

  const others = participants.filter(participant => !participant.is_me)
  const sharedAccess = currentFile?.access && !currentFile.access.is_owner
  const reloadRemote = async () => {
    if (currentFile.access?.can_edit && !window.confirm('Recharger la version cloud ? Toute modification locale non sauvegardée sera abandonnée.')) return
    await openFile(currentFile.id)
    setRemoteUpdate(false)
  }

  if (!conflict && !sharedAccess && others.length === 0 && !remoteUpdate) return null

  return (
    <div className={`cloud-collaboration-bar ${conflict ? 'has-conflict' : ''}`}>
      {conflict ? (
        <>
          <div className="cloud-conflict-copy">
            <Icon name="alert" size={18} />
            <span>
              <strong>Conflit de modification détecté.</strong>
              {' '}Une version plus récente existe sur le cloud; aucun contenu n’a été écrasé.
            </span>
          </div>
          <div className="cloud-conflict-actions">
            <button type="button" className="btn-ghost" disabled={resolving} onClick={() => resolve('cloud')}>Charger la version cloud</button>
            {conflict.local_content !== null && (
              <button type="button" className="btn-primary" disabled={resolving} onClick={() => resolve('local')}>Conserver ma version</button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="cloud-share-summary">
            <Icon name="cloud" size={17} />
            {sharedAccess && (
              <span>
                Partagé par <strong>{currentFile.access.owner_username}</strong>
                {' · '}{currentFile.access.can_edit ? 'modification autorisée' : 'lecture seule'}
                {currentFile.last_editor_username ? ` · dernière modification par ${currentFile.last_editor_username}` : ''}
              </span>
            )}
            {remoteUpdate && (
              <button type="button" className="cloud-update-button" onClick={reloadRemote}>Version plus récente · Recharger</button>
            )}
          </div>
          {others.length > 0 && (
            <div className="cloud-presence" title={others.map(item => item.username).join(', ')}>
              {others.slice(0, 4).map(participant => (
                <span className="cloud-presence-avatar" key={participant.username}>{participant.username.slice(0, 1).toUpperCase()}</span>
              ))}
              <span>{others.length} autre{others.length > 1 ? 's' : ''} en ligne</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
