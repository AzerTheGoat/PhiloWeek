// Saisie d'une image par URL internet : plus simple que télécharger puis
// réuploader. On stocke l'URL telle quelle (le rendu <img src> l'affiche
// directement ; le journal autorise les images HTTPS). Renvoie l'URL
// nettoyée, ou null si l'utilisateur annule. Lève une erreur si l'URL est
// invalide, pour que l'appelant affiche un toast.
export function promptImageUrl() {
  const raw = window.prompt("Colle l'adresse (URL) d'une image :")
  if (raw == null) return null
  const url = raw.trim()
  if (!url) return null
  if (!/^https:\/\/\S+$/i.test(url)) {
    throw new Error("URL invalide : elle doit commencer par https://")
  }
  if (url.length > 2048) {
    throw new Error('URL trop longue.')
  }
  return url
}
