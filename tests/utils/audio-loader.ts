import fs from 'fs';
import path from 'path';

/**
 * WAV file header structure
 */
interface WavHeader {
  chunkId: string;
  chunkSize: number;
  format: string;
  subchunk1Id: string;
  subchunk1Size: number;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  subchunk2Id: string;
  subchunk2Size: number;
}

/**
 * Audio data with metadata
 */
export interface AudioData {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  duration: number;
}

/**
 * Load WAV file and convert to Float32Array
 */
export class AudioLoader {
  /**
   * Load WAV file from disk
   */
  static async loadWavFile(filePath: string): Promise<AudioData> {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Audio file not found: ${absolutePath}`);
    }

    const buffer = fs.readFileSync(absolutePath);
    return this.parseWav(buffer);
  }

  /**
   * Parse WAV buffer
   */
  private static parseWav(buffer: Buffer): AudioData {
    // Parse WAV header
    const header = this.parseWavHeader(buffer);

    // Validate format
    if (header.audioFormat !== 1) {
      throw new Error('Only PCM format is supported');
    }

    // Extract audio data
    const dataOffset = 44; // Standard WAV header size
    const dataBuffer = buffer.subarray(dataOffset, dataOffset + header.subchunk2Size);

    // Convert to Float32Array
    const samples = this.convertToFloat32(dataBuffer, header.bitsPerSample);

    return {
      samples,
      sampleRate: header.sampleRate,
      channels: header.numChannels,
      duration: samples.length / header.sampleRate / header.numChannels
    };
  }

  /**
   * Parse WAV file header
   */
  private static parseWavHeader(buffer: Buffer): WavHeader {
    return {
      chunkId: buffer.toString('utf8', 0, 4),
      chunkSize: buffer.readUInt32LE(4),
      format: buffer.toString('utf8', 8, 12),
      subchunk1Id: buffer.toString('utf8', 12, 16),
      subchunk1Size: buffer.readUInt32LE(16),
      audioFormat: buffer.readUInt16LE(20),
      numChannels: buffer.readUInt16LE(22),
      sampleRate: buffer.readUInt32LE(24),
      byteRate: buffer.readUInt32LE(28),
      blockAlign: buffer.readUInt16LE(32),
      bitsPerSample: buffer.readUInt16LE(34),
      subchunk2Id: buffer.toString('utf8', 36, 40),
      subchunk2Size: buffer.readUInt32LE(40)
    };
  }

  /**
   * Convert PCM data to Float32Array
   */
  private static convertToFloat32(buffer: Buffer, bitsPerSample: number): Float32Array {
    const samples = new Float32Array(buffer.length / (bitsPerSample / 8));

    if (bitsPerSample === 16) {
      for (let i = 0; i < samples.length; i++) {
        const sample = buffer.readInt16LE(i * 2);
        samples[i] = sample / 32768.0; // Convert to [-1, 1] range
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < samples.length; i++) {
        const sample = buffer.readUInt8(i);
        samples[i] = (sample - 128) / 128.0; // Convert to [-1, 1] range
      }
    } else {
      throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
    }

    return samples;
  }

  /**
   * Split audio into chunks (frames)
   */
  static splitIntoFrames(
    audioData: AudioData,
    frameSizeMs: number
  ): Float32Array[] {
    const frameSizeSamples = Math.floor((frameSizeMs * audioData.sampleRate) / 1000);
    const frames: Float32Array[] = [];

    for (let i = 0; i < audioData.samples.length; i += frameSizeSamples) {
      const end = Math.min(i + frameSizeSamples, audioData.samples.length);
      const frame = audioData.samples.slice(i, end);

      // Only add full frames or the last frame if it's substantial
      if (frame.length === frameSizeSamples || frame.length > frameSizeSamples * 0.5) {
        frames.push(frame);
      }
    }

    return frames;
  }

  /**
   * Create test segments with known speech/silence patterns
   */
  static createTestSegments(audioData: AudioData): {
    speech: Float32Array[];
    silence: Float32Array[];
    mixed: Float32Array[];
  } {
    const segmentDuration = 1.0; // 1 second segments
    const segmentSamples = Math.floor(segmentDuration * audioData.sampleRate);

    // Extract segments from different parts of the audio
    const totalSamples = audioData.samples.length;

    // Assuming the test file has speech and silence sections
    // We'll extract from different parts
    const speech: Float32Array[] = [];
    const silence: Float32Array[] = [];
    const mixed: Float32Array[] = [];

    // Early part (usually silence or low energy)
    if (totalSamples > segmentSamples) {
      silence.push(audioData.samples.slice(0, segmentSamples));
    }

    // Middle parts (usually contains speech)
    if (totalSamples > segmentSamples * 3) {
      const midStart = Math.floor(totalSamples * 0.3);
      speech.push(audioData.samples.slice(midStart, midStart + segmentSamples));

      const mid2Start = Math.floor(totalSamples * 0.5);
      speech.push(audioData.samples.slice(mid2Start, mid2Start + segmentSamples));
    }

    // Mixed sections (transitions)
    if (totalSamples > segmentSamples * 2) {
      const mixedStart = Math.floor(totalSamples * 0.2);
      mixed.push(audioData.samples.slice(mixedStart, mixedStart + segmentSamples));
    }

    return { speech, silence, mixed };
  }

  /**
   * Calculate audio statistics
   */
  static calculateStats(samples: Float32Array): {
    energy: number;
    maxAmplitude: number;
    minAmplitude: number;
    zeroCrossings: number;
  } {
    let energy = 0;
    let maxAmplitude = -Infinity;
    let minAmplitude = Infinity;
    let zeroCrossings = 0;
    let prevSample = 0;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      energy += sample * sample;
      maxAmplitude = Math.max(maxAmplitude, sample);
      minAmplitude = Math.min(minAmplitude, sample);

      if (i > 0 && prevSample * sample < 0) {
        zeroCrossings++;
      }
      prevSample = sample;
    }

    return {
      energy: Math.sqrt(energy / samples.length), // RMS
      maxAmplitude,
      minAmplitude,
      zeroCrossings
    };
  }
}