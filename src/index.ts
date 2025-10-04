/**
 * Realtime Audio SDK - Main entry point
 */

export { RealtimeAudioSDK } from '@/core/RealtimeAudioSDK';
export { DeviceManager } from '@/devices/DeviceManager';
export { AudioProcessor } from '@/processing/AudioProcessor';
export { OpusEncoder } from '@/encoding/OpusEncoder';
export { PCMEncoder } from '@/encoding/PCMEncoder';

// Export types
export type {
  SDKConfig,
  SDKState,
  SDKEvents,
  CaptureOptions,
  EncodingConfig,
  ProcessingConfig,
  VADConfig,
  AudioDataEvent,
  DeviceEvent,
  VADStateEvent,
  VADSegmentEvent,
  SDKError,
  FrameSize,
  AudioCodec,
  OpusEncoderConfig,
} from '@/types';
