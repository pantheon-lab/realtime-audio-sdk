import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { AudioProcessor } from '../src/processing/AudioProcessor';
import { AudioLoader, type AudioData } from './utils/audio-loader';
import type {
  AudioProcessorResult,
  VADSegmentEvent,
  EnergyVADConfig,
  SileroVADConfig
} from '../src/types';

/**
 * VAD Accuracy Test Suite
 *
 * This test suite focuses on measuring the accuracy of VAD algorithms
 * using real audio files with known speech/silence patterns.
 */
describe('VAD Accuracy Tests with Real Audio', () => {
  let audioData: AudioData;
  let audioFrames: Float32Array[];

  // Ground truth annotations (these should be manually verified)
  // Format: [startMs, endMs] for speech segments
  const groundTruthSpeechSegments = [
    // These are example segments - should be replaced with actual annotations
    // You can use audio editing software to identify exact speech boundaries
    [500, 2000],     // First speech segment
    [2500, 4500],    // Second speech segment
    [5000, 7000],    // Third speech segment
    [7500, 9000],    // Fourth speech segment
  ];

  beforeAll(async () => {
    // Load test audio file
    const audioPath = path.join(__dirname, 'vad_test_en.wav');
    audioData = await AudioLoader.loadWavFile(audioPath);
    audioFrames = AudioLoader.splitIntoFrames(audioData, 20);

    console.log('\n=== VAD Accuracy Test Setup ===');
    console.log(`Audio file: vad_test_en.wav`);
    console.log(`Duration: ${audioData.duration.toFixed(2)}s`);
    console.log(`Sample rate: ${audioData.sampleRate}Hz`);
    console.log(`Total frames: ${audioFrames.length} (20ms each)`);
    console.log(`Ground truth segments: ${groundTruthSpeechSegments.length}`);
  });

  /**
   * Helper function to convert frame-based detection to time segments
   */
  function framesToSegments(results: AudioProcessorResult[]): Array<[number, number]> {
    const segments: Array<[number, number]> = [];
    let segmentStart: number | null = null;

    results.forEach((result, index) => {
      const timestamp = index * 20; // 20ms per frame

      if (result.vad?.isSpeech && segmentStart === null) {
        // Speech started
        segmentStart = timestamp;
      } else if (!result.vad?.isSpeech && segmentStart !== null) {
        // Speech ended
        segments.push([segmentStart, timestamp]);
        segmentStart = null;
      }
    });

    // Handle case where speech continues to the end
    if (segmentStart !== null) {
      segments.push([segmentStart, results.length * 20]);
    }

    return segments;
  }

  /**
   * Calculate Intersection over Union (IoU) for two time segments
   */
  function calculateIoU(seg1: [number, number], seg2: [number, number]): number {
    const intersectionStart = Math.max(seg1[0], seg2[0]);
    const intersectionEnd = Math.min(seg1[1], seg2[1]);
    const intersection = Math.max(0, intersectionEnd - intersectionStart);

    const union = (seg1[1] - seg1[0]) + (seg2[1] - seg2[0]) - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Calculate precision, recall, and F1 score
   */
  function calculateMetrics(
    detectedSegments: Array<[number, number]>,
    groundTruth: Array<[number, number]>,
    iouThreshold: number = 0.5
  ): { precision: number; recall: number; f1: number; accuracy: number } {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    // Check each detected segment
    const matchedGroundTruth = new Set<number>();

    detectedSegments.forEach(detected => {
      let matched = false;
      groundTruth.forEach((truth, index) => {
        const iou = calculateIoU(detected, truth);
        if (iou > iouThreshold && !matchedGroundTruth.has(index)) {
          matched = true;
          matchedGroundTruth.add(index);
          truePositives++;
        }
      });
      if (!matched) {
        falsePositives++;
      }
    });

    // Count unmatched ground truth segments as false negatives
    falseNegatives = groundTruth.length - matchedGroundTruth.size;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;

    // Calculate frame-level accuracy
    const totalFrames = Math.ceil(audioData.duration * 1000 / 20);
    const correctFrames = truePositives * 50; // Approximate frames per segment
    const accuracy = correctFrames / totalFrames;

    return { precision, recall, f1, accuracy };
  }

  describe('Energy VAD Accuracy', () => {
    it('should achieve reasonable accuracy with optimized parameters', async () => {
      console.log('\n--- Testing Energy VAD ---');

      // Test different threshold values
      const thresholds = [0.005, 0.01, 0.02, 0.05];
      const results: Array<{ threshold: number; segments: number; precision: number; recall: number; f1: number; accuracy: number }> = [];

      for (const threshold of thresholds) {
        const processor = new AudioProcessor({
          vad: {
            enabled: true,
            provider: 'energy',
            threshold,
            minSpeechDuration: 200,
            minSilenceDuration: 300
          } as EnergyVADConfig
        });

        const frameResults: AudioProcessorResult[] = [];

        // Process all frames
        for (let i = 0; i < audioFrames.length; i++) {
          const timestamp = i * 20;
          const result = await processor.process(audioFrames[i], timestamp);
          frameResults.push(result);
        }

        // Convert to segments
        const detectedSegments = framesToSegments(frameResults);

        // Calculate metrics
        const metrics = calculateMetrics(detectedSegments, groundTruthSpeechSegments);

        results.push({
          threshold,
          segments: detectedSegments.length,
          ...metrics
        });

        console.log(`Threshold ${threshold}:`, {
          segments: detectedSegments.length,
          precision: `${(metrics.precision * 100).toFixed(1)}%`,
          recall: `${(metrics.recall * 100).toFixed(1)}%`,
          f1: `${(metrics.f1 * 100).toFixed(1)}%`
        });

        await processor.close();
      }

      // Find best threshold
      const bestResult = results.reduce((best, current) =>
        current.f1 > best.f1 ? current : best
      );

      console.log('\nBest Energy VAD configuration:', {
        threshold: bestResult.threshold,
        f1Score: `${(bestResult.f1 * 100).toFixed(1)}%`
      });

      // Should achieve at least 50% F1 score
      expect(bestResult.f1).toBeGreaterThan(0.5);
    });
  });

  describe('Silero VAD Accuracy', () => {
    it('should achieve high accuracy with default parameters', async () => {
      console.log('\n--- Testing Silero VAD ---');

      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'silero',
          positiveSpeechThreshold: 0.3,
          negativeSpeechThreshold: 0.25,
          silenceDuration: 1400,
          preSpeechPadDuration: 800,
          minSpeechDuration: 400,
          modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
        } as SileroVADConfig
      });

      await processor.initialize();

      const frameResults: ProcessedAudioData[] = [];
      const speechSegments: VADSpeechSegment[] = [];
      const probabilities: number[] = [];

      // Collect speech segments
      processor.on('vad-speech-segment', (segment) => {
        speechSegments.push(segment);
      });

      // Process all frames
      for (let i = 0; i < audioFrames.length; i++) {
        const timestamp = i * 20;
        const result = await processor.process(audioFrames[i], timestamp);
        frameResults.push(result);

        if (result.speechProbability !== undefined) {
          probabilities.push(result.speechProbability);
        }
      }

      // Convert to segments
      const detectedSegments = framesToSegments(frameResults);

      // Calculate metrics
      const metrics = calculateMetrics(detectedSegments, groundTruthSpeechSegments);

      // Calculate probability statistics
      const avgProbability = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
      const maxProbability = Math.max(...probabilities);
      const minProbability = Math.min(...probabilities);

      console.log('Silero VAD Results:', {
        detectedSegments: detectedSegments.length,
        precision: `${(metrics.precision * 100).toFixed(1)}%`,
        recall: `${(metrics.recall * 100).toFixed(1)}%`,
        f1Score: `${(metrics.f1 * 100).toFixed(1)}%`,
        avgProbability: avgProbability.toFixed(3),
        probabilityRange: `${minProbability.toFixed(3)} - ${maxProbability.toFixed(3)}`
      });

      // Silero should achieve higher accuracy
      expect(metrics.f1).toBeGreaterThan(0.7);
      expect(metrics.precision).toBeGreaterThan(0.6);
      expect(metrics.recall).toBeGreaterThan(0.6);

      await processor.close();
    });

    it('should test different threshold configurations', async () => {
      console.log('\n--- Testing Silero VAD Threshold Sensitivity ---');

      const configurations = [
        { positive: 0.1, negative: 0.05, name: 'Very Sensitive' },
        { positive: 0.3, negative: 0.25, name: 'Default' },
        { positive: 0.5, negative: 0.45, name: 'Balanced' },
        { positive: 0.7, negative: 0.65, name: 'Very Strict' }
      ];

      const results: any[] = [];

      for (const config of configurations) {
        const processor = new AudioProcessor({
          vad: {
            enabled: true,
            provider: 'silero',
            positiveSpeechThreshold: config.positive,
            negativeSpeechThreshold: config.negative,
            silenceDuration: 1400,
            minSpeechDuration: 400,
            modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
          } as SileroVADConfig
        });

        await processor.initialize();

        const frameResults: ProcessedAudioData[] = [];
        let speechFrames = 0;

        for (let i = 0; i < audioFrames.length; i++) {
          const timestamp = i * 20;
          const result = await processor.process(audioFrames[i], timestamp);
          frameResults.push(result);

          if (result.isSpeech) {
            speechFrames++;
          }
        }

        const detectedSegments = framesToSegments(frameResults);
        const metrics = calculateMetrics(detectedSegments, groundTruthSpeechSegments);
        const speechRatio = speechFrames / audioFrames.length;

        results.push({
          name: config.name,
          positive: config.positive,
          negative: config.negative,
          speechRatio,
          segments: detectedSegments.length,
          ...metrics
        });

        console.log(`${config.name} (${config.positive}/${config.negative}):`, {
          speechRatio: `${(speechRatio * 100).toFixed(1)}%`,
          segments: detectedSegments.length,
          f1: `${(metrics.f1 * 100).toFixed(1)}%`
        });

        await processor.close();
      }

      // Find optimal configuration
      const optimal = results.reduce((best, current) =>
        current.f1 > best.f1 ? current : best
      );

      console.log('\nOptimal Silero configuration:', {
        name: optimal.name,
        thresholds: `${optimal.positive}/${optimal.negative}`,
        f1Score: `${(optimal.f1 * 100).toFixed(1)}%`
      });
    });
  });

  describe('Detailed Frame-by-Frame Analysis', () => {
    it('should analyze frame-level predictions', async () => {
      console.log('\n--- Frame-by-Frame Analysis ---');

      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'silero',
          positiveSpeechThreshold: 0.3,
          negativeSpeechThreshold: 0.25,
          returnProbabilities: true,
          modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
        } as SileroVADConfig
      });

      await processor.initialize();

      // Analyze first 100 frames in detail
      const analysisFrames = Math.min(100, audioFrames.length);
      const analysis: any[] = [];

      for (let i = 0; i < analysisFrames; i++) {
        const timestamp = i * 20;
        const frame = audioFrames[i];

        // Calculate frame statistics
        const stats = AudioLoader.calculateStats(frame);

        // Process frame
        const result = await processor.process(frame, timestamp);

        analysis.push({
          frame: i,
          timestamp,
          energy: stats.energy,
          maxAmplitude: stats.maxAmplitude,
          isSpeech: result.isSpeech,
          probability: result.speechProbability || 0
        });
      }

      // Find transition points
      const transitions: any[] = [];
      for (let i = 1; i < analysis.length; i++) {
        if (analysis[i].isSpeech !== analysis[i - 1].isSpeech) {
          transitions.push({
            frame: i,
            timestamp: analysis[i].timestamp,
            type: analysis[i].isSpeech ? 'speech_start' : 'speech_end',
            probability: analysis[i].probability
          });
        }
      }

      console.log('Transitions detected:', transitions.length);
      transitions.slice(0, 5).forEach(t => {
        console.log(`  Frame ${t.frame} (${t.timestamp}ms): ${t.type} (prob: ${t.probability.toFixed(3)})`);
      });

      // Analyze probability distribution
      const probs = analysis.map(a => a.probability);
      const speechProbs = analysis.filter(a => a.isSpeech).map(a => a.probability);
      const silenceProbs = analysis.filter(a => !a.isSpeech).map(a => a.probability);

      console.log('\nProbability Distribution:');
      console.log(`  All frames: avg=${average(probs).toFixed(3)}, std=${standardDeviation(probs).toFixed(3)}`);
      if (speechProbs.length > 0) {
        console.log(`  Speech frames: avg=${average(speechProbs).toFixed(3)}, std=${standardDeviation(speechProbs).toFixed(3)}`);
      }
      if (silenceProbs.length > 0) {
        console.log(`  Silence frames: avg=${average(silenceProbs).toFixed(3)}, std=${standardDeviation(silenceProbs).toFixed(3)}`);
      }

      // Verify probability separation
      if (speechProbs.length > 0 && silenceProbs.length > 0) {
        const speechAvg = average(speechProbs);
        const silenceAvg = average(silenceProbs);

        // Speech should have higher average probability
        expect(speechAvg).toBeGreaterThan(silenceAvg);

        // There should be clear separation
        expect(speechAvg - silenceAvg).toBeGreaterThan(0.2);
      }

      await processor.close();
    });
  });

  describe('Robustness Tests', () => {
    it('should handle different audio characteristics', async () => {
      console.log('\n--- Testing Robustness ---');

      const processor = new AudioProcessor({
        vad: {
          enabled: true,
          provider: 'silero',
          modelPath: path.join(__dirname, '../public/models/silero_vad_v5.onnx')
        } as SileroVADConfig
      });

      await processor.initialize();

      // Test with different frame modifications
      const tests = [
        { name: 'Normal', modifier: (f: Float32Array) => f },
        { name: 'Quiet', modifier: (f: Float32Array) => f.map(s => s * 0.1) },
        { name: 'Loud', modifier: (f: Float32Array) => f.map(s => Math.min(1, s * 3)) },
        { name: 'Noisy', modifier: (f: Float32Array) => f.map(s => s + (Math.random() - 0.5) * 0.05) }
      ];

      for (const test of tests) {
        let speechFrames = 0;
        const probs: number[] = [];

        // Process subset of frames with modification
        for (let i = 0; i < Math.min(50, audioFrames.length); i++) {
          const modifiedFrame = test.modifier(new Float32Array(audioFrames[i]));
          const result = await processor.process(modifiedFrame, i * 20);

          if (result.isSpeech) speechFrames++;
          if (result.speechProbability !== undefined) {
            probs.push(result.speechProbability);
          }
        }

        console.log(`${test.name}:`, {
          speechRatio: `${(speechFrames / 50 * 100).toFixed(1)}%`,
          avgProbability: average(probs).toFixed(3)
        });
      }

      await processor.close();
    });
  });

  // Helper functions
  function average(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function standardDeviation(arr: number[]): number {
    const avg = average(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(average(squareDiffs));
  }
});