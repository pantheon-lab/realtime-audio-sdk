import { RealtimeAudioSDK } from '../dist/realtime-audio-sdk.js';

/**
 * Example: Using the new unified event structure
 */

async function main() {
  console.log('🎤 Realtime Audio SDK - New Event Structure Example\n');

  // Create SDK instance
  const sdk = new RealtimeAudioSDK({
    sampleRate: 16000,
    channelCount: 1,
    frameSize: 20,
    processing: {
      vad: {
        enabled: true,
        provider: 'silero',  // or 'energy'
        positiveSpeechThreshold: 0.3,
        negativeSpeechThreshold: 0.25,
        silenceDuration: 1400,
        preSpeechPadDuration: 800,
        minSpeechDuration: 400,
        modelPath: '/models/silero_vad_v5.onnx'
      }
    },
    encoding: {
      enabled: true,
      codec: 'opus',
      bitrate: 16000
    }
  });

  // ====================
  // Main Audio Event (New!)
  // ====================

  // Single unified event for all audio data
  sdk.on('audio', (event) => {
    const { audio, metadata, processing } = event;

    // Access audio data
    const audioToSend = audio.encoded || audio.raw;
    console.log(`Audio frame ${metadata.frameIndex}:`, {
      timestamp: `${metadata.timestamp}ms`,
      format: audio.format || 'raw',
      dataSize: audioToSend.byteLength || audioToSend.length,
      energy: processing.energy.toFixed(3)
    });

    // Check VAD results
    if (processing.vad?.active) {
      const vad = processing.vad;
      console.log(`  VAD: ${vad.isSpeech ? '🔊 SPEECH' : '🔇 SILENCE'}`, {
        probability: `${(vad.probability * 100).toFixed(1)}%`,
        confidence: vad.confidence
      });

      // Take action based on confidence
      if (vad.isSpeech && vad.confidence === 'high') {
        // High confidence speech - send immediately
        // websocket.send(audioToSend);
      } else if (vad.isSpeech && vad.confidence === 'medium') {
        // Medium confidence - maybe buffer
      }
    }
  });

  // ====================
  // VAD State Events (New!)
  // ====================

  // Speech state changes only
  sdk.on('speech-state', (event) => {
    if (event.type === 'start') {
      console.log('\n✅ Speech Started:', {
        timestamp: `${event.timestamp}ms`,
        probability: `${(event.probability * 100).toFixed(1)}%`
      });
    } else {
      console.log('\n🔴 Speech Ended:', {
        timestamp: `${event.timestamp}ms`,
        duration: `${event.duration}ms`,
        probability: `${(event.probability * 100).toFixed(1)}%`
      });
    }
  });

  // Complete speech segments
  sdk.on('speech-segment', (segment) => {
    console.log('\n📊 Complete Speech Segment:', {
      start: `${segment.startTime}ms`,
      end: `${segment.endTime}ms`,
      duration: `${segment.duration}ms`,
      avgProbability: `${(segment.avgProbability * 100).toFixed(1)}%`,
      confidence: `${(segment.confidence * 100).toFixed(0)}%`,
      audioSize: segment.audio.length
    });

    // Process complete segment
    // sendToTranscription(segment.audio);
  });

  // ====================
  // Device Events (New!)
  // ====================

  sdk.on('device', (event) => {
    switch (event.type) {
      case 'changed':
        console.log('🎤 Device changed:', event.device?.label);
        break;
      case 'list-updated':
        console.log('📋 Device list updated:', event.devices?.length, 'devices');
        break;
      case 'unplugged':
        console.log('🔌 Device unplugged:', event.deviceId);
        break;
    }
  });

  // ====================
  // System Events (New!)
  // ====================

  sdk.on('state', (state) => {
    console.log(`📱 State: ${state}`);
  });

  sdk.on('error', (error) => {
    console.error('❌ Error:', {
      message: error.message,
      code: error.code,
      context: error.context
    });
  });

  // ====================
  // Start Recording
  // ====================

  try {
    await sdk.start();
    console.log('\n✅ Recording started. Press Ctrl+C to stop.\n');
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }

  // ====================
  // Graceful Shutdown
  // ====================

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping...');
    try {
      await sdk.stop();
      await sdk.destroy();
      console.log('✅ Stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
}

// ====================
// Comparison: Old vs New Events
// ====================

function showComparison() {
  console.log('\n📚 Event Structure Comparison:\n');

  console.log('OLD Events (Multiple):\n');
  console.log('  - audio-data        (encoded audio)');
  console.log('  - raw-audio         (raw audio)');
  console.log('  - processed-audio   (processed data)');
  console.log('  - vad-probability   (probability only)');
  console.log('  - vad-speech-start  (start event)');
  console.log('  - vad-speech-end    (end event)');
  console.log('  - device-changed    (device change)');
  console.log('  - devices-updated   (device list)');
  console.log('  - state-changed     (state change)\n');

  console.log('NEW Events (Unified):\n');
  console.log('  - audio            (ALL audio data in one event)');
  console.log('  - speech-state     (start/end only)');
  console.log('  - speech-segment   (complete segments)');
  console.log('  - device           (all device events)');
  console.log('  - state            (state changes)');
  console.log('  - error            (errors with context)\n');

  console.log('Benefits:\n');
  console.log('  ✅ Single audio event with all data');
  console.log('  ✅ Structured data (audio/metadata/processing)');
  console.log('  ✅ Less event listeners needed');
  console.log('  ✅ Better performance');
  console.log('  ✅ Cleaner code\n');
}

// Run comparison then start
showComparison();
setTimeout(main, 2000);