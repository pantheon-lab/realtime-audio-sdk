import type { OpusEncoderConfig } from '@/types';

interface EncodedChunk {
  timestamp: number;
  data: ArrayBuffer;
}

/**
 * Opus encoder using WebCodecs API
 */
export class OpusEncoder {
  private encoder: AudioEncoder | null = null;
  private config: OpusEncoderConfig;
  private isConfigured: boolean = false;
  private pendingChunks: EncodedChunk[] = [];

  constructor(config: OpusEncoderConfig) {
    this.config = config;
  }

  /**
   * Check if WebCodecs is supported
   */
  static isSupported(): boolean {
    return typeof AudioEncoder !== 'undefined';
  }

  /**
   * Initialize and configure the encoder
   */
  async initialize(): Promise<void> {
    if (!OpusEncoder.isSupported()) {
      throw new Error('WebCodecs AudioEncoder is not supported in this browser');
    }

    try {
      this.encoder = new AudioEncoder({
        output: (chunk, metadata?: EncodedAudioChunkMetadata) => {
          this.handleEncodedChunk(chunk, metadata);
        },
        error: (error: Error) => {
          console.error('Opus encoding error:', error);
        },
      });

      // Configure encoder for Opus
      const encoderConfig: AudioEncoderConfig = {
        codec: 'opus',
        sampleRate: this.config.sampleRate,
        numberOfChannels: this.config.numberOfChannels,
        bitrate: this.config.bitrate,
        opus: {
          complexity: this.config.complexity ?? 5,
          frameDuration: this.config.frameSize * 1000, // Convert ms to microseconds
          format: 'opus',
        },
      };

      // Check if config is supported
      const support = await AudioEncoder.isConfigSupported(encoderConfig);
      if (!support.supported) {
        throw new Error('Opus encoder configuration not supported');
      }

      this.encoder.configure(encoderConfig);
      this.isConfigured = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Opus encoder: ${message}`);
    }
  }

  /**
   * Encode audio data
   */
  async encode(audioData: Float32Array, timestamp: number): Promise<EncodedChunk | null> {
    if (!this.encoder || !this.isConfigured) {
      throw new Error('Encoder not initialized');
    }

    // Create AudioData from Float32Array
    const audioDataObj = new AudioData({
      format: 'f32-planar',
      sampleRate: this.config.sampleRate,
      numberOfFrames: audioData.length,
      numberOfChannels: this.config.numberOfChannels,
      timestamp: timestamp * 1000000, // Convert to microseconds
      data: audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) as ArrayBuffer,
    });

    // Encode
    this.encoder.encode(audioDataObj);
    audioDataObj.close();

    // Wait for the encoded chunk to be processed
    // In a real implementation, this would use a promise-based queue
    await this.encoder.flush();

    return this.pendingChunks.shift() || null;
  }

  /**
   * Handle encoded chunk from WebCodecs
   */
  private handleEncodedChunk(
    chunk: globalThis.EncodedAudioChunk,
    _metadata?: EncodedAudioChunkMetadata
  ): void {
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    this.pendingChunks.push({
      data: buffer,
      timestamp: chunk.timestamp / 1000000, // Convert from microseconds to seconds
    });
  }

  /**
   * Flush encoder
   */
  async flush(): Promise<void> {
    if (this.encoder) {
      await this.encoder.flush();
    }
  }

  /**
   * Close encoder
   */
  close(): void {
    if (this.encoder) {
      this.encoder.close();
      this.encoder = null;
      this.isConfigured = false;
    }
  }

  /**
   * Update encoder configuration
   */
  async updateConfig(config: Partial<OpusEncoderConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    this.close();
    await this.initialize();
  }
}
