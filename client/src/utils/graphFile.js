export function isGraphFile(file) {
  const content = file?.content || ''
  return /philoweek_type:\s*graph/i.test(content) || /```philoweek-graph\s*\n/i.test(content)
}

export function createGraphMarkdown(title) {
  const now = new Date().toISOString()
  const graph = {
    version: 1,
    nodes: [
      {
        id: makeId(),
        type: 'idea',
        title: 'Idee centrale',
        body: 'Double-clique pour modifier cette carte.',
        x: 120,
        y: 110,
      },
      {
        id: makeId(),
        type: 'objective',
        title: 'Objectif',
        body: 'Ajoute une direction concrete.',
        x: 430,
        y: 230,
      },
    ],
    edges: [],
  }

  return `---\ntitle: ${title}\ntags: [graphe]\nphiloweek_type: graph\ncreated: ${now}\nmodified: ${now}\n---\n\n# ${title}\n\n\`\`\`philoweek-graph\n${JSON.stringify(graph, null, 2)}\n\`\`\`\n`
}

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}
