import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import * as ffmpeg from 'fluent-ffmpeg'
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

// Set ffmpeg + ffprobe binary paths from npm-installed packages
ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

const MAX_DURATION_SECONDS = 180 // 3 minutes

@Injectable()
export class MediaConverterService {
  private readonly logger = new Logger(MediaConverterService.name)

  /**
   * Convert audio to M4A (AAC) for Instagram compatibility.
   * Returns converted buffer + new mimetype, or throws if duration > 3min.
   */
  async convertAudioToM4A(
    inputBuffer: Buffer,
    originalMimetype: string,
  ): Promise<{ buffer: Buffer; mimetype: string; extension: string }> {
    const tmpDir = os.tmpdir()
    const id = crypto.randomUUID()
    // Use correct extension so ffmpeg can detect the input format
    const extMap: Record<string, string> = {
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/mp4': '.mp4',
      'audio/m4a': '.m4a',
    }
    const inputExt = extMap[originalMimetype] || ''
    const inputPath = path.join(tmpDir, `${id}-input${inputExt}`)
    const outputPath = path.join(tmpDir, `${id}-output.mp4`)

    try {
      fs.writeFileSync(inputPath, inputBuffer)

      // Validate duration first
      const duration = await this.getDuration(inputPath)
      if (duration > MAX_DURATION_SECONDS) {
        throw new BadRequestException(
          `La durée du fichier audio dépasse la limite de ${MAX_DURATION_SECONDS / 60} minutes`,
        )
      }

      this.logger.log(
        `[MediaConverter] Converting audio (${originalMimetype}, ${inputBuffer.length} bytes)`,
      )

      await this.runFfmpeg(inputPath, outputPath, [
        '-c:a',
        'aac',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-b:a',
        '64k',
        '-movflags',
        '+faststart',
        '-brand',
        'isom',
      ])

      const outputBuffer = fs.readFileSync(outputPath)

      // Verify conversion result
      const info = await this.probeFile(outputPath)
      this.logger.log(
        `[MediaConverter] Audio converted: ${originalMimetype} → ${info} (${inputBuffer.length} → ${outputBuffer.length} bytes)`,
      )

      // Instagram mobile expects video/mp4 Content-Type for audio playback
      return { buffer: outputBuffer, mimetype: 'video/mp4', extension: 'mp4' }
    } finally {
      this.cleanup(inputPath, outputPath)
    }
  }

  /**
   * Convert audio to OGG (Opus) for WhatsApp compatibility.
   * WhatsApp only accepts: audio/ogg; codecs=opus, audio/mpeg, audio/amr, audio/mp4, audio/aac.
   */
  async convertAudioToOgg(
    inputBuffer: Buffer,
    originalMimetype: string,
  ): Promise<{ buffer: Buffer; mimetype: string; extension: string }> {
    const tmpDir = os.tmpdir()
    const id = crypto.randomUUID()
    const extMap: Record<string, string> = {
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/mp4': '.mp4',
      'audio/m4a': '.m4a',
      'video/mp4': '.mp4',
    }
    const inputExt = extMap[originalMimetype] || '.bin'
    const inputPath = path.join(tmpDir, `${id}-input${inputExt}`)
    const outputPath = path.join(tmpDir, `${id}-output.ogg`)

    try {
      fs.writeFileSync(inputPath, inputBuffer)

      this.logger.log(
        `[MediaConverter] Converting audio to OGG/Opus (${originalMimetype}, ${inputBuffer.length} bytes)`,
      )

      await this.runFfmpeg(inputPath, outputPath, [
        '-c:a',
        'libopus',
        '-ar',
        '48000',
        '-ac',
        '1',
        '-b:a',
        '64k',
      ])

      const outputBuffer = fs.readFileSync(outputPath)

      this.logger.log(
        `[MediaConverter] Audio → OGG/Opus (${inputBuffer.length} → ${outputBuffer.length} bytes)`,
      )

      return { buffer: outputBuffer, mimetype: 'audio/ogg', extension: 'ogg' }
    } finally {
      this.cleanup(inputPath, outputPath)
    }
  }

  /**
   * Convert video to MP4 (H.264/AAC) for Instagram mobile compatibility.
   * Returns converted buffer + new mimetype, or throws if duration > 3min.
   */
  async convertVideoToMp4(
    inputBuffer: Buffer,
    originalMimetype: string,
  ): Promise<{ buffer: Buffer; mimetype: string; extension: string }> {
    const tmpDir = os.tmpdir()
    const id = crypto.randomUUID()
    const vidExtMap: Record<string, string> = {
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/mp4': '.mp4',
    }
    const inputExt = vidExtMap[originalMimetype] || ''
    const inputPath = path.join(tmpDir, `${id}-input${inputExt}`)
    const outputPath = path.join(tmpDir, `${id}-output.mp4`)

    try {
      fs.writeFileSync(inputPath, inputBuffer)

      // Validate duration
      const duration = await this.getDuration(inputPath)
      if (duration > MAX_DURATION_SECONDS) {
        throw new BadRequestException(
          `La durée de la vidéo dépasse la limite de ${MAX_DURATION_SECONDS / 60} minutes`,
        )
      }

      this.logger.log(
        `[MediaConverter] Converting video (${originalMimetype}, ${inputBuffer.length} bytes)`,
      )

      // Always transcode for Instagram/Messenger mobile compatibility:
      // - H.264 Main profile (High not supported on all mobile)
      // - Max 720p, min bitrate 1Mbps (mobile players choke on very low bitrate)
      // - Stereo AAC audio
      await this.runFfmpeg(inputPath, outputPath, [
        '-c:v',
        'libx264',
        '-profile:v',
        'main',
        '-level',
        '3.1',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-vf',
        "scale='min(720,iw)':'-2'",
        '-c:a',
        'aac',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-pix_fmt',
        'yuv420p',
        '-brand',
        'isom',
      ])

      const outputBuffer = fs.readFileSync(outputPath)

      // Verify conversion result
      const info = await this.probeFile(outputPath)
      this.logger.log(
        `[MediaConverter] Video converted: ${originalMimetype} → ${info} (${inputBuffer.length} → ${outputBuffer.length} bytes)`,
      )

      return { buffer: outputBuffer, mimetype: 'video/mp4', extension: 'mp4' }
    } finally {
      this.cleanup(inputPath, outputPath)
    }
  }

  // ─── Private helpers ───

  private getDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          this.logger.warn(`[MediaConverter] ffprobe error: ${err.message}`)
          resolve(0) // Can't determine — allow
          return
        }
        resolve(metadata.format.duration || 0)
      })
    })
  }

  private probeFile(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve('probe failed')
          return
        }
        const streams = metadata.streams
          .map((s) => `${s.codec_type}:${s.codec_name}@${s.sample_rate || 'n/a'}Hz`)
          .join(', ')
        resolve(`${metadata.format.format_name} [${streams}]`)
      })
    })
  }

  private runFfmpeg(inputPath: string, outputPath: string, outputOptions: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => {
          this.logger.error(`[MediaConverter] FFmpeg error: ${err.message}`)
          reject(new BadRequestException('Erreur lors de la conversion du fichier média'))
        })
        .run()
    })
  }

  private cleanup(...paths: string[]) {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p)
      } catch {
        // Cleanup errors are non-critical
      }
    }
  }
}
