import type {
  AudioProcessorResult,
  ProcessingConfig,
  SileroVADConfig,
  VADStateEvent,
  VADSegmentEvent
} from '@/types';
import { EventEmitter } from '@/core/EventEmitter';
import { SileroVAD } from '@/vad/SileroVAD';

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
  private vadState: {
    isSpeech: boolean;
    speechStartTime: number;
    silenceStartTime: number;
  } = {
    isSpeech: false,
    speechStartTime: 0,
    silenceStartTime: 0,
  };

  constructor(config: ProcessingConfig = {}) {
    super();
    this.config = config;
  }

  /**
   * Initialize the audio processor
   */
  async initialize(): Promise<void> {
    const vadConfig = this.config.vad;
    if (vadConfig?.enabled && vadConfig.provider === 'silero') {
      this.sileroVAD = new SileroVAD(vadConfig as SileroVADConfig);
      await this.sileroVAD.initialize();

      // Forward Silero VAD events with new format
      this.sileroVAD.on('speech-start', (data) => {
        const event: VADStateEvent = {
          type: 'start',
          timestamp: data.timestamp,
          probability: data.probability
        };
        this.emit('speech-state', event);
      });

      this.sileroVAD.on('speech-end', (data) => {
        const event: VADStateEvent = {
          type: 'end',
          timestamp: data.timestamp,
          probability: data.probability,
          duration: data.segment ? data.segment.duration : undefined
        };
        this.emit('speech-state', event);
      });

      this.sileroVAD.on('speech-segment', (segment) => {
        const event: VADSegmentEvent = {
          audio: segment.audioData || new Float32Array(0),
          startTime: segment.start,
          endTime: segment.end,
          duration: segment.duration,
          avgProbability: 0.5, // Will be calculated by SileroVAD
          confidence: 0.8 // Will be calculated by SileroVAD
        };
        this.emit('speech-segment', event);
      });
    }
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

    if (this.config.vad?.enabled) {
      if (this.sileroVAD) {
        // Use Silero VAD
        const result = await this.sileroVAD.process(processedData, timestamp);
        vadResult = {
          isSpeech: result.isSpeech,
          probability: result.probability
        };
      } else {
        // Use energy-based VAD
        const isSpeech = this.detectVoiceActivity(energy, timestamp);
        vadResult = {
          isSpeech,
          probability: isSpeech ? Math.min(energy * 2, 1.0) : energy // Estimate probability from energy
        };
      }
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
   * Detect voice activity using energy-based VAD
   */
  private detectVoiceActivity(energy: number, timestamp: number): boolean {
    // Energy VAD uses simple threshold
    const threshold = 0.02; // Default energy threshold
    const minSpeechDuration = 100;
    const minSilenceDuration = 300;

    const isSpeechNow = energy > threshold;

    if (isSpeechNow && !this.vadState.isSpeech) {
      // Potential speech start
      if (this.vadState.speechStartTime === 0) {
        this.vadState.speechStartTime = timestamp;
      }

      // Check if speech has been sustained long enough
      if (timestamp - this.vadState.speechStartTime >= minSpeechDuration) {
        this.vadState.isSpeech = true;
        this.vadState.silenceStartTime = 0;
      }
    } else if (!isSpeechNow && this.vadState.isSpeech) {
      // Potential speech end
      if (this.vadState.silenceStartTime === 0) {
        this.vadState.silenceStartTime = timestamp;
      }

      // Check if silence has been sustained long enough
      if (timestamp - this.vadState.silenceStartTime >= minSilenceDuration) {
        this.vadState.isSpeech = false;
        this.vadState.speechStartTime = 0;
      }
    } else if (isSpeechNow && this.vadState.isSpeech) {
      // Reset silence timer if speech continues
      this.vadState.silenceStartTime = 0;
    } else if (!isSpeechNow && !this.vadState.isSpeech) {
      // Reset speech timer if silence continues
      this.vadState.speechStartTime = 0;
    }

    return this.vadState.isSpeech;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProcessingConfig>): void {
    this.config = { ...this.config, ...config };

    // Reset VAD state if VAD config changed
    if (config.vad) {
      this.vadState = {
        isSpeech: false,
        speechStartTime: 0,
        silenceStartTime: 0,
      };
    }
  }

  /**
   * Reset VAD state
   */
  resetVAD(): void {
    this.vadState = {
      isSpeech: false,
      speechStartTime: 0,
      silenceStartTime: 0,
    };

    if (this.sileroVAD) {
      this.sileroVAD.reset();
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
