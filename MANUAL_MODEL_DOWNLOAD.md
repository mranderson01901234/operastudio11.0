# Manual Model Download Guide

If you're experiencing issues downloading the SmolLM2 model from Hugging Face (unauthorized errors, network issues, etc.), you can download it manually using one of the methods below.

## Method 1: Using the Download Script (Recommended)

### Node.js Script (Cross-platform)

```bash
npm run download-model
```

Or directly:

```bash
node scripts/download-smollm-model.js
```

This script will:
- Download all required model files directly from Hugging Face
- Place them in the correct cache directory (`~/.cache/huggingface/hub/`)
- Show download progress for each file
- Handle retries automatically

### Bash Script (Linux/Mac)

```bash
./scripts/download-smollm-model.sh
```

## Method 2: Manual Download

If the scripts don't work, you can download files manually:

1. **Create the cache directory:**
   ```bash
   mkdir -p ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main
   ```

2. **Download required files** from:
   https://huggingface.co/Xenova/SmolLM2-360M-Instruct/tree/main

   Required files:
   - `tokenizer.json`
   - `tokenizer_config.json`
   - `config.json`
   - `generation_config.json`
   - `model.onnx`
   - `model.onnx.data` (this is the large file, ~1.4GB)

3. **Place all files in:**
   ```
   ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main/
   ```

4. **Create reference file:**
   ```bash
   mkdir -p ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/refs
   echo "snapshots/main" > ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/refs/main
   ```

## Method 3: Using wget/curl

You can download files directly using wget or curl:

```bash
MODEL_DIR=~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main
mkdir -p "$MODEL_DIR"

cd "$MODEL_DIR"

# Download each file
wget https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main/tokenizer.json
wget https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main/tokenizer_config.json
wget https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main/config.json
wget https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main/generation_config.json
wget https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main/model.onnx
wget https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main/model.onnx.data
```

Or with curl:

```bash
MODEL_DIR=~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main
mkdir -p "$MODEL_DIR"

cd "$MODEL_DIR"

BASE_URL="https://huggingface.co/Xenova/SmolLM2-360M-Instruct/resolve/main"

curl -L -o tokenizer.json "${BASE_URL}/tokenizer.json"
curl -L -o tokenizer_config.json "${BASE_URL}/tokenizer_config.json"
curl -L -o config.json "${BASE_URL}/config.json"
curl -L -o generation_config.json "${BASE_URL}/generation_config.json"
curl -L -o model.onnx "${BASE_URL}/model.onnx"
curl -L -o model.onnx.data "${BASE_URL}/model.onnx.data"
```

## Verification

After downloading, verify the files are in place:

```bash
ls -lh ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main/
```

You should see all 6 files listed above.

## How It Works

The application will automatically detect locally downloaded model files and use them instead of trying to download from Hugging Face. The code checks for local files first, and only falls back to Hugging Face if they're not found.

## Troubleshooting

### Files downloaded but model still fails to load

1. Check file permissions:
   ```bash
   ls -la ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main/
   ```

2. Verify all files are present (especially `model.onnx.data` which is the largest)

3. Check the application logs for specific error messages

### Download interrupted

The scripts support resuming - just run them again. They'll skip files that already exist (though you may want to delete incomplete files first).

### Network issues

If you're behind a firewall or proxy, you may need to:
- Configure proxy settings for curl/wget
- Use a VPN
- Download from a different network
- Use a mirror/CDN if available

## Alternative: Use a Different Model

If SmolLM2 continues to cause issues, you can modify `lib/clients/smollm.ts` to use a different, smaller model that's easier to download. Some alternatives:
- `Xenova/gpt2` (smaller, faster to download)
- `Xenova/distilgpt2` (even smaller)

