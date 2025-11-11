# Model Download Fix - Using Git-LFS

The direct HTTP download method is failing due to Hugging Face authentication requirements. Here's the **recommended solution**:

## Recommended: Use Git-LFS (Most Reliable)

### Step 1: Install git-lfs

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install git-lfs
git lfs install
```

**macOS:**
```bash
brew install git-lfs
git lfs install
```

**Fedora:**
```bash
sudo dnf install git-lfs
git lfs install
```

### Step 2: Download the Model

Run the git-based download script:

```bash
npm run download-model-git
```

Or directly:
```bash
./scripts/download-model-git.sh
```

This will:
- Clone the model repository using git-lfs
- Download all files (including the large model.onnx.data file)
- Place them in the correct cache directory
- Set up the reference files correctly

### Why Git-LFS Works Better

1. **No authentication needed** - Public repositories can be cloned without tokens
2. **Resumable downloads** - If interrupted, you can resume with `git pull`
3. **Handles large files** - git-lfs is designed for large binary files
4. **More reliable** - Less likely to be blocked by firewalls/proxies

## Alternative: Disable Local Model

If you don't want to deal with model downloads, the application will automatically fall back to using the Gemini API. The local model is optional and only used for simple tasks to reduce API usage.

To disable it completely, you can modify `lib/clients/smollm.ts` to always return `false` from `isModelReady()`.

## Troubleshooting

### Git-LFS not downloading large files

If git-lfs files show as pointers instead of actual files:

```bash
cd ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main
git lfs pull
```

### Check if model is downloaded correctly

```bash
ls -lh ~/.cache/huggingface/hub/models--xenova--smollm2-360m-instruct/snapshots/main/
```

You should see:
- `model.onnx.data` (large file, ~1.4GB)
- `model.onnx`
- `tokenizer.json`
- `config.json`
- And other files

### Still having issues?

The application will work fine without the local model - it will just use Gemini API for all requests. The local model is an optimization, not a requirement.

