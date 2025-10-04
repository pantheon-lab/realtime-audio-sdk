/**
 * AudioWorklet Processor for capturing audio in precise time chunks
 * This code runs in the AudioWorklet thread (separate from main thread)
 *
 * NOTE: This file contains AudioWorklet global types that are not available in the main TypeScript context.
 * These types are only available when running in the AudioWorklet scope.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

interface ProcessorConfig {
  frameSize: 20 | 40 | 60;
  sampleRate: number;
}

// Declare AudioWorklet global types (only available in worklet scope)
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor
): void;

declare const currentTime: number;

class AudioCaptureProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array[] = [];
  private framesPerChunk: number = 0;
  private config: ProcessorConfig = { frameSize: 20, sampleRate: 16000 };

  constructor() {
    super();

    // Listen for configuration messages
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'config') {
        this.config = event.data.config;
        this.calculateFramesPerChunk();
      }
    };
  }

  /**
   * Calculate how many frames needed for the desired chunk size
   * frameSize in ms, sampleRate in Hz
   * Example: 20ms @ 16kHz = 320 frames
   */
  private calculateFramesPerChunk(): void {
    this.framesPerChunk = (this.config.frameSize * this.config.sampleRate) / 1000;
  }

  /**
   * Process audio - called for each 128-frame block
   */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];

    // No input available
    if (!input || input.length === 0) {
      return true;
    }

    // Get the first channel (we're handling mono or will mix down)
    const channelData = input[0];
    if (!channelData) {
      return true;
    }

    // Add current block to buffer
    this.buffer.push(new Float32Array(channelData));

    // Calculate total frames in buffer
    const totalFrames = this.buffer.reduce((sum, arr) => sum + arr.length, 0);

    // If we have enough frames, send the chunk
    if (totalFrames >= this.framesPerChunk) {
      const chunk = this.extractChunk();
      this.port.postMessage({
        type: 'audio-data',
        data: chunk,
        timestamp: currentTime,
      });
    }

    return true;
  }

  /**
   * Extract exact number of frames from buffer
   */
  private extractChunk(): Float32Array {
    const chunk = new Float32Array(this.framesPerChunk);
    let offset = 0;

    while (offset < this.framesPerChunk && this.buffer.length > 0) {
      const block = this.buffer[0];
      const remainingInChunk = this.framesPerChunk - offset;
      const availableInBlock = block.length;

      if (availableInBlock <= remainingInChunk) {
        // Use entire block
        chunk.set(block, offset);
        offset += availableInBlock;
        this.buffer.shift(); // Remove used block
      } else {
        // Use partial block
        chunk.set(block.subarray(0, remainingInChunk), offset);
        // Keep remaining part of block
        this.buffer[0] = block.subarray(remainingInChunk);
        offset += remainingInChunk;
      }
    }

    return chunk;
  }
}

// Register the processor
registerProcessor('audio-capture-processor', AudioCaptureProcessor);
