#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎯 Running VAD Tests with Real Audio File\n');

// Check if model exists
import fs from 'fs';
const modelPath = path.join(__dirname, '../public/models/silero_vad_v5.onnx');
if (!fs.existsSync(modelPath)) {
  console.error('❌ Silero VAD model not found!');
  console.log('Please run: npm run download-model');
  process.exit(1);
}

// Check if test audio exists
const audioPath = path.join(__dirname, 'vad_test_en.wav');
if (!fs.existsSync(audioPath)) {
  console.error('❌ Test audio file not found: vad_test_en.wav');
  console.log('Please add the test audio file to the tests directory.');
  process.exit(1);
}

console.log('✅ Prerequisites check passed\n');
console.log('📊 Running tests...\n');

// Run tests with vitest
const testProcess = spawn('npx', ['vitest', 'run', 'tests/vad.test.ts', '--reporter=verbose'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ All VAD tests passed!');
  } else {
    console.log(`\n❌ Tests failed with code ${code}`);
  }
  process.exit(code);
});