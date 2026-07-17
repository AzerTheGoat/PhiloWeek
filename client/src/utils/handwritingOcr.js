let workerPromise = null
let progressListener = null

const STATUS_LABELS = {
  'loading tesseract core': 'Chargement du moteur local',
  'initializing tesseract': 'Initialisation du moteur',
  'loading language traineddata': 'Chargement du fran\u00e7ais',
  'initializing api': 'Pr\u00e9paration de la reconnaissance',
  'recognizing text': 'Lecture de l\u2019\u00e9criture',
}

function publicAsset(path) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const worker = await createWorker('fra', 1, {
        workerPath: publicAsset('tesseract/worker.min.js'),
        workerBlobURL: false,
        corePath: publicAsset('tesseract/core'),
        langPath: publicAsset('tesseract/lang'),
        logger(message) {
          if (!progressListener) return
          progressListener({
            label: STATUS_LABELS[message.status] || 'Reconnaissance locale',
            progress: Number.isFinite(message.progress) ? message.progress : 0,
          })
        },
      })
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      return { worker, PSM }
    })().catch(error => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

export async function recognizeHandwriting(image, onProgress) {
  progressListener = onProgress
  try {
    const { worker, PSM } = await getWorker()
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    let result = await worker.recognize(image)
    let text = cleanRecognizedText(result?.data?.text || '')
    if (!text) {
      onProgress?.({ label: 'Seconde lecture, ligne par ligne', progress: 0.82 })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
      result = await worker.recognize(image)
      text = cleanRecognizedText(result?.data?.text || '')
    }
    return text
  } finally {
    progressListener = null
  }
}

function cleanRecognizedText(value) {
  return String(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
