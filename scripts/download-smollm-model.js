#!/usr/bin/env node

/**
 * Script to manually download SmolLM2-360M-Instruct model files
 * This bypasses Hugging Face API and downloads directly using Node.js
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const MODEL_NAME = "Xenova/SmolLM2-360M-Instruct";
const CACHE_DIR = path.join(os.homedir(), ".cache", "huggingface", "hub");
const MODEL_DIR = path.join(CACHE_DIR, "models--xenova--smollm2-360m-instruct");
const SNAPSHOT_DIR = path.join(MODEL_DIR, "snapshots", "main");

// Try using git-lfs to clone the repository instead
// This is more reliable than direct HTTP downloads
const GIT_REPO_URL = `https://huggingface.co/${MODEL_NAME}`;

// Base URL for Hugging Face model files (direct download) - may require auth
const BASE_URL = `https://huggingface.co/${MODEL_NAME}/resolve/main`;

// List of required files for the model
const FILES = [
  "tokenizer.json",
  "tokenizer_config.json",
  "config.json",
  "generation_config.json",
  "model.onnx",
  "model.onnx.data",
];

/**
 * Download a file from URL
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const protocol = url.startsWith("https:") ? https : http;

    console.log(`Downloading ${path.basename(outputPath)}...`);

    protocol
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          return downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(outputPath);
          reject(
            new Error(
              `Failed to download: ${response.statusCode} ${response.statusMessage}`
            )
          );
          return;
        }

        const totalSize = parseInt(response.headers["content-length"] || "0", 10);
        let downloadedSize = 0;

        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`);
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`\n  ✓ Downloaded ${path.basename(outputPath)}`);
          resolve();
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      });
  });
}

/**
 * Try downloading using git-lfs (more reliable)
 */
function downloadWithGit() {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    
    console.log("Attempting to download using git-lfs...");
    console.log("This requires git and git-lfs to be installed.\n");
    
    // Check if git-lfs is available
    exec("git lfs version", (error) => {
      if (error) {
        reject(new Error("git-lfs is not installed. Please install it first:\n  sudo apt-get install git-lfs  # Linux\n  brew install git-lfs  # macOS"));
        return;
      }
      
      // Clone the repository
      console.log(`Cloning ${GIT_REPO_URL}...`);
      exec(`git clone ${GIT_REPO_URL} "${SNAPSHOT_DIR}"`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Git clone failed: ${error.message}\n${stderr}`));
          return;
        }
        
        console.log("✓ Repository cloned successfully");
        resolve();
      });
    });
  });
}

/**
 * Main download function
 */
async function downloadModel() {
  console.log("Downloading SmolLM2-360M-Instruct model files...");
  console.log(`Target directory: ${SNAPSHOT_DIR}\n`);

  // Try git-lfs first (more reliable)
  try {
    await downloadWithGit();
    console.log("\n✓ Model downloaded successfully using git-lfs!");
    console.log(`Model is ready at: ${SNAPSHOT_DIR}`);
    return;
  } catch (gitError) {
    console.log(`\nGit method failed: ${gitError.message}`);
    console.log("Falling back to direct HTTP download...\n");
  }

  // Create directories
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  // Download each file
  const results = [];
  for (const file of FILES) {
    const url = `${BASE_URL}/${file}`;
    const outputPath = path.join(SNAPSHOT_DIR, file);

    try {
      await downloadFile(url, outputPath);
      results.push({ file, success: true });
    } catch (error) {
      console.error(`  ✗ Failed to download ${file}: ${error.message}`);
      results.push({ file, success: false, error: error.message });
    }
  }

  // Create reference file
  try {
    const refsDir = path.join(MODEL_DIR, "refs");
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(
      path.join(refsDir, "main"),
      path.join(MODEL_DIR, "snapshots", "main")
    );
  } catch (error) {
    // Ignore ref file errors
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Download complete: ${successful} successful, ${failed} failed`);

  if (failed > 0) {
    console.log("\nFailed files:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.file}: ${r.error}`);
      });
    console.log(
      `\nYou can manually download these from: https://huggingface.co/${MODEL_NAME}/tree/main`
    );
  } else {
    console.log("\n✓ All files downloaded successfully!");
    console.log(`Model is ready at: ${SNAPSHOT_DIR}`);
  }
}

// Run download
downloadModel().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

