// Compression / redimensionnement des photos AVANT upload, entièrement côté
// navigateur (canvas). Réduit le poids stocké sur le volume Railway et évite
// d'envoyer des fichiers de 10 Mo depuis un téléphone. Sortie : JPEG.

export const PHOTO_QUALITY_PRESETS = [
  { key: 'compact', label: 'Compacte', hint: 'Légère · ~1080 px', maxSize: 1080, quality: 0.72 },
  { key: 'medium', label: 'Standard', hint: 'Équilibrée · ~1600 px', maxSize: 1600, quality: 0.82 },
  { key: 'high', label: 'Haute', hint: 'Détaillée · ~2560 px', maxSize: 2560, quality: 0.9 },
  { key: 'original', label: 'Maximale', hint: 'Quasi originale · ~4096 px', maxSize: 4096, quality: 0.95 },
]

export function getPreset(key) {
  return PHOTO_QUALITY_PRESETS.find(p => p.key === key) || PHOTO_QUALITY_PRESETS[1]
}

async function loadBitmap(file) {
  // createImageBitmap respecte l'orientation EXIF (photos de téléphone).
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) }
    catch (_) { /* fallback below */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')) }
    img.src = url
  })
}

// Retourne { blob, width, height, filename }.
export async function compressPhoto(file, presetKey = 'medium') {
  const preset = getPreset(presetKey)
  const bitmap = await loadBitmap(file)
  const srcW = bitmap.width || bitmap.naturalWidth
  const srcH = bitmap.height || bitmap.naturalHeight
  if (!srcW || !srcH) throw new Error('Image illisible')

  const scale = Math.min(1, preset.maxSize / Math.max(srcW, srcH))
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  if (bitmap.close) bitmap.close()

  const blob = await new Promise((resolve) => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', preset.quality)
  })
  if (!blob) throw new Error('Compression impossible')

  const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '')
  return { blob, width, height, filename: `${baseName}.jpg` }
}
