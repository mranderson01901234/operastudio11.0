import { pipeline, env } from "@xenova/transformers";
import type { TextGenerationPipeline } from "@xenova/transformers";

// SmolLM2-360M-Instruct model
// Note: HuggingFaceTB version doesn't have ONNX files for transformers.js
// Using a smaller, transformers.js-compatible model instead
// Options: "Xenova/gpt2" (small, fast), "Xenova/distilgpt2" (even smaller)
const MODEL_NAME = "Xenova/gpt2"; // Small, fast, transformers.js compatible model
const FALLBACK_MODEL = "Xenova/distilgpt2"; // Even smaller fallback

// Configure transformers.js environment
// Set cache directory to user's home directory to avoid permission issues
// Use dynamic imports for Node.js modules to avoid client-side bundling issues
let CACHE_DIR: string | null = null;

async function getCacheDir(): Promise<string> {
  if (CACHE_DIR) return CACHE_DIR;
  
  // Only import Node.js modules when running in Node.js environment
  if (typeof window === "undefined") {
    const path = await import("path");
    const os = await import("os");
    // Handle both default and namespace exports
    const pathModule = path.default || path;
    const osModule = os.default || os;
    CACHE_DIR = pathModule.join(osModule.homedir(), ".cache", "huggingface", "hub");
    env.cacheDir = CACHE_DIR;
    return CACHE_DIR;
  }
  
  // Fallback for browser (shouldn't happen, but TypeScript needs it)
  CACHE_DIR = "/tmp/.cache/huggingface/hub";
  env.cacheDir = CACHE_DIR;
  return CACHE_DIR;
}

// Allow local files and remote URLs
env.allowLocalModels = true;
env.allowRemoteModels = true;

/**
 * Check if a model exists in transformers.js cache by model ID
 * Returns the model ID if found, null otherwise
 */
async function checkModelInCache(modelId: string): Promise<boolean> {
  // Only check in Node.js environment
  if (typeof window !== "undefined") {
    return false;
  }

  const path = await import("path");
  const fs = await import("fs/promises");
  const cacheDir = await getCacheDir();
  
  // Handle both default and namespace exports
  const pathModule = path.default || path;
  const fsModule = fs.default || fs;
  
  // transformers.js uses TWO cache formats:
  // 1. models--{org}--{model-name} (for some models)
  // 2. {org}/{model-name} (direct format, like "Xenova/gpt2")
  
  // Try format 1: models--{org}--{model-name}
  const cacheName1 = `models--${modelId.toLowerCase().replace(/\//g, "--")}`;
  const modelCacheDir1 = pathModule.join(cacheDir, cacheName1);
  
  // Try format 2: {org}/{model-name}
  const [org, model] = modelId.split("/");
  const modelCacheDir2 = pathModule.join(cacheDir, org, model);
  
  // Check format 1: models--{org}--{model-name} (check snapshots/main)
  try {
    await fsModule.access(modelCacheDir1);
    // Check snapshots/main subdirectory (transformers.js structure)
    const snapshotsDir = pathModule.join(modelCacheDir1, "snapshots", "main");
    try {
      await fsModule.access(snapshotsDir);
      const files = await fsModule.readdir(snapshotsDir);
      // Check for essential files
      const hasFiles = files.some(f => f.endsWith(".json") || f.endsWith(".onnx") || f === "onnx");
      if (hasFiles) {
        console.log(`[SmolLM2] Found cached model: ${modelId} in ${snapshotsDir}`);
        return true;
      }
    } catch {
      // snapshots/main doesn't exist, check root
      const files = await fsModule.readdir(modelCacheDir1);
      if (files.length > 0) {
        console.log(`[SmolLM2] Found cached model: ${modelId} in ${modelCacheDir1}`);
        return true;
      }
    }
  } catch (error) {
    // Format 1 not found
  }
  
  // Check format 2: {org}/{model-name} (direct format)
  try {
    await fsModule.access(modelCacheDir2);
    const files = await fsModule.readdir(modelCacheDir2);
    // Check for essential files
    const hasFiles = files.some(f => f.endsWith(".json") || f.endsWith(".onnx") || f === "onnx");
    if (hasFiles) {
      console.log(`[SmolLM2] Found cached model: ${modelId} in ${modelCacheDir2}`);
      return true;
    }
  } catch (error) {
    // Format 2 not found
  }

  return false;
}

/**
 * Determine which model ID to use
 * Priority: SmolLM2 if available, otherwise GPT2
 */
async function getModelId(): Promise<string> {
  // Try SmolLM2 models first (if available in transformers.js)
  const smollm2Models = [
    "Xenova/smollm2-360m-instruct", // If available
    "HuggingFaceTB/SmolLM2-360M-Instruct", // Official
  ];
  
  for (const modelId of smollm2Models) {
    const exists = await checkModelInCache(modelId);
    if (exists) {
      console.log(`[SmolLM2] Using cached model: ${modelId}`);
      return modelId;
    }
  }
  
  // Fall back to GPT2 (always available)
  console.log(`[SmolLM2] Using fallback model: ${MODEL_NAME}`);
  return MODEL_NAME;
}

// Use globalThis to persist cache across Next.js serverless function invocations
// CRITICAL: In Next.js dev mode, hot reloading can clear globalThis, so we need to be defensive
// Pattern matches Prisma's approach for persistence
const globalForSmollm = globalThis as unknown as {
  __smollm_pipeline_cache: TextGenerationPipeline | undefined;
  __smollm_is_initializing: boolean | undefined;
  __smollm_init_promise: Promise<TextGenerationPipeline> | null | undefined;
  __smollm_model_type: "smollm2" | "gpt2" | undefined;
};

const getCachedPipeline = (): TextGenerationPipeline | null => {
  return globalForSmollm.__smollm_pipeline_cache ?? null;
};

const setCachedPipeline = (pipeline: TextGenerationPipeline | null): void => {
  globalForSmollm.__smollm_pipeline_cache = pipeline ?? undefined;
  // CRITICAL: In dev mode, explicitly persist to prevent hot reload clearing
  if (process.env.NODE_ENV !== "production") {
    (globalThis as any).__smollm_pipeline_cache = pipeline ?? undefined;
  }
};

const getIsInitializing = (): boolean => {
  return globalForSmollm.__smollm_is_initializing ?? false;
};

const setIsInitializing = (value: boolean): void => {
  globalForSmollm.__smollm_is_initializing = value;
  if (process.env.NODE_ENV !== "production") {
    (globalThis as any).__smollm_is_initializing = value;
  }
};

const getInitPromise = (): Promise<TextGenerationPipeline> | null => {
  return globalForSmollm.__smollm_init_promise ?? null;
};

const setInitPromise = (promise: Promise<TextGenerationPipeline> | null): void => {
  globalForSmollm.__smollm_init_promise = promise;
  if (process.env.NODE_ENV !== "production") {
    (globalThis as any).__smollm_init_promise = promise;
  }
};

/**
 * Get or initialize the SmolLM2-360M pipeline
 */
async function getPipeline(): Promise<TextGenerationPipeline> {
  const cachedPipeline = getCachedPipeline();
  if (cachedPipeline) {
    console.log(`[SmolLM2] Using cached pipeline`);
    return cachedPipeline;
  }

  const isInitializing = getIsInitializing();
  const initPromise = getInitPromise();
  if (isInitializing && initPromise) {
    console.log(`[SmolLM2] Waiting for ongoing initialization...`);
    return initPromise;
  }

  setIsInitializing(true);
  // Silent initialization - no user-facing logs
  // Logs only go to server console for debugging
  
  // Ensure cache directory is set
  await getCacheDir();
  
  console.log(`[SmolLM2] Starting initialization...`);
  console.log(`[SmolLM2] Cache directory: ${env.cacheDir}`);
  
  // Get model ID (NOT local path - transformers.js handles caching automatically)
  const modelId = await getModelId();
  console.log(`[SmolLM2] Using model ID: ${modelId}`);
  console.log(`[SmolLM2] transformers.js will automatically use cache if available`);
  
  // Detect model type for prompt formatting
  if (modelId.toLowerCase().includes("smollm")) {
    setModelType("smollm2");
  } else {
    setModelType("gpt2");
  }
  
  // Set Hugging Face token if available
  // @xenova/transformers uses HF_TOKEN from process.env automatically
  if (typeof process !== "undefined" && process.env?.HF_TOKEN) {
    console.log(`[SmolLM2] HF_TOKEN detected - will attempt authenticated download if needed`);
    if (!process.env.HF_TOKEN.startsWith("hf_")) {
      console.warn(`[SmolLM2] Warning: HF_TOKEN doesn't start with 'hf_' - may be invalid`);
    }
  }
  
  // IMPORTANT: Pass model ID, NOT local path!
  // transformers.js will:
  // 1. Check cache: {cacheDir}/models--{org}--{model-name}/
  // 2. Download if missing
  // 3. Load from cache if found
  const newInitPromise = pipeline("text-generation", modelId, {
    progress_callback: (progress: any) => {
      if (progress?.status === "downloading") {
        console.log(`[SmolLM2] Downloading: ${progress?.file || "model files"}...`);
      }
    },
  } as any).then((p) => p as TextGenerationPipeline)
    .then((pipeline) => {
      setCachedPipeline(pipeline);
      setIsInitializing(false);
      setInitPromise(null);
      console.log(`[SmolLM2] Initialization successful - pipeline cached`);
      return pipeline;
    })
    .catch((error) => {
      setIsInitializing(false);
      setInitPromise(null);
      // Enhanced error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[SmolLM2] Initialization failed:`, errorMessage);
      if (errorStack) {
        console.error(`[SmolLM2] Stack trace:`, errorStack);
      }
      
      // Provide more helpful error messages
      if (errorMessage.includes("Unauthorized") || errorMessage.includes("401")) {
        console.error(
          `[SmolLM2] Failed to download model: Unauthorized access.\n` +
          `Try one of these alternatives:\n` +
          `1. Download manually using git-lfs: ./scripts/download-model-git.sh\n` +
          `2. Set HF_TOKEN environment variable for authentication\n` +
          `3. The local model feature will be disabled - using Gemini API instead`
        );
        // Don't throw - let the system fall back to Gemini API
        throw new Error("Local model unavailable - using Gemini API instead");
      }
      
      if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
        throw new Error(
          `Failed to access model files: ${errorMessage}. ` +
          `Check your internet connection and ensure the model repository is accessible.`
        );
      }
      
      throw error;
    });

  setInitPromise(newInitPromise);
  return newInitPromise;
}

export interface LocalModelOptions {
  maxLength?: number;
  temperature?: number;
  topP?: number;
  doSample?: boolean;
}

/**
 * Get/set model type (persisted in globalThis)
 */
function setModelType(type: "smollm2" | "gpt2"): void {
  globalForSmollm.__smollm_model_type = type;
  if (process.env.NODE_ENV !== "production") {
    (globalThis as any).__smollm_model_type = type;
  }
}

function getModelType(): "smollm2" | "gpt2" {
  return globalForSmollm.__smollm_model_type ?? "gpt2";
}

/**
 * Format prompt based on model type
 */
function formatPrompt(prompt: string, modelType: "smollm2" | "gpt2"): string {
  if (modelType === "smollm2") {
    // SmolLM2 uses ChatML format with <|im_start|> and <|im_end|> tokens
    return `<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
  } else {
    // GPT2 uses simple text prompts without special tokens
    return prompt;
  }
}

/**
 * Get stop tokens based on model type
 */
function getStopTokens(modelType: "smollm2" | "gpt2"): string[] {
  if (modelType === "smollm2") {
    return ["<|im_end|>", "<|im_start|>", "<|user|>", "<|assistant|>"];
  } else {
    return ["\n\n", "<|endoftext|>"];
  }
}

/**
 * Clean generated text based on model type
 */
function cleanGeneratedText(text: string, modelType: "smollm2" | "gpt2"): string {
  let cleaned = text;
  
  if (modelType === "smollm2") {
    // Remove ChatML tokens and artifacts
    cleaned = cleaned
      .replace(/<\|im_start\|>/g, "")
      .replace(/<\|im_end\|>/g, "")
      .replace(/<\|user\|>/g, "")
      .replace(/<\|assistant\|>/g, "")
      .replace(/<\|assistant\/\>/g, "") // Handle malformed tags
      .replace(/<assistant\/>/g, "") // Handle HTML-like tags
      .replace(/<assistant>/g, "")
      .replace(/<\/assistant>/g, "");
  } else {
    // Remove GPT2 artifacts
    cleaned = cleaned.replace(/<\|endoftext\|>/g, "");
  }
  
  // Remove any leading/trailing whitespace and normalize newlines
  cleaned = cleaned.trim().replace(/\n{3,}/g, "\n\n");
  
  return cleaned;
}

/**
 * Generate text using SmolLM2-360M or GPT2 fallback
 */
export async function generateText(
  prompt: string,
  options: LocalModelOptions = {}
): Promise<string> {
  try {
    const pipeline = await getPipeline();
    
    // Get model type (set during initialization)
    const modelType = getModelType();

    const {
      maxLength = 512,
      temperature = 0.7,
      topP = 0.9,
      doSample = true,
    } = options;

    // Format prompt based on model type
    const formattedPrompt = formatPrompt(prompt, modelType);

    // Note: transformers.js may not support stop_sequences directly
    // We'll rely on max_new_tokens and post-processing cleanup instead
    const result = await pipeline(formattedPrompt, {
      max_new_tokens: maxLength,
      temperature,
      top_p: topP,
      do_sample: doSample,
      return_full_text: false,
    } as any);
    
    console.log(`[SmolLM2] Generated text length: ${JSON.stringify(result).length} chars, Model type: ${modelType}`);

    // Extract generated text
    const generatedText = Array.isArray(result)
      ? (result[0] as any)?.generated_text || ""
      : (result as any)?.generated_text || "";

    // Clean up the response based on model type
    const cleanedText = cleanGeneratedText(generatedText, modelType);
    
    // Log if we had to clean up artifacts
    if (generatedText !== cleanedText) {
      console.log(`[SmolLM2] Cleaned ${generatedText.length - cleanedText.length} chars of artifacts from response`);
    }
    
    // If cleaned text is empty or just whitespace, return a fallback message
    if (!cleanedText || cleanedText.trim().length === 0) {
      console.warn(`[SmolLM2] Generated text was empty after cleaning. Model type: ${modelType}, Original length: ${generatedText.length}`);
      return "I apologize, but I couldn't generate a proper response. Please try rephrasing your question.";
    }
    
    console.log(`[SmolLM2] Successfully generated ${cleanedText.length} chars of text`);
    return cleanedText;
  } catch (error) {
    console.error("Error generating text with SmolLM2-360M:", error);
    throw new Error(
      `Failed to generate text: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if the local model is available and ready
 */
export async function isModelReady(): Promise<boolean> {
  try {
    await getPipeline();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Reset the cached pipeline (useful for testing or memory management)
 */
export function resetPipeline(): void {
  setCachedPipeline(null);
  setInitPromise(null);
  setIsInitializing(false);
  console.log(`[SmolLM2] Pipeline cache reset`);
}

/**
 * Trigger model initialization (for background pre-loading)
 * This will start downloading the model if not already cached
 */
export async function triggerInitialization(): Promise<void> {
  try {
    await getPipeline();
  } catch (error) {
    // Errors during initialization are expected - model will be ready later
    // This is called in background, so we don't throw
  }
}

/**
 * Pre-load model at module initialization (for server startup)
 * This ensures the model is loaded into memory immediately, not on first request
 * 
 * CRITICAL: This runs when the module is first imported, loading the model
 * into memory so it's ready for the first request without delay.
 */
if (typeof window === "undefined") {
  // Only pre-load in Node.js environment (server-side)
  // Use setImmediate to avoid blocking module load
  setImmediate(() => {
    getPipeline()
      .then(() => {
        console.log(`[SmolLM2] ✅ Model pre-loaded at server startup - ready for requests`);
      })
      .catch((error) => {
        // Silent failure - model will load on first request instead
        console.log(`[SmolLM2] Pre-load failed, will load on first request: ${error instanceof Error ? error.message : "Unknown error"}`);
      });
  });
}

