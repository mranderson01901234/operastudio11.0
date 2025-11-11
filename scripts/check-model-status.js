#!/usr/bin/env node

/**
 * Check SmolLM2-360M model download status
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.cache', 'huggingface', 'hub');
const MODEL_NAME = 'Xenova/SmolLM2-360M-Instruct';

console.log('🔍 Checking SmolLM2-360M model status...\n');

// Check if cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  console.log('❌ HuggingFace cache directory not found:', CACHE_DIR);
  console.log('   The model hasn\'t started downloading yet.');
  console.log('   It will download automatically on first API call.\n');
  process.exit(1);
}

console.log('✅ Cache directory exists:', CACHE_DIR);

// Look for model files
const modelDirs = fs.readdirSync(CACHE_DIR, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

const modelDir = modelDirs.find(dir => dir.includes('SmolLM') || dir.includes('smollm'));

if (!modelDir) {
  console.log('❌ Model directory not found');
  console.log('   Available directories:', modelDirs.slice(0, 5).join(', '), '...');
  console.log('   The model download may not have started yet.\n');
  process.exit(1);
}

const modelPath = path.join(CACHE_DIR, modelDir);
const files = fs.readdirSync(modelPath);

console.log('✅ Model directory found:', modelDir);
console.log('   Path:', modelPath);
console.log('   Files:', files.length);

// Check file sizes
let totalSize = 0;
files.forEach(file => {
  const filePath = path.join(modelPath, file);
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      totalSize += stats.size;
    }
  } catch (e) {
    // Ignore errors
  }
});

const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
console.log('   Total size:', sizeMB, 'MB');

if (totalSize < 100 * 1024 * 1024) { // Less than 100MB
  console.log('⚠️  Model appears incomplete (expected ~1.4GB)');
  console.log('   Download may still be in progress.\n');
} else {
  console.log('✅ Model appears complete\n');
}

