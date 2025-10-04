# Realtime Audio SDK

A powerful Web SDK for real-time audio capture, processing, and encoding. Perfect for building voice-based applications like transcription, translation, and AI conversations.

## Features

- **📱 Device Management** - List, select, and auto-switch audio input devices with hot-plug detection
- **🎤 Precise Audio Capture** - Capture audio in exact time chunks (20ms, 40ms, or 60ms)
- **🔊 Audio Processing** - Voice Activity Detection (VAD) and audio normalization
- **📦 Flexible Encoding** - Opus encoding via WebCodecs with PCM fallback
- **⚡ Low Latency** - Built on AudioWorklet for minimal latency
- **🎯 TypeScript** - Full type safety and excellent IDE support

## Use Cases

- Real-time transcription
- Real-time translation
- AI-powered voice conversations
- Voice commands and control
- Audio streaming applications

## Installation

```bash
npm install @realtime-ai/audio-sdk
```

## Quick Start

```typescript
import { RealtimeAudioSDK } from '@realtime-ai/audio-sdk';

// Initialize SDK
const sdk = new RealtimeAudioSDK({
  sampleRate: 16000,
  channelCount: 1,
  frameSize: 20, // 20ms chunks
  encoding: {
    enabled: true,
    codec: 'opus',
    bitrate: 16000,
  },
  processing: {
    vad: {
      enabled: true,
      threshold: 0.02,
    },
    normalize: true,
  },
});

// Listen for audio data
sdk.on('audio-data', (chunk) => {
  // Send encoded audio to your service
  websocket.send(chunk.data);
});

// Listen for speech detection
sdk.on('processed-audio', (data) => {
  console.log('Speech detected:', data.isSpeech);
  console.log('Audio energy:', data.energy);
});

// Start recording
await sdk.start();
```

## Configuration

### SDKConfig

```typescript
interface SDKConfig {
  deviceId?: string;              // Audio input device ID
  sampleRate?: number;            // Sample rate in Hz (default: 16000)
  channelCount?: number;          // Number of channels (default: 1)
  frameSize?: 20 | 40 | 60;      // Frame size in ms (default: 20)
  encoding?: EncodingConfig;
  processing?: ProcessingConfig;
  autoSwitchDevice?: boolean;     // Auto-switch on device unplug (default: true)
}
```

### Encoding Configuration

```typescript
interface EncodingConfig {
  enabled: boolean;              // Enable encoding
  codec: 'opus' | 'pcm';        // Codec to use
  bitrate?: number;             // Bitrate for Opus (default: 16000)
  complexity?: number;          // Opus complexity 0-10 (default: 5)
}
```

### Processing Configuration

```typescript
interface ProcessingConfig {
  vad?: {
    enabled: boolean;
    threshold?: number;          // Energy threshold 0-1 (default: 0.5)
    minSpeechDuration?: number;  // Min speech duration in ms (default: 100)
    minSilenceDuration?: number; // Min silence duration in ms (default: 300)
  };
  normalize?: boolean;           // Enable audio normalization
}
```

## API Reference

### RealtimeAudioSDK

#### Methods

- `start(): Promise<void>` - Start audio capture
- `stop(): Promise<void>` - Stop audio capture
- `pause(): Promise<void>` - Pause audio capture
- `resume(): Promise<void>` - Resume audio capture
- `getDevices(): Promise<MediaDeviceInfo[]>` - Get available audio devices
- `setDevice(deviceId: string): Promise<void>` - Set audio input device
- `updateConfig(config: Partial<SDKConfig>): Promise<void>` - Update configuration
- `getState(): SDKState` - Get current state
- `destroy(): Promise<void>` - Cleanup and destroy SDK instance

#### Events

- `audio-data` - Encoded audio chunk available
- `raw-audio` - Raw audio data (when encoding disabled)
- `processed-audio` - Processed audio data (after VAD/normalization)
- `device-changed` - Audio device changed
- `devices-updated` - Device list updated
- `device-unplugged` - Current device unplugged
- `state-changed` - SDK state changed
- `error` - Error occurred

## Examples

### Device Selection

```typescript
// Get all audio devices
const devices = await sdk.getDevices();
console.log('Available devices:', devices);

// Select a specific device
await sdk.setDevice(devices[0].deviceId);

// Listen for device changes
sdk.on('device-unplugged', (deviceId) => {
  console.log('Device unplugged:', deviceId);
  // SDK will auto-switch if autoSwitchDevice is enabled
});
```

### Voice Activity Detection

```typescript
const sdk = new RealtimeAudioSDK({
  processing: {
    vad: {
      enabled: true,
      threshold: 0.02,
      minSpeechDuration: 100,
      minSilenceDuration: 300,
    },
  },
});

sdk.on('processed-audio', (data) => {
  if (data.isSpeech) {
    console.log('Speech detected!');
  }
});
```

### Real-time Transcription

```typescript
const sdk = new RealtimeAudioSDK({
  frameSize: 20,
  encoding: {
    enabled: true,
    codec: 'opus',
  },
});

// Connect to transcription service
const ws = new WebSocket('wss://transcription-service.com/ws');

sdk.on('audio-data', (chunk) => {
  ws.send(chunk.data);
});

ws.onmessage = (event) => {
  const result = JSON.parse(event.data);
  console.log('Transcript:', result.text);
};

await sdk.start();
```

## Browser Compatibility

- Chrome/Edge 94+ (WebCodecs support)
- Firefox 100+ (AudioWorklet support)
- Safari 16.4+ (WebCodecs support)
- Mobile: iOS 16.4+, Android Chrome 94+

For browsers without WebCodecs support, the SDK automatically falls back to PCM encoding.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build library
npm run build

# Run tests
npm test

# Type check
npm run type-check
```

## Examples

Check out the [examples](./examples) directory:
- [Basic Example](./examples/basic/index.html) - Device selection and audio capture
- [Transcription Example](./examples/transcription/index.html) - Real-time transcription setup

## License

MIT © realtime-ai
