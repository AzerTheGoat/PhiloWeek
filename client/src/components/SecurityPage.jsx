import Icon from './Icons'

const PROTECTIONS = [
  {
    icon: 'cloud',
    title: 'Comptes isolés côté serveur',
    text: 'Chaque requête est rattachée à la session connectée. Les contrôles d’accès et le propriétaire sont revérifiés par le serveur : modifier l’interface dans le navigateur ne permet pas de lire les notes d’un autre compte.',
  },
  {
    icon: 'shield',
    title: 'Sessions protégées',
    text: 'Le navigateur reçoit un cookie HttpOnly, inaccessible au JavaScript de la page. Le jeton réel n’est jamais enregistré dans la base : seul son condensat est conservé. Changer le mot de passe de connexion révoque les autres sessions.',
  },
  {
    icon: 'file',
    title: 'Contenus affichés avec précaution',
    text: 'Le HTML des notes est nettoyé avant affichage. Scripts, cadres et formulaires sont bloqués. Les notes privées refusent les images distantes; les articles et la frise acceptent les images HTTPS sans transmettre l’adresse de la page.',
  },
  {
    icon: 'upload',
    title: 'Imports et abus bornés',
    text: 'Les ZIP, fichiers Excel, photos et audios ont des limites de taille. Les chemins dangereux, archives suspectes et formules Excel externes sont refusés ou neutralisés. Des quotas et limites de fréquence réduisent les abus.',
  },
]

export default function SecurityPage() {
  return (
    <div className="security-view">
      <section className="security-hero">
        <div className="security-hero-icon"><Icon name="shield" size={30} /></div>
        <div>
          <span className="security-eyebrow">Sécurité dans Opuscule</span>
          <h2>Vos notes restent sous votre contrôle</h2>
          <p>
            Opuscule combine isolation des comptes, sessions opaques, contrôles d’accès serveur et protections du navigateur.
            Pour les notes les plus sensibles, vous pouvez aussi activer le chiffrement persistant d’un dossier.
          </p>
        </div>
      </section>

      <section className="security-section" aria-labelledby="security-everyday-title">
        <div className="security-section-heading">
          <span className="security-step">01</span>
          <div><h3 id="security-everyday-title">Protection au quotidien</h3><p>Ces mécanismes sont actifs sans réglage particulier.</p></div>
        </div>
        <div className="security-card-grid">
          {PROTECTIONS.map(item => (
            <article className="security-card" key={item.title}>
              <span className="security-card-icon"><Icon name={item.icon} size={19} /></span>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="security-section" aria-labelledby="security-vault-title">
        <div className="security-section-heading">
          <span className="security-step">02</span>
          <div><h3 id="security-vault-title">Dossiers chiffrés</h3><p>Une protection supplémentaire, activée seulement quand vous la choisissez.</p></div>
        </div>
        <div className="security-vault-panel">
          <div className="security-vault-copy">
            <h4>Chiffré ne veut pas dire verrouillé</h4>
            <p>
              Le <strong>chiffrement</strong> protège durablement le contenu enregistré dans SQLite. Le <strong>verrouillage</strong> ferme seulement l’accès au dossier dans la session actuelle. Même ouvert, un dossier chiffré reste chiffré dans la base.
            </p>
            <ul>
              <li>Un seul mot de passe de coffre, distinct du mot de passe de connexion.</li>
              <li>Une clé aléatoire différente par dossier et par contenu; le mot de passe n’est pas utilisé directement pour chiffrer les notes.</li>
              <li>Fichiers, sous-dossiers, historique et corbeille sont traités récursivement.</li>
              <li>La clé ouverte reste seulement en mémoire pour cette session, pendant une durée limitée.</li>
            </ul>
          </div>
          <div className="security-state-list" aria-label="États d’un dossier chiffré">
            <div><span className="security-state-icon">🛡</span><strong>Chiffré et ouvert</strong><small>Utilisable, toujours illisible dans SQLite.</small></div>
            <div><span className="security-state-icon">🔒</span><strong>Chiffré et verrouillé</strong><small>Mot de passe du coffre requis pour l’ouvrir.</small></div>
            <div><span className="security-state-icon">○</span><strong>Chiffrement désactivé</strong><small>Le contenu est volontairement réécrit en clair.</small></div>
          </div>
        </div>
        <div className="security-warning">
          <Icon name="alert" size={18} />
          <p><strong>Pas de récupération cachée.</strong> Si le mot de passe du coffre est perdu, les dossiers chiffrés sont irrécupérables. Opuscule ne stocke ni ce mot de passe ni une clé de secours en clair.</p>
        </div>
      </section>

      <section className="security-section" aria-labelledby="security-backup-title">
        <div className="security-section-heading">
          <span className="security-step">03</span>
          <div><h3 id="security-backup-title">Sauvegarde et limites</h3><p>Une sécurité crédible explique aussi ce qu’elle ne couvre pas.</p></div>
        </div>
        <div className="security-two-columns">
          <article className="security-info-block">
            <h4><Icon name="download" size={18} /> Export Obsidian</h4>
            <p>Le mot de passe du coffre est redemandé pour exporter les dossiers chiffrés. Le ZIP reste compatible avec Obsidian, donc il contient les notes en clair : conservez-le sur un support lui-même chiffré.</p>
          </article>
          <article className="security-info-block">
            <h4><Icon name="alert" size={18} /> Limites à connaître</h4>
            <p>Les noms et la structure des dossiers restent visibles. Les audios et photos ne suivent pas encore le chiffrement d’un dossier. Sur Android, le code d’un bloc Mermaid est transmis par le serveur au service public Kroki pour produire le diagramme; le reste de la note n’est pas envoyé. Une personne contrôlant le serveur ou une session ouverte pourrait lire les données utilisées à cet instant.</p>
          </article>
        </div>
      </section>

      <section className="security-practices" aria-labelledby="security-practices-title">
        <div><Icon name="check" size={20} /><h3 id="security-practices-title">Trois bons réflexes</h3></div>
        <ol>
          <li>Utilisez un mot de passe de connexion unique et long.</li>
          <li>Gardez le mot de passe du coffre dans un gestionnaire de mots de passe fiable.</li>
          <li>Faites régulièrement un export, puis protégez et testez cette sauvegarde.</li>
        </ol>
      </section>
    </div>
  )
}
