import * as ort from 'onnxruntime-web';
import type { SileroVADConfig } from '@/types';
import { EventEmitter } from '@/core/EventEmitter';

interface VADEventData {
  isSpeech: boolean;
  probability: number;
  timestamp: number;
  segment?: {
    start: number;
    end: number;
    duration: number;
    audioData?: Float32Array;
  };
}

interface SileroVADEvents {
  'speech-start': (data: VADEventData) => void;
  'speech-end': (data: VADEventData) => void;
  'speech-segment': (segment: { start: number; end: number; duration: number; audioData?: Float32Array }) => void;
  'probability': (prob: number) => void;
}

/**
 * Silero VAD implementation using ONNX Runtime
 */
export class SileroVAD extends EventEmitter<SileroVADEvents> {
  private session: ort.InferenceSession | null = null;
  private config: Required<SileroVADConfig>;
  private state: 'non-speech' | 'speech' = 'non-speech';

  // Model states (LSTM hidden states)
  private h: ort.Tensor | null = null;
  private c: ort.Tensor | null = null;
  private srTensor: ort.Tensor;

  // Buffer management
  private audioBuffer: Float32Array[] = [];
  private speechStartTime: number = 0;
  private consecutiveSilenceMs: number = 0;
  private currentSegmentStart: number = 0;
  private frameSize: number = 512; // v5 model default

  // Probability tracking
  private positiveSpeechFrames: number = 0;

  constructor(config: SileroVADConfig) {
    super();

    // Set default configuration
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
      provider: config.provider ?? 'silero',
      positiveSpeechThreshold: config.positiveSpeechThreshold ?? 0.3,
      negativeSpeechThreshold: config.negativeSpeechThreshold ?? 0.25,
      silenceDuration: config.silenceDuration ?? 1400,
      preSpeechPadDuration: config.preSpeechPadDuration ?? 800,
      minSpeechDuration: config.minSpeechDuration ?? 400,
      modelPath: config.modelPath ?? '/models/silero_vad_v5.onnx',
      modelVersion: config.modelVersion ?? 'v5',
      returnProbabilities: config.returnProbabilities ?? true,
      bufferSize: config.bufferSize ?? (16000 * 2), // 2 seconds buffer
    } as Required<SileroVADConfig>;

    this.frameSize = this.config.modelVersion === 'v5' ? 512 : 1536;
    this.srTensor = new ort.Tensor('int64', [16000n]);
  }

  /**
   * Initialize the Silero VAD model
   */
  async initialize(): Promise<void> {
    try {
      // Configure ONNX Runtime
      ort.env.wasm.wasmPaths = '/';

      // Load ONNX model
      this.session = await ort.InferenceSession.create(
        this.config.modelPath,
        {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        }
      );

      // Initialize model states
      this.resetStates();

      console.log('Silero VAD initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Silero VAD:', error);
      throw error;
    }
  }

  /**
   * Reset LSTM hidden states
   */
  private resetStates(): void {
    // LSTM hidden states initialization
    const stateShape: [number, number, number] = [2, 1, 64];
    this.h = new ort.Tensor(
      'float32',
      new Float32Array(2 * 1 * 64).fill(0),
      stateShape
    );
    this.c = new ort.Tensor(
      'float32',
      new Float32Array(2 * 1 * 64).fill(0),
      stateShape
    );
  }

  /**
   * Process audio data and return VAD results
   */
  async process(audioData: Float32Array, timestamp: number): Promise<{
    isSpeech: boolean;
    probability: number;
  }> {
    // Ensure audio is at 16kHz (assuming input is already 16kHz)
    // If resampling is needed, it should be added here

    // Add to buffer (for pre-speech padding)
    this.audioBuffer.push(new Float32Array(audioData));

    // Limit buffer size
    const maxBufferFrames = Math.ceil(this.config.bufferSize / audioData.length);
    if (this.audioBuffer.length > maxBufferFrames) {
      this.audioBuffer.shift();
    }

    // Process audio in frames
    let offset = 0;
    let avgProbability = 0;
    let frameCount = 0;

    while (offset + this.frameSize <= audioData.length) {
      const frame = audioData.slice(offset, offset + this.frameSize);
      const probability = await this.processFrame(frame, timestamp);

      avgProbability += probability;
      frameCount++;

      // Emit real-time probability if configured
      if (this.config.returnProbabilities) {
        this.emit('probability', probability);
      }

      offset += this.frameSize;
    }

    // Calculate average probability for this chunk
    const finalProbability = frameCount > 0 ? avgProbability / frameCount : 0;

    // Update VAD state machine
    const isSpeech = this.updateVADState(finalProbability, timestamp);

    return {
      isSpeech,
      probability: finalProbability
    };
  }

  /**
   * Process a single frame through the model
   */
  private async processFrame(frame: Float32Array, _timestamp: number): Promise<number> {
    if (!this.session || !this.h || !this.c) {
      throw new Error('SileroVAD not initialized');
    }

    // Prepare input tensor
    const inputTensor = new ort.Tensor('float32', frame, [1, frame.length]);

    // Prepare feeds for the model
    const feeds: Record<string, ort.Tensor> = {
      'input': inputTensor,
      'h': this.h,
      'c': this.c,
      'sr': this.srTensor
    };

    // Run inference
    const results = await this.session.run(feeds);

    // Update states
    this.h = results.hn as ort.Tensor;
    this.c = results.cn as ort.Tensor;

    // Get speech probability
    const probability = (results.output as ort.Tensor).data[0] as number;

    return probability;
  }

  /**
   * Update VAD state based on probability
   */
  private updateVADState(probability: number, timestamp: number): boolean {
    if (this.state === 'non-speech') {
      // Check for speech start
      if (probability > this.config.positiveSpeechThreshold) {
        this.state = 'speech';
        this.speechStartTime = timestamp;
        this.currentSegmentStart = timestamp;
        this.consecutiveSilenceMs = 0;
        this.positiveSpeechFrames = 1;

        // Emit speech start event
        const eventData: VADEventData = {
          isSpeech: true,
          probability,
          timestamp
        };
        this.emit('speech-start', eventData);
      }
    } else if (this.state === 'speech') {
      // In speech state
      if (probability < this.config.negativeSpeechThreshold) {
        // Accumulate silence time
        const frameTimeMs = (this.frameSize / 16000) * 1000;
        this.consecutiveSilenceMs += frameTimeMs;

        // Check if speech should end
        if (this.consecutiveSilenceMs >= this.config.silenceDuration) {
          // Check minimum speech duration
          const speechDuration = timestamp - this.speechStartTime;

          if (speechDuration >= this.config.minSpeechDuration) {
            // Valid speech segment, create segment with pre-padding
            const segment = this.createSpeechSegment(timestamp);

            // Emit speech end event
            const eventData: VADEventData = {
              isSpeech: false,
              probability,
              timestamp,
              segment
            };
            this.emit('speech-end', eventData);
            this.emit('speech-segment', segment);
          }

          // Reset state
          this.state = 'non-speech';
          this.consecutiveSilenceMs = 0;
          this.positiveSpeechFrames = 0;
        }
      } else if (probability > this.config.positiveSpeechThreshold) {
        // Speech continues, reset silence timer
        this.consecutiveSilenceMs = 0;
        this.positiveSpeechFrames++;
      }
      // Probabilities between thresholds are ignored
    }

    return this.state === 'speech';
  }

  /**
   * Create a speech segment with pre-padding
   */
  private createSpeechSegment(endTime: number): { start: number; end: number; duration: number; audioData?: Float32Array } {
    // Calculate pre-padding start position
    const prePadSamples = (this.config.preSpeechPadDuration * 16000) / 1000;
    const prePadFrames = Math.ceil(prePadSamples / this.frameSize);

    // Extract audio data from buffer (including pre-padding)
    const startIndex = Math.max(0, this.audioBuffer.length - prePadFrames);
    const segmentData: Float32Array[] = this.audioBuffer.slice(startIndex);

    // Merge audio data
    const totalLength = segmentData.reduce((sum, chunk) => sum + chunk.length, 0);
    const audioData = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of segmentData) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }

    return {
      start: this.currentSegmentStart - this.config.preSpeechPadDuration,
      end: endTime,
      duration: endTime - this.currentSegmentStart + this.config.preSpeechPadDuration,
      audioData
    };
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.state = 'non-speech';
    this.consecutiveSilenceMs = 0;
    this.speechStartTime = 0;
    this.positiveSpeechFrames = 0;
    this.audioBuffer = [];
    this.resetStates();
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.h = null;
    this.c = null;
    this.removeAllListeners();
  }

  /**
   * Check if Silero VAD is supported (WebAssembly required)
   */
  static isSupported(): boolean {
    return typeof WebAssembly !== 'undefined';
  }
}