import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  return cachedClient;
}

export interface ImagenGenerateOptions {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  numberOfImages?: number;
  model?: "imagen-4" | "imagen-4-ultra" | "imagen-4-fast";
  // Safety filter levels match the SDK enum: BLOCK_LOW_AND_ABOVE, BLOCK_MEDIUM_AND_ABOVE, BLOCK_ONLY_HIGH, BLOCK_NONE
  safetyFilterLevel?: "BLOCK_LOW_AND_ABOVE" | "BLOCK_MEDIUM_AND_ABOVE" | "BLOCK_ONLY_HIGH" | "BLOCK_NONE";
  personGeneration?: "ALLOW_ALL" | "ALLOW_ADULT" | "DONT_ALLOW";
}

export interface ImagenGenerateResult {
  images: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
  model: string;
  generationTime?: number;
}

/**
 * Generate an image using Google's Imagen API via the Google GenAI SDK.
 * 
 * This implementation uses the SDK's generateImages method which properly
 * handles authentication and API communication.
 */
export async function generateImage(
  options: ImagenGenerateOptions
): Promise<ImagenGenerateResult> {
  // Map model names to actual API model identifiers
  // Imagen 4 models use the format imagen-4.0-generate-001 (per Google's API)
  // Try Imagen 4 models first, fallback to Imagen 3 if needed
  const modelMap: Record<string, { apiModel: string; displayName: string }> = {
    "imagen-4": { 
      apiModel: "imagen-4.0-generate-001", 
      displayName: "Imagen 4" 
    },
    "imagen-4-ultra": { 
      apiModel: "imagen-4.0-generate-001", // Ultra may use same model with different config
      displayName: "Imagen 4 Ultra" 
    },
    "imagen-4-fast": { 
      apiModel: "imagen-4.0-generate-001", // Fast may use same model with different config
      displayName: "Imagen 4 Fast" 
    },
  };
  
  const selectedModelConfig = modelMap[options.model || "imagen-4"] || modelMap["imagen-4"];
  const selectedModel = selectedModelConfig.apiModel;
  const displayModelName = selectedModelConfig.displayName;
  const aspectRatio = options.aspectRatio || "1:1";
  const numberOfImages = Math.min(Math.max(options.numberOfImages || 1, 1), 4);
  
  try {
    const client = getClient();
    
    // Use the SDK's generateImages method
    // Note: Imagen models via Gemini API only support BLOCK_LOW_AND_ABOVE
    // Force to BLOCK_LOW_AND_ABOVE regardless of user preference
    const safetyLevel = "BLOCK_LOW_AND_ABOVE";
    
    if (options.safetyFilterLevel && options.safetyFilterLevel !== "BLOCK_LOW_AND_ABOVE") {
      console.warn(`[Imagen Client] Safety filter level ${options.safetyFilterLevel} not supported for Imagen via Gemini API. Using BLOCK_LOW_AND_ABOVE instead.`);
    }
    
    console.log("[Imagen Client] Calling SDK with:", {
      model: selectedModel,
      prompt: options.prompt.substring(0, 50) + "...",
      aspectRatio,
      numberOfImages,
      safetyFilterLevel: safetyLevel,
    });
    
    let response;
    try {
      response = await client.models.generateImages({
        model: selectedModel,
        prompt: options.prompt,
        config: {
          aspectRatio,
          numberOfImages,
          safetyFilterLevel: safetyLevel as any,
          personGeneration: (options.personGeneration || "ALLOW_ADULT") as any,
          includeRaiReason: true, // Include reason if filtered
        },
      });
      console.log("[Imagen Client] SDK call succeeded with Imagen 4");
    } catch (sdkError) {
      const errorMessage = sdkError instanceof Error ? sdkError.message : String(sdkError);
      console.error("[Imagen Client] SDK call failed with error:", sdkError);
      console.error("[Imagen Client] SDK error type:", sdkError?.constructor?.name);
      console.error("[Imagen Client] SDK error message:", errorMessage);
      
      // Check if it's a model not found error - try fallback to Imagen 3
      if (errorMessage.includes("404") || 
          errorMessage.includes("not found") || 
          errorMessage.includes("does not exist") ||
          errorMessage.includes("invalid model")) {
        console.log("[Imagen Client] Imagen 4 model not available, trying Imagen 3 fallback");
        
        // Try with Imagen 3 model
        try {
          response = await client.models.generateImages({
            model: "imagen-3.0-generate-002",
            prompt: options.prompt,
            config: {
              aspectRatio,
              numberOfImages,
              safetyFilterLevel: safetyLevel as any,
              personGeneration: (options.personGeneration || "ALLOW_ADULT") as any,
              includeRaiReason: true,
            },
          });
          console.log("[Imagen Client] SDK call succeeded with Imagen 3 fallback");
          // Update display name to indicate fallback
          const fallbackDisplayName = displayModelName.includes("Ultra") 
            ? "Imagen 4 Ultra (via Imagen 3)" 
            : displayModelName.includes("Fast")
            ? "Imagen 4 Fast (via Imagen 3)"
            : "Imagen 4 (via Imagen 3)";
          return {
            images: (response.generatedImages || [])
              .filter((img) => img.image?.imageBytes)
              .map((img) => ({
                bytesBase64Encoded: img.image!.imageBytes!,
                mimeType: img.image!.mimeType || "image/png",
              })),
            model: fallbackDisplayName,
          };
        } catch (fallbackError) {
          console.error("[Imagen Client] Fallback to Imagen 3 also failed:", fallbackError);
          throw sdkError; // Re-throw original error
        }
      } else {
        throw sdkError; // Re-throw if it's not a model not found error
      }
    }

    // Extract images from response
    const generatedImages = response.generatedImages || [];
    
    // Check if images were filtered out
    const filteredImages = generatedImages.filter((img) => img.raiFilteredReason);
    const validImages = generatedImages.filter((img) => img.image?.imageBytes);
    
    // If all images were filtered, provide helpful error message
    if (validImages.length === 0 && filteredImages.length > 0) {
      const reasons = filteredImages
        .map((img) => img.raiFilteredReason)
        .filter((r): r is string => !!r)
        .join(", ");
      throw new Error(`Content blocked by safety filter${reasons ? `: ${reasons}` : ""}. Please modify your prompt.`);
    }
    
    if (generatedImages.length === 0) {
      throw new Error("No images returned from API");
    }
    
    // Convert SDK response format to our expected format
    const images = validImages.map((img) => {
      const imageBytes = img.image?.imageBytes || "";
      const mimeType = img.image?.mimeType || "image/png";
      
      // imageBytes is already base64 encoded according to the SDK
      return {
        bytesBase64Encoded: imageBytes,
        mimeType,
      };
    });
    
    if (images.length === 0) {
      throw new Error("No valid images returned from API (missing image data)");
    }
    
    return {
      images,
      model: displayModelName, // Return user-friendly display name
    };
  } catch (error) {
    console.error("[Imagen Client] Error generating image:", error);
    
    if (error instanceof Error) {
      const errorMessage = error.message;
      console.error("[Imagen Client] ORIGINAL SDK ERROR MESSAGE:", errorMessage);
      console.error("[Imagen Client] Error stack:", error.stack);
      
      // Log the full error object if it has additional properties
      if (error && typeof error === 'object') {
        try {
          const errorDetails = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...Object.getOwnPropertyNames(error).reduce((acc, key) => {
              try {
                acc[key] = (error as any)[key];
              } catch {
                // Skip non-serializable properties
              }
              return acc;
            }, {} as Record<string, any>),
          };
          console.error("[Imagen Client] Full error object:", JSON.stringify(errorDetails, null, 2));
        } catch (e) {
          console.error("[Imagen Client] Could not serialize error object:", e);
        }
      }
      
      // Only treat as safety filter error if it's explicitly about safety filtering
      // Check for our own error messages first, then check for SDK safety-related errors
      if (errorMessage.includes("Content blocked by safety filter")) {
        throw error; // Re-throw our own detailed error as-is
      }
      
      // Check for SDK safety filter errors (more specific patterns)
      // Only classify as safety filter if BOTH "safety" AND "filter" appear, or explicit "blocked" with context
      const isSafetyFilterError = 
        (errorMessage.includes("safety") && errorMessage.includes("filter")) ||
        (errorMessage.includes("blocked") && errorMessage.includes("safety")) ||
        (errorMessage.includes("blocked") && errorMessage.includes("filter"));
      
      if (isSafetyFilterError) {
        console.error("[Imagen Client] Classified as safety filter error");
        throw new Error(`Content blocked by safety filter: ${errorMessage}`);
      }
      
      // If it's not a safety filter error, log it and re-throw with context
      console.error("[Imagen Client] NOT a safety filter error - re-throwing original error");
      if (errorMessage.includes("quota") || errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        throw new Error("Imagen model not found. Please check that the model is available in your region.");
      }
      if (errorMessage.includes("GEMINI_API_KEY")) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
      }
      
      // Re-throw with context
      throw new Error(`Image generation failed: ${errorMessage}`);
    }
    throw new Error("Unknown error during image generation");
  }
}

