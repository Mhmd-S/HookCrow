import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execAsync = promisify(exec)

/**
 * Extract audio from video buffer using FFmpeg
 * Returns WAV audio buffer at 16kHz mono (optimal for analysis)
 */
export async function extractAudioFromVideo(videoBuffer: Buffer): Promise<Buffer> {
  // Create temp directory for processing
  const tempDir = await mkdtemp(join(tmpdir(), 'audio-'))
  const inputPath = join(tempDir, 'input.mp4')
  const outputPath = join(tempDir, 'output.wav')

  try {
    // Write video buffer to temp file
    await writeFile(inputPath, videoBuffer)

    // Extract audio with FFmpeg
    // -ar 16000: 16kHz sample rate (good for speech/music analysis)
    // -ac 1: mono channel
    // -f wav: WAV output format
    await execAsync(
      `ffmpeg -i "${inputPath}" -vn -ar 16000 -ac 1 -f wav "${outputPath}" -y`,
      { maxBuffer: 50 * 1024 * 1024 } // 50MB buffer
    )

    // Read the output audio file
    const audioBuffer = await readFile(outputPath)

    return audioBuffer
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath)
      await unlink(outputPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract a specific segment of audio from video
 */
export async function extractAudioSegment(
  videoBuffer: Buffer,
  startTime: number,
  endTime: number
): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), 'audio-seg-'))
  const inputPath = join(tempDir, 'input.mp4')
  const outputPath = join(tempDir, 'output.wav')

  try {
    await writeFile(inputPath, videoBuffer)

    const duration = endTime - startTime
    await execAsync(
      `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${duration} -vn -ar 16000 -ac 1 -f wav "${outputPath}" -y`,
      { maxBuffer: 50 * 1024 * 1024 }
    )

    const audioBuffer = await readFile(outputPath)
    return audioBuffer
  } finally {
    try {
      await unlink(inputPath)
      await unlink(outputPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if FFmpeg is available on the system
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version')
    return true
  } catch {
    return false
  }
}

/**
 * Get audio duration in seconds
 */
export async function getAudioDuration(audioBuffer: Buffer): Promise<number> {
  const tempDir = await mkdtemp(join(tmpdir(), 'audio-dur-'))
  const inputPath = join(tempDir, 'input.wav')

  try {
    await writeFile(inputPath, audioBuffer)

    const { stdout } = await execAsync(
      `ffprobe -i "${inputPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
      { maxBuffer: 1024 * 1024 }
    )

    return parseFloat(stdout.trim())
  } finally {
    try {
      await unlink(inputPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}
