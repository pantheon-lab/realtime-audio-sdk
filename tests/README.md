# VAD Testing Guide

## Overview

This directory contains comprehensive tests for Voice Activity Detection (VAD) algorithms, including both energy-based and Silero neural network-based approaches.

## Test Files

- **`vad_test_en.wav`** - Real English speech audio file for testing (16kHz, mono)
- **`vad.test.ts`** - Main VAD test suite with functionality tests
- **`vad-accuracy.test.ts`** - Accuracy-focused tests with metrics calculation
- **`utils/audio-loader.ts`** - Utility for loading and processing WAV files

## Prerequisites

1. **Install dependencies:**
```bash
npm install
```

2. **Download Silero VAD model:**
```bash
npm run download-model
```

3. **Ensure test audio file exists:**
The file `tests/vad_test_en.wav` must be present.

## Running Tests

### Run all VAD tests:
```bash
npm run test:vad
```

### Run accuracy tests only:
```bash
npm run test:vad:accuracy
```

### Run with coverage:
```bash
npm run test:coverage -- tests/vad.test.ts
```

### Run in watch mode:
```bash
npx vitest watch tests/vad.test.ts
```

## Test Categories

### 1. Energy VAD Tests
- Basic speech detection with configurable thresholds
- Minimum duration requirements
- Energy calculation verification
- Edge case handling

### 2. Silero VAD Tests
- Neural network model initialization
- Speech probability calculation
- Event emission (start/end/segment)
- Threshold configuration testing

### 3. Accuracy Tests
- Frame-by-frame analysis
- Precision, Recall, and F1 score calculation
- Comparison between Energy and Silero VAD
- Robustness testing with audio modifications

### 4. Performance Benchmarks
- Processing speed (real-time ratio)
- Memory usage
- CPU utilization

## Test Metrics

The tests measure several key metrics:

- **Precision**: Correctly detected speech / All detected speech
- **Recall**: Correctly detected speech / All actual speech
- **F1 Score**: Harmonic mean of precision and recall
- **Real-time Ratio**: Audio duration / Processing time
- **Speech Ratio**: Speech frames / Total frames

## Expected Results

### Energy VAD
- F1 Score: > 50%
- Real-time ratio: > 100x
- Low CPU usage: < 5%

### Silero VAD
- F1 Score: > 70%
- Real-time ratio: > 1x
- Moderate CPU usage: 5-15%
- Speech probability range: 0.0 - 1.0

## Customizing Tests

### Adjusting Ground Truth

Edit `vad-accuracy.test.ts` to update ground truth segments:

```typescript
const groundTruthSpeechSegments = [
  [500, 2000],   // Speech from 500ms to 2000ms
  [2500, 4500],  // Speech from 2500ms to 4500ms
  // Add more segments...
];
```

### Testing Different Configurations

Modify the test configurations in the test files:

```typescript
const config: SileroVADConfig = {
  enabled: true,
  provider: 'silero',
  positiveSpeechThreshold: 0.3,  // Adjust threshold
  negativeSpeechThreshold: 0.25,  // Adjust threshold
  silenceDuration: 1400,          // Adjust timing
  minSpeechDuration: 400,         // Adjust timing
};
```

## Troubleshooting

### Model not found
```bash
npm run download-model
```

### Test timeout
Increase timeout in `vite.config.ts`:
```typescript
testTimeout: 60000, // 60 seconds
```

### Memory issues
Run tests individually:
```bash
npx vitest run tests/vad.test.ts -t "specific test name"
```

## Test Output Example

```
=== VAD Accuracy Test Setup ===
Audio file: vad_test_en.wav
Duration: 60.00s
Sample rate: 16000Hz
Total frames: 3000 (20ms each)

--- Testing Energy VAD ---
Threshold 0.01: precision=65.0%, recall=70.0%, f1=67.4%
Best configuration: threshold=0.01, f1Score=67.4%

--- Testing Silero VAD ---
Silero VAD Results: precision=85.0%, recall=88.0%, f1Score=86.5%
Optimal configuration: Balanced (0.5/0.45), f1Score=86.5%

Performance:
  Energy VAD: 150x real-time, 2ms processing
  Silero VAD: 3x real-time, 200ms processing
```

## Contributing

When adding new tests:
1. Use real audio files when possible
2. Include ground truth annotations
3. Test multiple configurations
4. Measure both accuracy and performance
5. Document expected results