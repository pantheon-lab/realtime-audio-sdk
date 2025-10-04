/**
 * Audio frame size in milliseconds
 */
export type FrameSize = 20 | 40 | 60;

/**
 * Supported audio codecs
 */
export type AudioCodec = 'opus' | 'pcm';

/**
 * SDK state
 */
export type SDKState = 'idle' | 'recording' | 'paused' | 'error';

/**
 * Audio capture configuration
 */
export interface CaptureOptions {
  /** Device ID to capture from */
  deviceId?: string;
  /** Sample rate in Hz (default: 16000) */
  sampleRate: number;
  /** Number of audio channels (default: 1 for mono) */
  channelCount: number;
  /** Frame size in milliseconds */
  frameSize: FrameSize;
}

/**
 * VAD provider types
 */
export type VADProvider = 'energy' | 'silero';

/**
 * Silero VAD configuration
 */
export interface SileroVADConfig {
  /** Enable VAD */
  enabled: boolean;
  /** VAD provider */
  provider: 'silero';

  // Silero specific parameters
  /** Speech detection threshold (0-1, default: 0.3) */
  positiveSpeechThreshold?: number;
  /** Non-speech threshold (0-1, default: 0.25) */
  negativeSpeechThreshold?: number;
  /** Silence duration for ending speech segment in ms (default: 1400) */
  silenceDuration?: number;
  /** Pre-speech padding duration in ms (default: 800) */
  preSpeechPadDuration?: number;
  /** Minimum speech duration in ms (default: 400) */
  minSpeechDuration?: number;

  // Model configuration
  /** ONNX model path */
  modelPath?: string;
  /** Model version (v5: 512 samples, legacy: 1536 samples) */
  modelVersion?: 'v5' | 'legacy';

  // Advanced options
  /** Return real-time probabilities */
  returnProbabilities?: boolean;
  /** Audio buffer size */
  bufferSize?: number;
}

/**
 * Energy-based VAD configuration
 */
export interface EnergyVADConfig {
  /** Enable VAD */
  enabled: boolean;
  /** VAD provider */
  provider?: 'energy';
  /** Energy threshold (0-1, default: 0.5) */
  threshold?: number;
  /** Minimum speech duration in ms (default: 100) */
  minSpeechDuration?: number;
  /** Minimum silence duration in ms (default: 300) */
  minSilenceDuration?: number;
}

/**
 * Voice Activity Detection configuration (union type)
 */
export type VADConfig = EnergyVADConfig | SileroVADConfig;

/**
 * Audio encoding configuration
 */
export interface EncodingConfig {
  /** Enable encoding */
  enabled: boolean;
  /** Codec to use */
  codec: AudioCodec;
  /** Bitrate for Opus encoding (default: 16000) */
  bitrate?: number;
  /** Opus complexity 0-10 (default: 5) */
  complexity?: number;
}

/**
 * Audio processing configuration
 */
export interface ProcessingConfig {
  /** Voice Activity Detection config */
  vad?: VADConfig;
  /** Enable audio normalization */
  normalize?: boolean;
}

/**
 * Main SDK configuration
 */
export interface SDKConfig {
  /** Device ID to use (optional, uses default if not specified) */
  deviceId?: string;
  /** Sample rate in Hz (default: 16000) */
  sampleRate?: number;
  /** Number of channels (default: 1) */
  channelCount?: number;
  /** Frame size in ms (default: 20) */
  frameSize?: FrameSize;
  /** Encoding configuration */
  encoding?: EncodingConfig;
  /** Processing configuration */
  processing?: ProcessingConfig;
  /** Auto-switch to default device when current device is unplugged */
  autoSwitchDevice?: boolean;
}

/**
 * Unified audio data event
 */
export interface AudioDataEvent {
  /** Core audio data */
  audio: {
    /** Raw audio samples */
    raw: Float32Array;
    /** Encoded audio data (if encoding enabled) */
    encoded?: ArrayBuffer;
    /** Encoding format */
    format?: AudioCodec;
  };

  /** Audio metadata */
  metadata: {
    /** Timestamp in milliseconds */
    timestamp: number;
    /** Frame index */
    frameIndex: number;
    /** Sample rate in Hz */
    sampleRate: number;
    /** Number of channels */
    channelCount: number;
    /** Frame size in milliseconds */
    frameSize: number;
  };

  /** Processing results */
  processing: {
    /** Audio energy (RMS) */
    energy: number;
    /** Whether audio was normalized */
    normalized: boolean;

    /** VAD results (if VAD enabled) */
    vad?: {
      /** Whether VAD is active */
      active: boolean;
      /** Is speech detected */
      isSpeech: boolean;
      /** Speech probability (0-1) */
      probability: number;
      /** Confidence level */
      confidence: 'high' | 'medium' | 'low';
    };
  };
}

/**
 * VAD state change event
 */
export interface VADStateEvent {
  /** Event type */
  type: 'start' | 'end';
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Speech probability at transition */
  probability: number;
  /** Duration of speech (only for 'end' event) */
  duration?: number;
}

/**
 * VAD speech segment event
 */
export interface VADSegmentEvent {
  /** Complete audio segment with pre-padding */
  audio: Float32Array;
  /** Start timestamp in milliseconds */
  startTime: number;
  /** End timestamp in milliseconds */
  endTime: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Average speech probability */
  avgProbability: number;
  /** Segment confidence score (0-1) */
  confidence: number;
}

/**
 * Device event
 */
export interface DeviceEvent {
  /** Event type */
  type: 'changed' | 'list-updated' | 'unplugged';
  /** Current device (for 'changed') */
  device?: MediaDeviceInfo;
  /** Device list (for 'list-updated') */
  devices?: MediaDeviceInfo[];
  /** Device ID (for 'unplugged') */
  deviceId?: string;
}

/**
 * SDK error with context
 */
export interface SDKError extends Error {
  /** Error code */
  code?: string;
  /** Error context */
  context?: Record<string, unknown>;
}

/**
 * Audio worklet message types
 */
export interface AudioWorkletMessage {
  type: 'audio-data' | 'config' | 'state';
  data?: Float32Array;
  config?: {
    frameSize: FrameSize;
    sampleRate: number;
  };
  state?: 'started' | 'stopped';
}

/**
 * SDK event types
 */
export interface SDKEvents {
  /** Unified audio data event (fired for each frame) */
  'audio': (event: AudioDataEvent) => void;

  /** VAD state change events */
  'speech-state': (event: VADStateEvent) => void;
  'speech-segment': (event: VADSegmentEvent) => void;

  /** Device events */
  'device': (event: DeviceEvent) => void;

  /** System events */
  'state': (state: SDKState) => void;
  'error': (error: SDKError) => void;
}

/**
 * Audio processor result
 */
export interface AudioProcessorResult {
  /** Processed audio data */
  data: Float32Array;
  /** Audio energy (RMS) */
  energy: number;
  /** Whether audio was normalized */
  normalized: boolean;
  /** VAD results (if enabled) */
  vad?: {
    isSpeech: boolean;
    probability: number;
  };
  /** Timestamp */
  timestamp: number;
}

/**
 * Event listener type
 */
export type EventListener<T = any> = (data: T) => void;

/**
 * Opus encoder configuration for WebCodecs
 */
export interface OpusEncoderConfig {
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  numberOfChannels: number;
  /** Bitrate */
  bitrate: number;
  /** Frame size in ms */
  frameSize: FrameSize;
  /** Complexity 0-10 */
  complexity?: number;
}
