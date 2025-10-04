import type { OpusEncoderConfig } from '@/types';

interface EncodedChunk {
  timestamp: number;
  data: ArrayBuffer;
}

/**
 * PCM encoder (fallback when WebCodecs is not available)
 * Simply wraps the raw PCM data
 */
export class PCMEncoder {
  private config: OpusEncoderConfig;

  constructor(config: OpusEncoderConfig) {
    this.config = config;
  }

  /**
   * Initialize encoder (no-op for PCM)
   */
  async initialize(): Promise<void> {
    // PCM doesn't need initialization
  }

  /**
   * "Encode" audio data (just convert to ArrayBuffer)
   */
  async encode(audioData: Float32Array, timestamp: number): Promise<EncodedChunk> {
    // Convert Float32Array to Int16Array (16-bit PCM)
    const pcmData = this.floatTo16BitPCM(audioData);

    return {
      data: pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + pcmData.byteLength) as ArrayBuffer,
      timestamp,
    };
  }

  /**
   * Convert Float32Array to Int16Array (16-bit PCM)
   */
  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1]
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit integer
      int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    }

    return int16Array;
  }

  /**
   * Flush encoder (no-op for PCM)
   */
  async flush(): Promise<void> {
    // Nothing to flush for PCM
  }

  /**
   * Close encoder (no-op for PCM)
   */
  close(): void {
    // Nothing to close for PCM
  }

  /**
   * Update encoder configuration
   */
  async updateConfig(config: Partial<OpusEncoderConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
  }
}
