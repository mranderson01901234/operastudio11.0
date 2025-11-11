/**
 * Tool definitions for Imagen 4 image generation.
 * These tools allow the LLM to generate images from text prompts.
 */

import type { ToolDefinition } from "./tool-definitions";

export const IMAGEN_TOOLS: ToolDefinition[] = [
  {
    name: "imagen_generate",
    description: "Generate a NEW image from a text prompt using Google's Imagen 4 model. Use this ONLY when the user asks to create, generate, or make a NEW image, picture, photo, illustration, or visual. DO NOT use this tool if the user wants to edit, modify, blur, crop, resize, or adjust an EXISTING image that is already displayed. For editing existing images, use imagen_filter, imagen_crop, imagen_resize, or imagen_adjust instead. This tool creates a completely new image from scratch.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed text description of the image to generate. Be specific about style, composition, colors, mood, and any important details."
        },
        aspectRatio: {
          type: "string",
          description: "Image aspect ratio. Options: '1:1' (square), '16:9' (landscape), '9:16' (portrait), '4:3' (standard), '3:4' (vertical standard). Default: '1:1'"
        },
        numberOfImages: {
          type: "number",
          description: "Number of images to generate (1-4). Default: 1"
        },
        model: {
          type: "string",
          description: "Model variant: 'imagen-4' (standard), 'imagen-4-ultra' (high quality), 'imagen-4-fast' (fast generation). Default: 'imagen-4'"
        }
      },
      required: ["prompt"]
    }
  }
];

