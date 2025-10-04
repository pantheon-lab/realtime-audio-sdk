#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Silero VAD model URLs (updated to correct paths)
const MODELS = {
  v5: {
    url: 'https://github.com/snakers4/silero-vad/raw/refs/heads/master/src/silero_vad/data/silero_vad.onnx',
    filename: 'silero_vad_v5.onnx',
    description: 'Silero VAD v5 (latest, 512 sample frame size)'
  },
  legacy: {
    url: 'https://github.com/snakers4/silero-vad/raw/refs/heads/master/src/silero_vad/data/silero_vad_old.onnx',
    filename: 'silero_vad_legacy.onnx',
    description: 'Silero VAD legacy (1536 sample frame size)'
  }
};

// Download function
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloadedSize = 0;

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        file.write(chunk);

        // Show progress
        if (totalSize) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\rDownloading: ${percent}% (${formatBytes(downloadedSize)} / ${formatBytes(totalSize)})`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(''); // New line after progress
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Format bytes for display
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main function
async function main() {
  console.log('🎙️  Silero VAD Model Downloader\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const modelVersion = args[0] || 'v5';

  if (!MODELS[modelVersion]) {
    console.error(`❌ Invalid model version: ${modelVersion}`);
    console.log('\nAvailable models:');
    for (const [key, model] of Object.entries(MODELS)) {
      console.log(`  ${key}: ${model.description}`);
    }
    console.log('\nUsage: npm run download-model [v5|legacy]');
    process.exit(1);
  }

  const model = MODELS[modelVersion];

  // Create models directory
  const modelsDir = path.join(__dirname, '..', 'public', 'models');
  if (!fs.existsSync(modelsDir)) {
    console.log(`📁 Creating models directory: ${modelsDir}`);
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const destPath = path.join(modelsDir, model.filename);

  // Check if file already exists
  if (fs.existsSync(destPath)) {
    const stats = fs.statSync(destPath);
    console.log(`✅ Model already exists: ${model.filename} (${formatBytes(stats.size)})`);

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question('Do you want to re-download? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Skipping download.');
      return;
    }
  }

  // Download the model
  console.log(`📥 Downloading: ${model.description}`);
  console.log(`   URL: ${model.url}`);
  console.log(`   Destination: ${destPath}\n`);

  try {
    await downloadFile(model.url, destPath);

    // Verify file was downloaded
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      console.log(`\n✅ Model downloaded successfully!`);
      console.log(`   File: ${model.filename}`);
      console.log(`   Size: ${formatBytes(stats.size)}`);
      console.log(`   Path: ${destPath}`);

      // Update vite.config.ts to serve models
      await updateViteConfig();

      console.log('\n🎉 Setup complete! You can now use Silero VAD in your application.');
      console.log('\nExample usage:');
      console.log(`
const sdk = new RealtimeAudioSDK({
  processing: {
    vad: {
      enabled: true,
      provider: 'silero',
      modelPath: '/models/${model.filename}'
    }
  }
});
`);
    } else {
      throw new Error('File not found after download');
    }
  } catch (error) {
    console.error(`\n❌ Failed to download model: ${error.message}`);
    process.exit(1);
  }
}

// Update vite.config.ts to serve models directory
async function updateViteConfig() {
  const viteConfigPath = path.join(__dirname, '..', 'vite.config.ts');

  if (!fs.existsSync(viteConfigPath)) {
    console.log('\n📝 Creating vite.config.ts to serve model files...');

    const viteConfig = `import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  publicDir: 'public',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'RealtimeAudioSDK',
      fileName: 'realtime-audio-sdk',
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
  optimizeDeps: {
    include: ['onnxruntime-web'],
  },
});
`;

    fs.writeFileSync(viteConfigPath, viteConfig);
    console.log('✅ vite.config.ts created');
  }
}

// Run the script
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});