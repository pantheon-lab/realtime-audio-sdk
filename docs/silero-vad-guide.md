# Silero VAD Integration Guide

## Overview

Silero VAD is a state-of-the-art neural network-based Voice Activity Detection system integrated into the Realtime Audio SDK. It provides more accurate speech detection compared to traditional energy-based methods, especially in noisy environments.

## Features

- **Neural Network-based Detection**: Uses ONNX Runtime for efficient inference
- **Real-time Speech Probability**: Returns continuous probability values (0-1)
- **Speech Segmentation**: Automatically detects speech segments with pre-speech padding
- **Configurable Thresholds**: Fine-tune detection sensitivity for your use case
- **Dual VAD Support**: Switch between energy-based and Silero VAD

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Download Silero VAD Model

```bash
npm run download-model
```

This downloads the Silero VAD ONNX model (~4.4MB) to `public/models/silero_vad_v5.onnx`.

## Usage

### Basic Setup

```typescript
import { RealtimeAudioSDK } from '@realtime-ai/audio-sdk';

const sdk = new RealtimeAudioSDK({
  sampleRate: 16000,
  channelCount: 1,
  frameSize: 20,
  processing: {
    vad: {
      enabled: true,
      provider: 'silero',  // Enable Silero VAD
      modelPath: '/models/silero_vad_v5.onnx'
    }
  }
});

// Start recording
await sdk.start();
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | `'energy' \| 'silero'` | `'energy'` | VAD provider to use |
| `positiveSpeechThreshold` | `number` | `0.3` | Threshold for detecting speech start (0-1) |
| `negativeSpeechThreshold` | `number` | `0.25` | Threshold for detecting speech end (0-1) |
| `silenceDuration` | `number` | `1400` | Silence duration to end speech segment (ms) |
| `preSpeechPadDuration` | `number` | `800` | Audio padding before speech start (ms) |
| `minSpeechDuration` | `number` | `400` | Minimum duration to consider as speech (ms) |
| `returnProbabilities` | `boolean` | `true` | Return real-time speech probabilities |

### Event Listeners

#### Speech Start/End Events

```typescript
sdk.on('vad-speech-start', (data) => {
  console.log('Speech started', {
    probability: data.probability,
    timestamp: data.timestamp
  });
});

sdk.on('vad-speech-end', (data) => {
  console.log('Speech ended', {
    probability: data.probability,
    duration: data.segment?.duration
  });
});
```

#### Complete Speech Segments

```typescript
sdk.on('vad-speech-segment', (segment) => {
  console.log('Speech segment detected', {
    start: segment.start,
    end: segment.end,
    duration: segment.duration
  });

  // Send audio segment for transcription
  if (segment.audioData) {
    sendToTranscriptionAPI(segment.audioData);
  }
});
```

#### Real-time Probability

```typescript
sdk.on('vad-probability', (probability) => {
  // Update UI with speech probability (0-1)
  updateVolumeIndicator(probability);
});
```

#### Processed Audio with VAD Info

```typescript
sdk.on('processed-audio', (data) => {
  if (data.speechProbability !== undefined) {
    console.log(`Speech probability: ${(data.speechProbability * 100).toFixed(1)}%`);

    // Custom logic based on confidence levels
    if (data.speechProbability > 0.8) {
      // High confidence speech
    } else if (data.speechProbability > 0.5) {
      // Medium confidence speech
    }
  }
});
```

## Advanced Usage

### Custom Configuration

```typescript
const sdk = new RealtimeAudioSDK({
  processing: {
    vad: {
      enabled: true,
      provider: 'silero',

      // Fine-tune for your environment
      positiveSpeechThreshold: 0.5,    // More strict speech detection
      negativeSpeechThreshold: 0.15,   // Quicker to end speech
      silenceDuration: 1000,            // 1 second silence to end
      preSpeechPadDuration: 500,       // 500ms pre-padding
      minSpeechDuration: 300,          // Minimum 300ms speech

      // Performance options
      returnProbabilities: false,       // Disable if not needed
      modelPath: '/models/silero_vad_v5.onnx',
      modelVersion: 'v5'               // or 'legacy' for older model
    }
  }
});
```

### Switching VAD Providers at Runtime

```typescript
// Start with energy-based VAD
const sdk = new RealtimeAudioSDK({
  processing: {
    vad: {
      enabled: true,
      provider: 'energy'
    }
  }
});

// Switch to Silero VAD
await sdk.updateConfig({
  processing: {
    vad: {
      enabled: true,
      provider: 'silero',
      modelPath: '/models/silero_vad_v5.onnx'
    }
  }
});
```

### Processing Speech Segments

```typescript
// Collect speech segments for batch processing
const speechSegments: Float32Array[] = [];

sdk.on('vad-speech-segment', (segment) => {
  if (segment.audioData) {
    speechSegments.push(segment.audioData);

    // Process when we have enough segments
    if (speechSegments.length >= 5) {
      processBatch(speechSegments);
      speechSegments.length = 0;
    }
  }
});
```

## Performance Considerations

### CPU Usage

- **Energy VAD**: Minimal CPU usage (~1-2%)
- **Silero VAD**: Higher CPU usage (~5-15%) due to neural network inference

### Memory Usage

- Model size: ~4.4MB
- Runtime memory: ~10-20MB including buffers

### Latency

- Frame processing: <10ms per frame
- Total latency: 20-60ms depending on frame size

## Comparison: Energy vs Silero VAD

| Feature | Energy VAD | Silero VAD |
|---------|------------|------------|
| **Accuracy** | Good | Excellent |
| **Noise Handling** | Basic | Advanced |
| **CPU Usage** | Very Low | Moderate |
| **Configuration** | Simple | Extensive |
| **Speech Probability** | No | Yes |
| **Pre-speech Padding** | No | Yes |
| **False Positives** | More | Less |

## Troubleshooting

### Model Loading Issues

If the model fails to load:

1. Ensure the model file exists:
```bash
ls -la public/models/silero_vad_v5.onnx
```

2. Re-download the model:
```bash
npm run download-model
```

3. Check console for ONNX Runtime errors

### High CPU Usage

If CPU usage is too high:

1. Increase frame size (40ms or 60ms)
2. Disable `returnProbabilities`
3. Use energy-based VAD for less critical applications

### Detection Issues

If speech detection is not working well:

1. Adjust thresholds based on your environment:
   - Noisy: Higher `positiveSpeechThreshold` (0.5-0.7)
   - Quiet: Lower `positiveSpeechThreshold` (0.2-0.3)

2. Tune timing parameters:
   - Fast response: Lower `silenceDuration` (500-1000ms)
   - Avoid cutting off: Higher `silenceDuration` (1500-2000ms)

## Examples

### Web Application

See `examples/silero-vad-example.html` for a complete web application demonstrating:
- VAD provider switching
- Real-time probability visualization
- Speech segment detection
- Configuration tuning

### Node.js Application

See `examples/silero-vad-node.js` for a Node.js example showing:
- Server-side audio processing
- Speech segment collection
- Statistics tracking

## Browser Compatibility

- **Chrome**: ✅ Full support
- **Firefox**: ✅ Full support
- **Safari**: ✅ Full support (16.4+)
- **Edge**: ✅ Full support

Note: WebAssembly is required for ONNX Runtime.

## Resources

- [Silero VAD GitHub](https://github.com/snakers4/silero-vad)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [Realtime Audio SDK Docs](../README.md)