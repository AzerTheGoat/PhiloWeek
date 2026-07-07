#!/usr/bin/env node
// Rattache toutes les données orphelines (user_id IS NULL, créées avant
// l'authentification) à un compte existant. Idempotent : ré-exécutable
// sans risque, ne fait rien si tout est déjà rattaché.
//
// Usage : node server/scripts/claim-legacy-data.js <username>
//
// À exécuter UNE SEULE FOIS, manuellement, juste après le premier
// déploiement de la version avec authentification, par la personne qui
// possédait déjà ces données — après avoir créé son propre compte via le
// formulaire d'inscription normal.

const { getDb, backupDb } = require('../db')

const TABLES = ['files', 'timer_sessions', 'voice_notes', 'inbox_resources', 'inbox_ideas', 'quotes', 'questionnaire_results', 'fact_checks', 'todos', 'agenda_practices', 'agenda_checks']

async function main() {
  const username = process.argv[2]
  if (!username) {
    console.error('Usage : node server/scripts/claim-legacy-data.js <username>')
    process.exit(1)
  }

  const db = getDb()
  const user = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username)
  if (!user) {
    console.error(`Aucun compte trouvé pour "${username}". Crée-le d'abord via le formulaire d'inscription.`)
    process.exit(1)
  }

  const counts = TABLES.map(table => ({
    table, n: db.prepare(`SELECT COUNT(*) as n FROM ${table} WHERE user_id IS NULL`).get().n,
  }))
  const total = counts.reduce((sum, c) => sum + c.n, 0)
  if (total === 0) {
    console.log('Aucune ligne orpheline trouvée. Rien à faire.')
    process.exit(0)
  }

  console.log(`Rattachement des données orphelines au compte "${user.username}" (${user.id})…\n`)
  counts.forEach(({ table, n }) => { if (n > 0) console.log(`  ${table} : ${n} ligne(s) orpheline(s)`) })

  await backupDb()

  const claimTx = db.transaction(() => {
    for (const table of TABLES) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(user.id)
    }
  })
  claimTx()

  console.log(`\n✅ ${total} ligne(s) rattachée(s) à "${user.username}".`)
}

main().catch(err => {
  console.error('Échec du rattachement :', err)
  process.exit(1)
})
