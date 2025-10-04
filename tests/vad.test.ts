import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';
import { AudioProcessor } from '../src/processing/AudioProcessor';
import { AudioLoader, type AudioData } from './utils/audio-loader';
import type {
  AudioProcessorResult,
  VADStateEvent,
  VADSegmentEvent,
  EnergyVADConfig,
  SileroVADConfig
} from '../src/types';

describe('VAD (Voice Activity Detection) Tests', () => {
  let audioData: AudioData;
  let audioFrames: Float32Array[];

  beforeAll(async () => {
    // Load test audio file
    const audioPath = path.join(__dirname, 'vad_test_en.wav');
    audioData = await AudioLoader.loadWavFile(audioPath);

    // Split into 20ms frames (standard frame size)
    audioFrames = AudioLoader.splitIntoFrames(audioData, 20);

    console.log('Test audio loaded:', {
      duration: `${audioData.duration.toFixed(2)}s`,
      sampleRate: `${audioData.sampleRate}Hz`,
      frames: audioFrames.length,
      channels: audioData.channels
    });
  });

  describe('Energy-based VAD', () => {
    let processor: AudioProcessor;
    let detectedSpeechFrames: number;
    let totalFrames: number;

    beforeEach(() => {
      detectedSpeechFrames = 0;
      totalFrames = 0;
    });

    it('should detect speech with default settings', async () => {
      const config: EnergyVADConfig = {
        enabled: true,
        provider: 'energy',
        threshold: 0.01,  // Lower threshold for test audio
        minSpeechDuration: 100,
        minSilenceDuration: 300
      };

      processor = new AudioProcessor({
        vad: config
      });

      const results: AudioProcessorResult[] = [];

      // Process all frames
      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20); // 20ms per frame
        const result = await processor.process(audioFrames[i], timestamp);
        results.push(result);

        if (result.vad?.isSpeech) {
          detectedSpeechFrames++;
        }
        totalFrames++;
      }

      // Verify detection results
      expect(totalFrames).toBeGreaterThan(0);
      expect(detectedSpeechFrames).toBeGreaterThan(0);

      const speechRatio = detectedSpeechFrames / totalFrames;
      console.log(`Energy VAD: Detected speech in ${(speechRatio * 100).toFixed(1)}% of frames`);

      // Should detect some speech but not all frames
      expect(speechRatio).toBeGreaterThan(0.1);
      expect(speechRatio).toBeLessThan(0.9);
    });

    it('should respect minimum speech duration', async () => {
      const config: EnergyVADConfig = {
        enabled: true,
        provider: 'energy',
        threshold: 0.01,
        minSpeechDuration: 500,  // 500ms minimum
        minSilenceDuration: 300
      };

      processor = new AudioProcessor({
        vad: config
      });

      let speechStarted = false;
      let speechStartTime = 0;
      let shortSpeechSegments = 0;

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        const result = await processor.process(audioFrames[i], timestamp);

        if (!speechStarted && result.vad?.isSpeech) {
          speechStarted = true;
          speechStartTime = timestamp;
        } else if (speechStarted && !result.vad?.isSpeech) {
          const duration = timestamp - speechStartTime;
          if (duration < 500) {
            shortSpeechSegments++;
          }
          speechStarted = false;
        }
      }

      // With high min duration, should filter out short segments
      expect(shortSpeechSegments).toBe(0);
    });

    it('should calculate energy correctly', async () => {
      processor = new AudioProcessor({
        vad: {
          enabled: false  // Disable VAD to test energy calculation
        }
      });

      const energyValues: number[] = [];

      for (let i = 0; i < Math.min(100, audioFrames.length); i++) {
        const timestamp = (i * 20);
        const result = await processor.process(audioFrames[i], timestamp);

        if (result.energy !== undefined) {
          energyValues.push(result.energy);
        }
      }

      expect(energyValues.length).toBeGreaterThan(0);

      // Energy should vary (not all the same)
      const uniqueEnergies = new Set(energyValues);
      expect(uniqueEnergies.size).toBeGreaterThan(1);

      // Energy should be in reasonable range
      const maxEnergy = Math.max(...energyValues);
      const minEnergy = Math.min(...energyValues);
      expect(maxEnergy).toBeLessThanOrEqual(1.0);
      expect(minEnergy).toBeGreaterThanOrEqual(0);
    });

    afterAll(() => {
      processor.close();
    });
  });

  describe('Silero VAD', () => {
    let processor: AudioProcessor;
    let speechSegments: VADSegmentEvent[] = [];
    let speechStateEvents: VADStateEvent[] = [];

    beforeEach(() => {
      speechSegments = [];
      speechStateEvents = [];
    });

    it('should initialize and process audio with Silero VAD', async () => {
      const config: SileroVADConfig = {
        enabled: true,
        provider: 'silero',
        positiveSpeechThreshold: 0.3,
        negativeSpeechThreshold: 0.25,
        silenceDuration: 1400,
        preSpeechPadDuration: 800,
        minSpeechDuration: 400,
        returnProbabilities: true,
        modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
      };

      processor = new AudioProcessor({
        vad: config
      });

      // Setup event listeners
      processor.on('speech-state', (event: VADStateEvent) => {
        speechStateEvents.push(event);
      });

      processor.on('speech-segment', (segment: VADSegmentEvent) => {
        speechSegments.push(segment);
      });

      // Initialize Silero VAD
      await processor.initialize();

      let detectedSpeechFrames = 0;
      const results: AudioProcessorResult[] = [];

      // Process all frames
      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        const result = await processor.process(audioFrames[i], timestamp);
        results.push(result);

        if (result.vad?.isSpeech) {
          detectedSpeechFrames++;
        }

        // Check speech probability is included
        if (result.vad?.probability !== undefined) {
          expect(result.vad.probability).toBeGreaterThanOrEqual(0);
          expect(result.vad.probability).toBeLessThanOrEqual(1);
        }
      }

      // Verify Silero VAD detected speech
      expect(detectedSpeechFrames).toBeGreaterThan(0);

      // Count start and end events
      const startEvents = speechStateEvents.filter(e => e.type === 'start');
      const endEvents = speechStateEvents.filter(e => e.type === 'end');

      // Verify events were fired
      console.log('Silero VAD Results:', {
        speechFrames: detectedSpeechFrames,
        totalFrames: audioFrames.length,
        speechRatio: `${(detectedSpeechFrames / audioFrames.length * 100).toFixed(1)}%`,
        speechSegments: speechSegments.length,
        startEvents: startEvents.length,
        endEvents: endEvents.length
      });

      // Should have detected speech segments
      expect(startEvents.length).toBeGreaterThan(0);
      expect(endEvents.length).toBeGreaterThan(0);
      expect(speechSegments.length).toBeGreaterThan(0);

      // Verify segment structure
      speechSegments.forEach(segment => {
        expect(segment.duration).toBeGreaterThan(0);
        expect(segment.endTime).toBeGreaterThan(segment.startTime);
        if (segment.audio) {
          expect(segment.audio.length).toBeGreaterThan(0);
        }
      });
    });

    it('should return consistent probabilities', async () => {
      const config: SileroVADConfig = {
        enabled: true,
        provider: 'silero',
        positiveSpeechThreshold: 0.3,
        negativeSpeechThreshold: 0.25,
        returnProbabilities: true,
        modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
      };

      processor = new AudioProcessor({
        vad: config
      });

      await processor.initialize();

      const speechProbabilities: number[] = [];

      // Process subset of frames
      for (let i = 0; i < Math.min(100, audioFrames.length); i++) {
        const timestamp = (i * 20);
        const result = await processor.process(audioFrames[i], timestamp);

        if (result.vad?.probability !== undefined) {
          speechProbabilities.push(result.vad.probability);
        }
      }

      // All frames should have probability
      expect(speechProbabilities.length).toBe(Math.min(100, audioFrames.length));

      // Probabilities should be in valid range
      speechProbabilities.forEach(prob => {
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      });

      // Should have variation in probabilities
      const uniqueProbs = new Set(speechProbabilities.map(p => Math.round(p * 100)));
      expect(uniqueProbs.size).toBeGreaterThan(1);
    });

    it('should respect configuration thresholds', async () => {
      // Test with high thresholds (less sensitive)
      const strictConfig: SileroVADConfig = {
        enabled: true,
        provider: 'silero',
        positiveSpeechThreshold: 0.7,  // Very high threshold
        negativeSpeechThreshold: 0.6,
        silenceDuration: 500,
        minSpeechDuration: 200,
        modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
      };

      processor = new AudioProcessor({
        vad: strictConfig
      });

      await processor.initialize();

      let strictSpeechFrames = 0;

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        const result = await processor.process(audioFrames[i], timestamp);

        if (result.vad?.isSpeech) {
          strictSpeechFrames++;
        }
      }

      // Now test with low thresholds (more sensitive)
      const sensitiveConfig: SileroVADConfig = {
        enabled: true,
        provider: 'silero',
        positiveSpeechThreshold: 0.1,  // Very low threshold
        negativeSpeechThreshold: 0.05,
        silenceDuration: 2000,
        minSpeechDuration: 100,
        modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
      };

      const sensitiveProcessor = new AudioProcessor({
        vad: sensitiveConfig
      });

      await sensitiveProcessor.initialize();

      let sensitiveSpeechFrames = 0;

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        const result = await sensitiveProcessor.process(audioFrames[i], timestamp);

        if (result.vad?.isSpeech) {
          sensitiveSpeechFrames++;
        }
      }

      // Sensitive detection should detect more speech
      expect(sensitiveSpeechFrames).toBeGreaterThan(strictSpeechFrames);

      console.log('Threshold comparison:', {
        strict: `${(strictSpeechFrames / audioFrames.length * 100).toFixed(1)}%`,
        sensitive: `${(sensitiveSpeechFrames / audioFrames.length * 100).toFixed(1)}%`
      });

      await sensitiveProcessor.close();
    });

    afterAll(async () => {
      if (processor) {
        await processor.close();
      }
    });
  });

  describe('VAD Comparison (Energy vs Silero)', () => {
    it('should compare accuracy between Energy and Silero VAD', async () => {
      // Test Energy VAD
      const energyProcessor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'energy',
          threshold: 0.01,
          minSpeechDuration: 100,
          minSilenceDuration: 300
        } as EnergyVADConfig
      });

      let energySpeechFrames = 0;
      const energyResults: boolean[] = [];

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        const result = await energyProcessor.process(audioFrames[i], timestamp);

        if (result.vad?.isSpeech) {
          energySpeechFrames++;
          energyResults.push(true);
        } else {
          energyResults.push(false);
        }
      }

      // Test Silero VAD
      const sileroProcessor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'silero',
          positiveSpeechThreshold: 0.3,
          negativeSpeechThreshold: 0.25,
          modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
        } as SileroVADConfig
      });

      await sileroProcessor.initialize();

      let sileroSpeechFrames = 0;
      const sileroResults: boolean[] = [];
      const sileroProbabilities: number[] = [];

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        const result = await sileroProcessor.process(audioFrames[i], timestamp);

        if (result.vad?.isSpeech) {
          sileroSpeechFrames++;
          sileroResults.push(true);
        } else {
          sileroResults.push(false);
        }

        if (result.vad?.probability !== undefined) {
          sileroProbabilities.push(result.vad.probability);
        }
      }

      // Calculate agreement between the two methods
      let agreement = 0;
      for (let i = 0; i < energyResults.length; i++) {
        if (energyResults[i] === sileroResults[i]) {
          agreement++;
        }
      }

      const agreementRate = agreement / energyResults.length;

      console.log('VAD Comparison Results:', {
        energyVAD: {
          speechFrames: energySpeechFrames,
          speechRatio: `${(energySpeechFrames / audioFrames.length * 100).toFixed(1)}%`
        },
        sileroVAD: {
          speechFrames: sileroSpeechFrames,
          speechRatio: `${(sileroSpeechFrames / audioFrames.length * 100).toFixed(1)}%`,
          avgProbability: (sileroProbabilities.reduce((a, b) => a + b, 0) / sileroProbabilities.length).toFixed(3)
        },
        agreement: `${(agreementRate * 100).toFixed(1)}%`
      });

      // They should have some agreement but not be identical
      expect(agreementRate).toBeGreaterThan(0.3);
      expect(agreementRate).toBeLessThan(1.0);

      // Cleanup
      await energyProcessor.close();
      await sileroProcessor.close();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should measure processing speed for Energy VAD', async () => {
      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'energy',
          threshold: 0.01
        } as EnergyVADConfig
      });

      const startTime = performance.now();

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        await processor.process(audioFrames[i], timestamp);
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;
      const realTimeRatio = (audioData.duration * 1000) / processingTime;

      console.log('Energy VAD Performance:', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        audioLength: `${(audioData.duration * 1000).toFixed(2)}ms`,
        realTimeRatio: `${realTimeRatio.toFixed(2)}x`,
        framesPerSecond: Math.round((audioFrames.length / processingTime) * 1000)
      });

      // Should be faster than real-time
      expect(realTimeRatio).toBeGreaterThan(1);

      await processor.close();
    });

    it('should measure processing speed for Silero VAD', async () => {
      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'silero',
          modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
        } as SileroVADConfig
      });

      await processor.initialize();

      const startTime = performance.now();

      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = (i * 20);
        await processor.process(audioFrames[i], timestamp);
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;
      const realTimeRatio = (audioData.duration * 1000) / processingTime;

      console.log('Silero VAD Performance:', {
        processingTime: `${processingTime.toFixed(2)}ms`,
        audioLength: `${(audioData.duration * 1000).toFixed(2)}ms`,
        realTimeRatio: `${realTimeRatio.toFixed(2)}x`,
        framesPerSecond: Math.round((audioFrames.length / processingTime) * 1000)
      });

      // Should be reasonable speed (might be slower than energy VAD)
      expect(processingTime).toBeLessThan(audioData.duration * 1000 * 10); // Not more than 10x slower than real-time

      await processor.close();
    });

    it('should measure memory usage', () => {
      if (global.gc) {
        global.gc(); // Force garbage collection if available
      }

      const initialMemory = process.memoryUsage();

      // Create processor with Silero VAD
      new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'silero',
          modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
        } as SileroVADConfig
      });

      const afterCreation = process.memoryUsage();

      const memoryIncrease = {
        heapUsed: (afterCreation.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
        external: (afterCreation.external - initialMemory.external) / 1024 / 1024
      };

      console.log('Memory Usage:', {
        heapIncrease: `${memoryIncrease.heapUsed.toFixed(2)} MB`,
        externalIncrease: `${memoryIncrease.external.toFixed(2)} MB`
      });

      // Memory increase should be reasonable
      expect(memoryIncrease.heapUsed).toBeLessThan(100); // Less than 100MB
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty audio frames', async () => {
      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'energy'
        } as EnergyVADConfig
      });

      const emptyFrame = new Float32Array(320); // 20ms at 16kHz, all zeros
      const result = await processor.process(emptyFrame, 0);

      expect(result).toBeDefined();
      expect(result.vad?.isSpeech).toBe(false);
      expect(result.energy).toBe(0);

      await processor.close();
    });

    it('should handle very loud audio', async () => {
      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'energy',
          threshold: 0.5
        } as EnergyVADConfig
      });

      const loudFrame = new Float32Array(320);
      loudFrame.fill(0.9); // Near max amplitude
      const result = await processor.process(loudFrame, 0);

      expect(result).toBeDefined();
      expect(result.energy).toBeGreaterThan(0);

      await processor.close();
    });

    it('should reset VAD state correctly', async () => {
      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'energy'
        } as EnergyVADConfig
      });

      // Process some frames
      for (let i = 0; i < 10; i++) {
        await processor.process(audioFrames[i], i * 20);
      }

      // Reset VAD
      processor.resetVAD();

      // Process again - should start fresh
      const result = await processor.process(audioFrames[0], 0);
      expect(result).toBeDefined();

      await processor.close();
    });
  });
});