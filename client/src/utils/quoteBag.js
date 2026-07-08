// Sélection « bien faite » d'une citation aléatoire : un sac mélangé
// (shuffle bag) plutôt qu'un tirage uniforme. On parcourt toutes les
// citations dans un ordre aléatoire sans répétition ; un nouveau cycle ne
// recommence qu'une fois toutes les citations vues, et jamais avec celle
// qu'on vient d'afficher (pas de doublon d'affilée entre deux cycles).
//
// L'état du sac (ids restants + dernière affichée) est persisté dans
// localStorage, donc la progression survit aux reloads.

const BAG_KEY = 'pw-quote-bag'

function loadBag() {
  try {
    const raw = localStorage.getItem(BAG_KEY)
    if (!raw) return { ids: [], last: null }
    const bag = JSON.parse(raw)
    return {
      ids: Array.isArray(bag.ids) ? bag.ids.map(String) : [],
      last: bag.last != null ? String(bag.last) : null,
    }
  } catch (_) {
    return { ids: [], last: null }
  }
}

function saveBag(bag) {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(bag))
  } catch (_) {
    // localStorage indisponible : on tirera simplement au hasard à chaque fois.
  }
}

// Fisher–Yates
function shuffle(list) {
  const arr = list.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Renvoie la prochaine citation à afficher (objet quote), ou null si aucune.
// Fait avancer le sac (à appeler une fois par affichage voulu).
export function pickNextQuote(quotes) {
  if (!Array.isArray(quotes) || quotes.length === 0) return null
  if (quotes.length === 1) {
    saveBag({ ids: [], last: String(quotes[0].id) })
    return quotes[0]
  }

  const byId = new Map(quotes.map(q => [String(q.id), q]))
  const bag = loadBag()

  // Retire du sac les citations supprimées entre-temps.
  let remaining = bag.ids.filter(id => byId.has(id))

  if (remaining.length === 0) {
    // Nouveau cycle : on remélange tout.
    remaining = shuffle([...byId.keys()])
    // Évite de rejouer immédiatement la dernière citation du cycle précédent.
    if (bag.last && remaining[0] === bag.last && remaining.length > 1) {
      remaining.push(remaining.shift())
    }
  }

  const chosenId = remaining.shift()
  saveBag({ ids: remaining, last: chosenId })
  return byId.get(chosenId) || quotes[0]
}
