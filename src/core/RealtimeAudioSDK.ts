import { EventEmitter } from './EventEmitter';
import { AudioCapture } from '@/capture/AudioCapture';
import { DeviceManager } from '@/devices/DeviceManager';
import { AudioProcessor } from '@/processing/AudioProcessor';
import { OpusEncoder } from '@/encoding/OpusEncoder';
import { PCMEncoder } from '@/encoding/PCMEncoder';
import type {
  SDKConfig,
  SDKEvents,
  SDKState,
  CaptureOptions,
  AudioDataEvent,
  DeviceEvent,
  SDKError,
} from '@/types';

/**
 * Main RealtimeAudioSDK class
 */
export class RealtimeAudioSDK extends EventEmitter<SDKEvents> {
  private config: Required<SDKConfig>;
  private state: SDKState = 'idle';
  private deviceManager: DeviceManager;
  private audioCapture: AudioCapture;
  private audioProcessor: AudioProcessor;
  private encoder: OpusEncoder | PCMEncoder | null = null;
  private frameCounter: number = 0;

  constructor(config: SDKConfig = {}) {
    super();

    // Set default config
    this.config = {
      deviceId: config.deviceId || '',
      sampleRate: config.sampleRate || 16000,
      channelCount: config.channelCount || 1,
      frameSize: config.frameSize || 20,
      encoding: {
        enabled: config.encoding?.enabled ?? true,
        codec: config.encoding?.codec || 'opus',
        bitrate: config.encoding?.bitrate || 16000,
        complexity: config.encoding?.complexity || 5,
      },
      processing: config.processing || {},
      autoSwitchDevice: config.autoSwitchDevice ?? true,
    };

    // Initialize modules
    this.deviceManager = new DeviceManager();
    this.audioCapture = new AudioCapture();
    this.audioProcessor = new AudioProcessor(this.config.processing);

    this.setupEventHandlers();
  }

  /**
   * Setup internal event handlers
   */
  private setupEventHandlers(): void {
    // Device change events
    this.deviceManager.on('device-changed', (devices) => {
      const event: DeviceEvent = {
        type: 'list-updated',
        devices
      };
      this.emit('device', event);
    });

    this.deviceManager.on('device-unplugged', async (deviceId) => {
      const event: DeviceEvent = {
        type: 'unplugged',
        deviceId
      };
      this.emit('device', event);

      // Auto-switch to default device if enabled
      if (this.config.autoSwitchDevice && this.state === 'recording') {
        try {
          const defaultDevice = await this.deviceManager.getDefaultDevice();
          if (defaultDevice) {
            await this.setDevice(defaultDevice.deviceId);
          }
        } catch (error) {
          this.handleError(error as Error);
        }
      }
    });

    // Audio capture events
    this.audioCapture.on('audio-data', async ({ data, timestamp }) => {
      try {
        await this.handleAudioFrame(data, timestamp);
      } catch (error) {
        this.handleError(error as Error);
      }
    });

    this.audioCapture.on('error', (error) => {
      this.handleError(error);
    });

    // VAD events from AudioProcessor
    this.audioProcessor.on('speech-state', (event) => {
      this.emit('speech-state', event);
    });

    this.audioProcessor.on('speech-segment', (event) => {
      this.emit('speech-segment', event);
    });
  }

  /**
   * Handle incoming audio frame
   */
  private async handleAudioFrame(
    rawData: Float32Array,
    timestamp: number
  ): Promise<void> {
    // Process audio
    const processed = await this.audioProcessor.process(rawData, timestamp);

    // Encode if enabled
    let encoded: ArrayBuffer | undefined;
    if (this.config.encoding.enabled && this.encoder) {
      const encodedChunk = await this.encoder.encode(processed.data, timestamp);
      if (encodedChunk) {
        encoded = encodedChunk.data;
      }
    }

    // Build unified audio event
    const audioEvent: AudioDataEvent = {
      audio: {
        raw: processed.data,
        encoded,
        format: encoded ? this.config.encoding.codec : undefined
      },
      metadata: {
        timestamp,
        frameIndex: this.frameCounter++,
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channelCount,
        frameSize: this.config.frameSize
      },
      processing: {
        energy: processed.energy,
        normalized: processed.normalized,
        vad: processed.vad ? {
          active: true,
          isSpeech: processed.vad.isSpeech,
          probability: processed.vad.probability,
          confidence: this.getConfidenceLevel(processed.vad.probability)
        } : undefined
      }
    };

    // Emit unified audio event
    this.emit('audio', audioEvent);
  }

  /**
   * Get confidence level from probability
   */
  private getConfidenceLevel(probability: number): 'high' | 'medium' | 'low' {
    if (probability > 0.8) return 'high';
    if (probability > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Get all available audio input devices
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    return this.deviceManager.getDevices();
  }

  /**
   * Set the audio input device
   */
  async setDevice(deviceId: string): Promise<void> {
    if (this.state === 'recording') {
      // Switch device while recording
      const captureOptions = this.getCaptureOptions(deviceId);
      await this.audioCapture.switchDevice(deviceId, captureOptions);
      this.deviceManager.setCurrentDevice(deviceId);

      const device = await this.deviceManager.getDeviceById(deviceId);
      if (device) {
        const event: DeviceEvent = {
          type: 'changed',
          device
        };
        this.emit('device', event);
      }
    } else {
      // Just update config for next start
      this.config.deviceId = deviceId;
      this.deviceManager.setCurrentDevice(deviceId);
    }
  }

  /**
   * Start audio capture
   */
  async start(): Promise<void> {
    if (this.state === 'recording') {
      console.warn('Already recording');
      return;
    }

    try {
      this.setState('recording');

      // Request permission if not already granted
      const hasPermission = await this.deviceManager.requestPermission();
      if (!hasPermission) {
        throw new Error('Microphone permission denied');
      }

      // Get device to use
      let deviceId = this.config.deviceId;
      if (!deviceId) {
        const defaultDevice = await this.deviceManager.getDefaultDevice();
        if (!defaultDevice) {
          throw new Error('No audio input device available');
        }
        deviceId = defaultDevice.deviceId;
        this.config.deviceId = deviceId;
      }

      this.deviceManager.setCurrentDevice(deviceId);

      // Initialize audio processor if needed
      if (this.config.processing?.vad?.enabled) {
        await this.audioProcessor.initialize();
      }

      // Initialize encoder if needed
      if (this.config.encoding.enabled) {
        await this.initializeEncoder();
      }

      // Start capture
      const captureOptions = this.getCaptureOptions(deviceId);
      await this.audioCapture.start(captureOptions);

      console.log('Audio capture started');
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  /**
   * Stop audio capture
   */
  async stop(): Promise<void> {
    if (this.state === 'idle') {
      return;
    }

    try {
      // Flush any pending VAD speech segment
      this.audioProcessor.flush();

      await this.audioCapture.stop();

      if (this.encoder) {
        await this.encoder.flush();
        this.encoder.close();
        this.encoder = null;
      }

      this.setState('idle');
      console.log('Audio capture stopped');
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Pause audio capture
   */
  async pause(): Promise<void> {
    if (this.state !== 'recording') {
      return;
    }

    await this.audioCapture.stop();
    this.setState('paused');
  }

  /**
   * Resume audio capture
   */
  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      return;
    }

    const captureOptions = this.getCaptureOptions(this.config.deviceId);
    await this.audioCapture.start(captureOptions);
    this.setState('recording');
  }

  /**
   * Update SDK configuration
   */
  async updateConfig(config: Partial<SDKConfig>): Promise<void> {
    const wasRecording = this.state === 'recording';

    if (wasRecording) {
      await this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
      encoding: { ...this.config.encoding, ...config.encoding },
      processing: { ...this.config.processing, ...config.processing },
    };

    this.audioProcessor.updateConfig(this.config.processing);

    if (wasRecording) {
      await this.start();
    }
  }

  /**
   * Flush any pending speech segment
   * Useful when you want to force save the current speech segment
   * @param timestamp Optional timestamp to use as end time
   */
  flush(timestamp?: number): void {
    this.audioProcessor.flush(timestamp);
  }

  /**
   * Get current SDK state
   */
  getState(): SDKState {
    return this.state;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<SDKConfig> {
    return { ...this.config };
  }

  /**
   * Initialize encoder based on config
   */
  private async initializeEncoder(): Promise<void> {
    const encoderConfig = {
      sampleRate: this.config.sampleRate,
      numberOfChannels: this.config.channelCount,
      bitrate: this.config.encoding.bitrate || 16000,
      frameSize: this.config.frameSize,
      complexity: this.config.encoding.complexity || 5,
    };

    // Try Opus first if supported
    if (this.config.encoding.codec === 'opus' && OpusEncoder.isSupported()) {
      this.encoder = new OpusEncoder(encoderConfig);
      await this.encoder.initialize();
      console.log('Using Opus encoder (WebCodecs)');
    } else {
      // Fallback to PCM
      this.encoder = new PCMEncoder(encoderConfig);
      await this.encoder.initialize();
      console.log('Using PCM encoder (fallback)');
    }
  }

  /**
   * Get capture options from config
   */
  private getCaptureOptions(deviceId: string): CaptureOptions {
    return {
      deviceId,
      sampleRate: this.config.sampleRate,
      channelCount: this.config.channelCount,
      frameSize: this.config.frameSize,
    };
  }

  /**
   * Set SDK state and emit event
   */
  private setState(state: SDKState): void {
    this.state = state;
    this.emit('state', state);
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    this.setState('error');
    const sdkError: SDKError = error as SDKError;
    if (!sdkError.code) {
      sdkError.code = 'SDK_ERROR';
    }
    this.emit('error', sdkError);
    console.error('SDK Error:', error);
  }

  /**
   * Cleanup and destroy SDK instance
   */
  async destroy(): Promise<void> {
    await this.stop();
    await this.audioProcessor.close();
    this.removeAllListeners();
    this.deviceManager.removeAllListeners();
    this.audioCapture.removeAllListeners();
    this.audioProcessor.removeAllListeners();
  }
}
