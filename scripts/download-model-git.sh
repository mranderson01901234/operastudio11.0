#!/bin/bash

# Download SmolLM2 model using git-lfs (most reliable method)
# This bypasses Hugging Face API issues

set -e

MODEL_NAME="Xenova/SmolLM2-360M-Instruct"
CACHE_DIR="${HOME}/.cache/huggingface/hub"
MODEL_DIR="${CACHE_DIR}/models--xenova--smollm2-360m-instruct"
SNAPSHOT_DIR="${MODEL_DIR}/snapshots/main"
GIT_REPO_URL="https://huggingface.co/${MODEL_NAME}"

echo "Downloading SmolLM2-360M-Instruct using git-lfs..."
echo "Target directory: ${SNAPSHOT_DIR}"
echo ""

# Check if git-lfs is installed
if ! command -v git-lfs &> /dev/null; then
    echo "ERROR: git-lfs is not installed!"
    echo ""
    echo "Install it with:"
    echo "  Ubuntu/Debian: sudo apt-get install git-lfs"
    echo "  macOS:         brew install git-lfs"
    echo "  Fedora:        sudo dnf install git-lfs"
    echo ""
    echo "After installing, run: git lfs install"
    exit 1
fi

# Initialize git-lfs if not already done
if ! git lfs version &> /dev/null; then
    echo "Initializing git-lfs..."
    git lfs install
fi

# Create parent directory
mkdir -p "${MODEL_DIR}"

# Clone the repository
echo "Cloning repository..."
cd "${MODEL_DIR}"

if [ -d "snapshots/main" ]; then
    echo "Model directory already exists. Updating..."
    cd snapshots/main
    git pull
else
    git clone "${GIT_REPO_URL}" "snapshots/main"
    cd snapshots/main
fi

# Create reference file
echo "Creating reference file..."
mkdir -p "${MODEL_DIR}/refs"
echo "snapshots/main" > "${MODEL_DIR}/refs/main"

echo ""
echo "✓ Model downloaded successfully!"
echo "Model location: ${SNAPSHOT_DIR}"
echo ""
echo "The application will automatically detect and use this model."

