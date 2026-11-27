// Camera and image helpers for progress photos: the live camera through getUserMedia,
// and downscaling a frame or a picked file to a JPEG of a given size.

export type Facing = 'user' | 'environment'

export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieser Browser hat keinen Kamerazugriff.')
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false })
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop())
}

/** Draws a source into a canvas no larger than `maxSide`, optionally mirrored, and returns a JPEG. */
export async function toJpeg(source: CanvasImageSource, width: number, height: number, maxSide: number, quality: number, mirror = false): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  if (mirror) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(source, 0, 0, w, h)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto konnte nicht gespeichert werden'))), 'image/jpeg', quality))
}

/** The photo itself (1,600 px) and a small thumbnail (320 px), as the plan sizes them. */
export async function photoPair(source: CanvasImageSource, width: number, height: number, mirror = false): Promise<{ image: Blob; thumbnail: Blob }> {
  const [image, thumbnail] = await Promise.all([toJpeg(source, width, height, 1600, 0.85, mirror), toJpeg(source, width, height, 320, 0.7, mirror)])
  return { image, thumbnail }
}

/** A picked image file, upright (browsers apply the EXIF orientation). */
export async function fileToBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file)
}
