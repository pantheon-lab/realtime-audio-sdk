import type {
  AudioProcessorResult,
  ProcessingConfig,
  VADStateEvent,
  VADSegmentEvent
} from '../types';
import { EventEmitter } from '../core/EventEmitter';
import { SileroVAD } from '../vad/SileroVAD';

interface AudioProcessorEvents {
  'speech-state': (event: VADStateEvent) => void;
  'speech-segment': (event: VADSegmentEvent) => void;
}

/**
 * Processes audio data (VAD, normalization, etc.)
 */
export class AudioProcessor extends EventEmitter<AudioProcessorEvents> {
  private config: ProcessingConfig;
  private sileroVAD?: SileroVAD;

  constructor(config: ProcessingConfig = {}) {
    super();
    this.config = config;
  }

  /**
   * Initialize the audio processor
   */
  async initialize(): Promise<void> {
    const vadConfig = this.config.vad;
    console.log('AudioProcessor.initialize() - VAD config:', vadConfig);
    if (vadConfig?.enabled) {
      // Always use Silero VAD when VAD is enabled
      console.log('Initializing Silero VAD...');
      this.sileroVAD = new SileroVAD(vadConfig);
      await this.sileroVAD.initialize();
      console.log('Silero VAD initialized successfully');

      // Forward Silero VAD events with new format
      this.sileroVAD.on('speech-start', (data) => {
        this.emitVADEvent('start', data);
      });

      this.sileroVAD.on('speech-end', (data) => {
        this.emitVADEvent('end', data);
      });
    } else {
      console.log('VAD not enabled or config missing');
    }
  }

  /**
   * Helper method to emit VAD events
   */
  private emitVADEvent(type: 'start' | 'end', data: {
    isSpeech: boolean;
    probability: number;
    timestamp: number;
    segment?: {
      start: number;
      end: number;
      duration: number;
      audioData?: Float32Array;
    };
  }): void {
    console.log(`[AudioProcessor] emitVADEvent called - type: ${type}, hasSegment: ${!!data.segment}`);

    const event: VADStateEvent = {
      type,
      timestamp: data.timestamp,
      probability: data.probability,
      duration: type === 'end' && data.segment ? data.segment.duration : undefined
    };
    console.log(`[AudioProcessor] Emitting speech-state event:`, event);
    this.emit('speech-state', event);

    // Emit speech-segment event if segment data is available
    if (type === 'end' && data.segment) {
      const segmentEvent: VADSegmentEvent = {
        audio: data.segment.audioData || new Float32Array(0),
        startTime: data.segment.start * 1000,      // Convert seconds to milliseconds
        endTime: data.segment.end * 1000,          // Convert seconds to milliseconds
        duration: data.segment.duration,           // Already in milliseconds
        avgProbability: data.probability,
        confidence: this.calculateConfidence(data.probability)
      };
      console.log(`[AudioProcessor] Emitting speech-segment event:`, {
        duration: segmentEvent.duration,
        audioLength: segmentEvent.audio.length,
        startTime: segmentEvent.startTime.toFixed(0) + 'ms',
        endTime: segmentEvent.endTime.toFixed(0) + 'ms'
      });
      this.emit('speech-segment', segmentEvent);
    }
  }

  /**
   * Calculate confidence from probability
   */
  private calculateConfidence(probability: number): number {
    // More gradual confidence calculation
    if (probability > 0.9) return 1.0;
    if (probability > 0.7) return 0.9;
    if (probability > 0.5) return 0.8;
    return probability;
  }

  /**
   * Process audio data
   */
  async process(audioData: Float32Array, timestamp: number): Promise<AudioProcessorResult> {
    let processedData = audioData;

    // Normalize audio if enabled
    if (this.config.normalize) {
      processedData = this.normalize(processedData);
    }

    // Calculate energy
    const energy = this.calculateEnergy(processedData);

    // Voice Activity Detection
    let vadResult: { isSpeech: boolean; probability: number } | undefined;

    if (this.config.vad?.enabled && this.sileroVAD) {
      // Use Silero VAD (only VAD option now)
      const result = await this.sileroVAD.process(processedData, timestamp);
      vadResult = {
        isSpeech: result.isSpeech,
        probability: result.probability
      };
    } else if (this.config.vad?.enabled && !this.sileroVAD) {
      console.warn('VAD enabled but SileroVAD not initialized. Call initialize() first.');
    }

    return {
      data: processedData,
      energy,
      normalized: this.config.normalize || false,
      vad: vadResult,
      timestamp,
    };
  }

  /**
   * Normalize audio data to [-1, 1] range
   */
  private normalize(data: Float32Array): Float32Array {
    const max = Math.max(...Array.from(data).map(Math.abs));
    if (max === 0) return data;

    const normalized = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      normalized[i] = data[i] / max;
    }
    return normalized;
  }

  /**
   * Calculate audio energy (RMS)
   */
  private calculateEnergy(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }


  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProcessingConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize Silero VAD if config changed
    if (config.vad && this.sileroVAD) {
      this.sileroVAD.updateConfig(config.vad);
    }
  }

  /**
   * Reset VAD state
   */
  resetVAD(): void {
    if (this.sileroVAD) {
      this.sileroVAD.reset();
    }
  }

  /**
   * Flush any pending speech segment
   * Useful when audio stream ends to save the last incomplete segment
   */
  flush(timestamp?: number): void {
    if (this.sileroVAD) {
      this.sileroVAD.flush(timestamp);
    }
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    if (this.sileroVAD) {
      await this.sileroVAD.close();
      this.sileroVAD = undefined;
    }
    this.removeAllListeners();
  }
}
