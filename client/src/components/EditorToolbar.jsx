import Icon from './Icons'

export default function EditorToolbar({ format, onHandwriting, handwritingOpen = false, onUndo, onRedo }) {
  const btn = (label, before, after = before, title) => (
    <button
      key={label}
      className="toolbar-btn"
      title={title || label}
      onMouseDown={e => { e.preventDefault(); format(before, after) }}
    >
      {label}
    </button>
  )

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button type="button" className="toolbar-btn" title="Annuler (Ctrl+Z)" onMouseDown={event => { event.preventDefault(); onUndo?.() }}>
          <Icon name="undo" size={16} />
        </button>
        <button type="button" className="toolbar-btn" title="Retablir (Ctrl+Maj+Z)" onMouseDown={event => { event.preventDefault(); onRedo?.() }}>
          <Icon name="redo" size={16} />
        </button>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <button
          type="button"
          className={`toolbar-btn handwriting-toolbar-btn ${handwritingOpen ? 'active' : ''}`}
          title="Écrire au stylo puis transformer en texte"
          onMouseDown={event => {
            event.preventDefault()
            onHandwriting?.()
          }}
        >
          <Icon name="pen" size={16} /> <span>Stylo</span>
        </button>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        {btn('B', '**', '**', 'Gras')}
        {btn('I', '_', '_', 'Italique')}
        {btn('S̶', '~~', '~~', 'Barré')}
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        {btn('H1', '# ', '', 'Titre 1')}
        {btn('H2', '## ', '', 'Titre 2')}
        {btn('H3', '### ', '', 'Titre 3')}
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        {btn('•', '- ', '', 'Liste')}
        {btn('1.', '1. ', '', 'Liste numérotée')}
        {btn('❝', '> ', '', 'Citation')}
        {btn('<>', '`', '`', 'Code inline')}
        {btn('```', '```\n', '\n```', 'Bloc de code')}
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        {btn('—', '\n---\n', '', 'Séparateur')}
        <button
          className="toolbar-btn"
          title="Tableau"
          onMouseDown={e => {
            e.preventDefault()
            format('| Col 1 | Col 2 |\n| --- | --- |\n| ', ' | |', 'Tableau')
          }}
        >⊞</button>
        <button
          className="toolbar-btn"
          title="Lien"
          onMouseDown={e => {
            e.preventDefault()
            format('[', '](url)')
          }}
        >🔗</button>
        <button
          className="toolbar-btn"
          title="Lien wiki [[…]]"
          onMouseDown={e => {
            e.preventDefault()
            format('[[', ']]')
          }}
        >[[]]</button>
      </div>
    </div>
  )
}
