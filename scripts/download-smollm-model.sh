#!/bin/bash

# Script to manually download SmolLM2-360M-Instruct model files
# This bypasses Hugging Face API and downloads directly

set -e

MODEL_NAME="Xenova/SmolLM2-360M-Instruct"
CACHE_DIR="${HOME}/.cache/huggingface/hub"
MODEL_DIR="${CACHE_DIR}/models--xenova--smollm2-360m-instruct"

# Create model directory
mkdir -p "${MODEL_DIR}/snapshots/main"

echo "Downloading SmolLM2-360M-Instruct model files..."
echo "Target directory: ${MODEL_DIR}"

# Base URL for Hugging Face model files (direct download)
BASE_URL="https://huggingface.co/${MODEL_NAME}/resolve/main"

# List of required files for the model
FILES=(
    "tokenizer.json"
    "tokenizer_config.json"
    "config.json"
    "generation_config.json"
    "model.onnx"
    "model.onnx.data"
)

# Download each file
for file in "${FILES[@]}"; do
    echo "Downloading ${file}..."
    url="${BASE_URL}/${file}"
    output="${MODEL_DIR}/snapshots/main/${file}"
    
    # Create directory if needed
    mkdir -p "$(dirname "${output}")"
    
    # Download with retry logic
    if curl -L --fail --retry 3 --retry-delay 2 -o "${output}" "${url}"; then
        echo "✓ Downloaded ${file}"
    else
        echo "✗ Failed to download ${file}"
        echo "  URL: ${url}"
        echo "  You may need to download this manually or check your network connection"
    fi
done

# Create a symlink or reference file
echo "Creating reference file..."
echo "${MODEL_DIR}/snapshots/main" > "${MODEL_DIR}/refs/main" 2>/dev/null || true

echo ""
echo "Download complete!"
echo "Model files are in: ${MODEL_DIR}/snapshots/main"
echo ""
echo "Note: If any files failed to download, you can:"
echo "1. Retry this script"
echo "2. Download manually from: https://huggingface.co/${MODEL_NAME}/tree/main"
echo "3. Place files in: ${MODEL_DIR}/snapshots/main/"

