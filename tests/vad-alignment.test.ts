import { describe, it, expect } from 'vitest';

describe('SileroVAD Frame Alignment', () => {
  // Test the buffering logic with mock data
  // Since we can't easily test the actual VAD without the model,
  // we'll test the buffer calculations

  it('should correctly calculate frames for 20ms chunks at 16kHz', () => {
    const sampleRate = 16000;
    const frameSize = 20; // ms
    const samplesPerFrame = (frameSize * sampleRate) / 1000;
    expect(samplesPerFrame).toBe(320);

    // VAD requires 512 samples
    const vadFrameSize = 512;

    // First chunk: 320 samples - not enough for a frame
    let buffer = 320;
    const completeFrames1 = Math.floor(buffer / vadFrameSize);
    expect(completeFrames1).toBe(0);
    const remaining1 = buffer % vadFrameSize;
    expect(remaining1).toBe(320);

    // Second chunk: 320 + 320 = 640 samples - one frame
    buffer = 640;
    const completeFrames2 = Math.floor(buffer / vadFrameSize);
    expect(completeFrames2).toBe(1);
    const remaining2 = buffer % vadFrameSize;
    expect(remaining2).toBe(128);
  });

  it('should correctly calculate frames for 40ms chunks at 16kHz', () => {
    const sampleRate = 16000;
    const frameSize = 40; // ms
    const samplesPerFrame = (frameSize * sampleRate) / 1000;
    expect(samplesPerFrame).toBe(640);

    // VAD requires 512 samples
    const vadFrameSize = 512;

    // First chunk: 640 samples - one complete frame
    let buffer = 640;
    const completeFrames1 = Math.floor(buffer / vadFrameSize);
    expect(completeFrames1).toBe(1);
    const remaining1 = buffer % vadFrameSize;
    expect(remaining1).toBe(128);

    // Second chunk: 128 + 640 = 768 samples - one frame
    buffer = 768;
    const completeFrames2 = Math.floor(buffer / vadFrameSize);
    expect(completeFrames2).toBe(1);
    const remaining2 = buffer % vadFrameSize;
    expect(remaining2).toBe(256);
  });

  it('should correctly calculate frames for 60ms chunks at 16kHz', () => {
    const sampleRate = 16000;
    const frameSize = 60; // ms
    const samplesPerFrame = (frameSize * sampleRate) / 1000;
    expect(samplesPerFrame).toBe(960);

    // VAD requires 512 samples
    const vadFrameSize = 512;

    // First chunk: 960 samples - one complete frame
    let buffer = 960;
    const completeFrames1 = Math.floor(buffer / vadFrameSize);
    expect(completeFrames1).toBe(1);
    const remaining1 = buffer % vadFrameSize;
    expect(remaining1).toBe(448);

    // Second chunk: 448 + 960 = 1408 samples - two frames
    buffer = 1408;
    const completeFrames2 = Math.floor(buffer / vadFrameSize);
    expect(completeFrames2).toBe(2);
    const remaining2 = buffer % vadFrameSize;
    expect(remaining2).toBe(384);
  });

  it('should accumulate samples correctly across multiple 20ms calls', () => {
    const vadFrameSize = 512;
    const chunkSize = 320; // 20ms at 16kHz
    let buffer = 0;
    let totalFramesProcessed = 0;

    // Simulate 10 chunks
    for (let i = 0; i < 10; i++) {
      buffer += chunkSize;
      const framesThisCall = Math.floor(buffer / vadFrameSize);
      totalFramesProcessed += framesThisCall;
      buffer = buffer % vadFrameSize;
    }

    // 10 chunks × 320 = 3200 samples
    // 3200 / 512 = 6 complete frames with 128 remaining
    expect(totalFramesProcessed).toBe(6);
    expect(buffer).toBe(128);
  });

  it('should handle mixed frame sizes correctly', () => {
    const vadFrameSize = 512;
    let buffer = 0;
    let totalFramesProcessed = 0;

    // 20ms chunk
    buffer += 320;
    let frames = Math.floor(buffer / vadFrameSize);
    totalFramesProcessed += frames;
    buffer = buffer % vadFrameSize;
    expect(frames).toBe(0);
    expect(buffer).toBe(320);

    // 40ms chunk
    buffer += 640;
    frames = Math.floor(buffer / vadFrameSize);
    totalFramesProcessed += frames;
    buffer = buffer % vadFrameSize;
    expect(frames).toBe(1); // 320+640=960, 1 frame
    expect(buffer).toBe(448);

    // 60ms chunk
    buffer += 960;
    frames = Math.floor(buffer / vadFrameSize);
    totalFramesProcessed += frames;
    buffer = buffer % vadFrameSize;
    expect(frames).toBe(2); // 448+960=1408, 2 frames
    expect(buffer).toBe(384);

    // Another 20ms chunk
    buffer += 320;
    frames = Math.floor(buffer / vadFrameSize);
    totalFramesProcessed += frames;
    buffer = buffer % vadFrameSize;
    expect(frames).toBe(1); // 384+320=704, 1 frame
    expect(buffer).toBe(192);

    // Total frames processed
    expect(totalFramesProcessed).toBe(4);
  });
});