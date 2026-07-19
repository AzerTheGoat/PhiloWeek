import { useEffect, useState } from 'react'

// Vrai sous le seuil mobile, réactif au redimensionnement. Sert à basculer
// certaines vues (journal, carnet de voyage…) en navigation à un panneau.
export default function useIsMobile(query = '(max-width: 768px)') {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return isMobile
}
