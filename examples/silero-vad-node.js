import { RealtimeAudioSDK } from '../dist/realtime-audio-sdk.js';

/**
 * Example: Using Silero VAD with Realtime Audio SDK
 */

async function main() {
  console.log('🎤 Realtime Audio SDK - Silero VAD Example\n');

  // Create SDK instance with Silero VAD
  const sdk = new RealtimeAudioSDK({
    sampleRate: 16000,
    channelCount: 1,
    frameSize: 20,
    processing: {
      vad: {
        enabled: true,

        // Silero VAD parameters
        positiveSpeechThreshold: 0.3,     // Speech detection threshold
        negativeSpeechThreshold: 0.25,    // Non-speech threshold
        silenceDuration: 1400,             // Silence duration to end speech (ms)
        preSpeechPadDuration: 800,        // Pre-speech padding (ms)
        minSpeechDuration: 400,           // Minimum speech duration (ms)

        // Advanced options
        modelPath: '/models/silero_vad_v5.onnx',  // Path to ONNX model
        modelVersion: 'v5',               // Model version
      }
    },
    encoding: {
      enabled: false,  // Use raw audio for this example
    }
  });

  // Track statistics
  let speechSegments = 0;
  let totalSpeechDuration = 0;
  let lastProbability = 0;

  // ====================
  // New Unified Event Listeners
  // ====================

  // Main audio event (includes all frame data)
  sdk.on('audio', (event) => {
    const { audio, metadata, processing } = event;

    // Real-time speech probability display
    if (processing.vad?.active) {
      if (Math.abs(processing.vad.probability - lastProbability) > 0.1) {
        process.stdout.write(`\rSpeech probability: ${(processing.vad.probability * 100).toFixed(1)}%  `);
        lastProbability = processing.vad.probability;
      }

      // Custom logic based on confidence levels
      if (processing.vad.confidence === 'high') {
        // High confidence speech - process immediately
      } else if (processing.vad.confidence === 'medium') {
        // Medium confidence - maybe buffer
      }
    }
  });

  // Speech state changes (start/end only)
  sdk.on('speech-state', (event) => {
    if (event.type === 'start') {
      console.log(`\n✅ Speech started`);
      console.log(`   Probability: ${(event.probability * 100).toFixed(1)}%`);
      console.log(`   Timestamp: ${event.timestamp}ms`);
    } else {
      console.log(`\n🔴 Speech ended`);
      console.log(`   Probability: ${(event.probability * 100).toFixed(1)}%`);
      console.log(`   Timestamp: ${event.timestamp}ms`);
      console.log(`   Duration: ${event.duration}ms`);
    }
  });

  // Complete speech segments
  sdk.on('speech-segment', (segment) => {
    speechSegments++;
    totalSpeechDuration += segment.duration;

    console.log(`\n📊 Speech Segment #${speechSegments}`);
    console.log(`   Start: ${segment.startTime}ms`);
    console.log(`   End: ${segment.endTime}ms`);
    console.log(`   Duration: ${segment.duration}ms`);
    console.log(`   Avg probability: ${(segment.avgProbability * 100).toFixed(1)}%`);
    console.log(`   Confidence: ${(segment.confidence * 100).toFixed(0)}%`);

    if (segment.audio) {
      console.log(`   Audio samples: ${segment.audio.length}`);
      console.log(`   (includes ${800}ms pre-speech padding)`);

      // Here you could:
      // 1. Send to speech recognition API
      // 2. Save to file
      // 3. Stream to server
      // Example: processSegmentForRecognition(segment.audio);
    }
  });

  // Error handling
  sdk.on('error', (error) => {
    console.error('\n❌ Error:', error.message);
  });

  // State changes
  sdk.on('state', (state) => {
    console.log(`\n📱 State changed: ${state}`);
  });

  // ====================
  // Start Recording
  // ====================

  console.log('\n🎙️ Starting recording with Silero VAD...\n');
  console.log('Configuration:');
  console.log('  • Positive threshold: 0.3');
  console.log('  • Negative threshold: 0.25');
  console.log('  • Silence duration: 1400ms');
  console.log('  • Pre-speech padding: 800ms');
  console.log('  • Min speech duration: 400ms\n');

  try {
    await sdk.start();
    console.log('✅ Recording started. Speak into your microphone...');
    console.log('Press Ctrl+C to stop.\n');
  } catch (error) {
    console.error('❌ Failed to start recording:', error);
    process.exit(1);
  }

  // ====================
  // Graceful Shutdown
  // ====================

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping recording...');

    try {
      await sdk.stop();
      await sdk.destroy();

      console.log('\n📈 Statistics:');
      console.log(`  • Speech segments detected: ${speechSegments}`);
      console.log(`  • Total speech duration: ${(totalSpeechDuration / 1000).toFixed(1)}s`);

      if (speechSegments > 0) {
        const avgDuration = totalSpeechDuration / speechSegments;
        console.log(`  • Average segment duration: ${avgDuration.toFixed(0)}ms`);
      }

      console.log('\n✅ Recording stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
}

// ====================
// Comparison with Energy VAD
// ====================

async function compareVADProviders() {
  console.log('\n📊 Comparing VAD Providers:\n');

  // Silero VAD Configuration
  const sileroSDK = new RealtimeAudioSDK({
    processing: {
      vad: {
        enabled: true,
        positiveSpeechThreshold: 0.3,
        negativeSpeechThreshold: 0.25,
        silenceDuration: 1400,
        preSpeechPadDuration: 800,
        minSpeechDuration: 400
      }
    }
  });

  console.log('Silero VAD Features:');
  console.log('  • Neural network-based detection');
  console.log('  • More accurate speech/noise discrimination');
  console.log('  • Returns speech probability (0-1)');
  console.log('  • Better handling of background noise');
  console.log('  • Automatic frame size alignment');
  console.log('  • Includes pre-speech padding for context');
  console.log('  • Higher CPU usage (ONNX inference)\n');

  // Cleanup
  await energySDK.destroy();
  await sileroSDK.destroy();
}

// Run the example
if (process.argv.includes('--compare')) {
  compareVADProviders().then(() => main());
} else {
  main();
}