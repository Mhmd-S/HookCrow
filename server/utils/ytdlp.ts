import { spawn } from 'child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const log = createLogger('yt-dlp')

export interface DownloadResult {
  path: string
  cleanup: () => Promise<void>
}

/**
 * Download a TikTok video to a unique temp directory via yt-dlp.
 * Returns the downloaded file path and a cleanup function that removes the directory.
 * Rejects on nonzero exit with stderr content.
 */
export function downloadTikTokToTemp(url: string): Promise<DownloadResult> {
  return new Promise(async (resolve, reject) => {
    const dir = await mkdtemp(join(tmpdir(), 'tiktok-dl-'))
    const template = join(dir, 'video.%(ext)s')

    const args = [
      '-f', 'mp4/best[ext=mp4]/best',
      '--no-playlist',
      '--no-progress',
      '--no-warnings',
      '-o', template,
      url
    ]

    log.info('Spawning yt-dlp', { dir, url })

    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stderr = ''

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', async (code) => {
      if (code !== 0) {
        const msg = stderr.trim() || `yt-dlp exited with code ${code}`
        log.error('yt-dlp failed', new Error(msg), { code, url })
        try { await rm(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
        return reject(new Error(msg))
      }

      try {
        const entries = await readdir(dir)
        const videoFile = entries.find(e => e.startsWith('video.'))
        if (!videoFile) {
          const msg = 'No output file found in temp dir'
          log.error(msg, new Error(), { dir, entries })
          try { await rm(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
          return reject(new Error(msg))
        }

        const filePath = resolve(join(dir, videoFile))
        log.info('yt-dlp download complete', { path: filePath })

        resolve({
          path: filePath,
          cleanup: async () => {
            try {
              await rm(dir, { recursive: true, force: true })
              log.info('Temp dir cleaned up', { dir })
            } catch (err) {
              log.warn('Temp dir cleanup failed', err instanceof Error ? err.message : String(err), { dir })
            }
          }
        })
      } catch (err) {
        log.error('Failed to read temp dir', err, { dir })
        try { await rm(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
        return reject(err instanceof Error ? err : new Error('Failed to read temp dir'))
      }
    })

    proc.on('error', async (err) => {
      log.error('Failed to spawn yt-dlp', err, { url })
      try { await rm(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
      reject(err)
    })
  })
}
