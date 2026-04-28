/**
 * Extract a JPEG thumbnail from a video File using HTML5 video + canvas.
 * Returns null if extraction fails (corrupt file, no metadata, etc).
 *
 * Runs entirely in the browser — no server FFmpeg required.
 */
export async function extractThumbnailFromVideoFile(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    const objectUrl = URL.createObjectURL(file)
    video.src = objectUrl

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.remove()
    }

    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 15000)

    video.onloadedmetadata = () => {
      // Seek to 1s (skip black fade-in) or 10% if video is shorter
      video.currentTime = Math.min(1, video.duration * 0.1)
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        // Scale to max 400px width, preserve aspect ratio
        const targetWidth = Math.min(400, video.videoWidth)
        const scale = video.videoWidth > 0 ? targetWidth / video.videoWidth : 1
        canvas.width = targetWidth
        canvas.height = Math.round(video.videoHeight * scale)

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          clearTimeout(timeout)
          cleanup()
          resolve(null)
          return
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout)
            cleanup()
            resolve(blob)
          },
          'image/jpeg',
          0.8
        )
      } catch {
        clearTimeout(timeout)
        cleanup()
        resolve(null)
      }
    }

    video.onerror = () => {
      clearTimeout(timeout)
      cleanup()
      resolve(null)
    }
  })
}
