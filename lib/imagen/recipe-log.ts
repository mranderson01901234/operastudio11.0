import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export interface EditStep {
  stepId: string; // Unique step ID
  toolName: string; // "imagen_crop", "imagen_resize", etc.
  arguments: Record<string, unknown>; // Tool arguments
  sourceHash: string; // Hash of input image
  outputHash: string; // Hash of output image
  timestamp: string; // ISO timestamp
  userId: string;
}

export type RecipeLog = EditStep[];

/**
 * Calculate hash of image buffer
 */
export function calculateImageHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Add edit step to recipe log
 */
export async function addEditStep(
  imageId: string,
  toolName: string,
  args: Record<string, unknown>,
  sourceHash: string,
  outputHash: string,
  userId: string
): Promise<void> {
  const image = await prisma.generatedImage.findFirst({
    where: { id: imageId, userId },
  });

  if (!image) {
    throw new Error("IMAGE_NOT_FOUND: Image not found");
  }

  const step: EditStep = {
    stepId: `step_${Date.now()}_${Math.random().toString(36)}`,
    toolName,
    arguments: args,
    sourceHash,
    outputHash,
    timestamp: new Date().toISOString(),
    userId,
  };

  // Load existing recipe
  const existingRecipe: EditStep[] = image.recipeJson
    ? JSON.parse(image.recipeJson)
    : [];

  // Append new step
  const updatedRecipe = [...existingRecipe, step];

  // Update image with new recipe
  await prisma.generatedImage.update({
    where: { id: imageId },
    data: {
      recipeJson: JSON.stringify(updatedRecipe),
      outputHash: outputHash,
    },
  });
}

/**
 * Get recipe log for an image
 */
export async function getRecipeLog(
  imageId: string,
  userId: string
): Promise<RecipeLog> {
  const image = await prisma.generatedImage.findFirst({
    where: { id: imageId, userId },
  });

  if (!image || !image.recipeJson) {
    return [];
  }

  return JSON.parse(image.recipeJson) as RecipeLog;
}

/**
 * Undo last edit step
 * Returns the previous image ID if available
 */
export async function undoLastStep(
  imageId: string,
  userId: string
): Promise<{ success: boolean; previousImageId?: string; message?: string }> {
  const image = await prisma.generatedImage.findFirst({
    where: { id: imageId, userId },
  });

  if (!image) {
    return { success: false, message: "Image not found" };
  }

  if (!image.recipeJson) {
    return { success: false, message: "No edit history to undo" };
  }

  const recipe: EditStep[] = JSON.parse(image.recipeJson);
  if (recipe.length === 0) {
    return { success: false, message: "No steps to undo" };
  }

  // Remove last step
  const updatedRecipe = recipe.slice(0, -1);

  // Find previous image (one step back)
  let previousImage;
  if (updatedRecipe.length > 0) {
    const previousStep = updatedRecipe[updatedRecipe.length - 1];
    previousImage = await prisma.generatedImage.findFirst({
      where: { outputHash: previousStep.outputHash, userId },
    });
  } else {
    // No more steps, go back to original
    previousImage = image.originalImageId
      ? await prisma.generatedImage.findFirst({
          where: { id: image.originalImageId, userId },
        })
      : null;
  }

  // Update image
  await prisma.generatedImage.update({
    where: { id: imageId },
    data: {
      recipeJson: JSON.stringify(updatedRecipe),
      outputHash:
        updatedRecipe.length > 0
          ? updatedRecipe[updatedRecipe.length - 1].outputHash
          : image.sourceHash,
    },
  });

  return {
    success: true,
    previousImageId: previousImage?.id,
  };
}

/**
 * Replay recipe on new source image
 * TODO: Implement actual replay by calling MCP tools sequentially
 */
export async function replayRecipe(
  sourceImageId: string,
  recipeImageId: string,
  userId: string
): Promise<{ success: boolean; newImageId?: string; message?: string }> {
  const sourceImage = await prisma.generatedImage.findFirst({
    where: { id: sourceImageId, userId },
  });

  const recipeImage = await prisma.generatedImage.findFirst({
    where: { id: recipeImageId, userId },
  });

  if (!sourceImage) {
    return { success: false, message: "Source image not found" };
  }

  if (!recipeImage || !recipeImage.recipeJson) {
    return { success: false, message: "Recipe not found" };
  }

  const recipe: EditStep[] = JSON.parse(recipeImage.recipeJson);

  // TODO: Execute each step in recipe on source image
  // This would require calling MCP tools sequentially
  // For now, return placeholder
  return {
    success: false,
    message: "Recipe replay not yet implemented. Will execute steps sequentially.",
  };
}

