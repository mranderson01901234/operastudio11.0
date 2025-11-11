#!/usr/bin/env tsx

/**
 * Test script for SmolLM2 model
 * Tests model initialization and text generation
 */

import { generateText, isModelReady, resetPipeline } from "../lib/clients/smollm";

async function testSmolLM() {
  console.log("=".repeat(60));
  console.log("SmolLM2 Model Test");
  console.log("=".repeat(60));
  console.log("");

  // Test 1: Check if model is ready
  console.log("Test 1: Checking if model is ready...");
  try {
    const ready = await isModelReady();
    if (ready) {
      console.log("✓ Model is ready!");
    } else {
      console.log("✗ Model is not ready (will use Gemini API instead)");
      console.log("  This is fine - the app will work without the local model.");
      return;
    }
  } catch (error) {
    console.log("✗ Error checking model:", error instanceof Error ? error.message : String(error));
    console.log("  The app will use Gemini API instead.");
    return;
  }

  console.log("");

  // Test 2: Generate text with a simple prompt
  console.log("Test 2: Generating text with simple prompt...");
  try {
    const prompt = "What is artificial intelligence?";
    console.log(`Prompt: "${prompt}"`);
    console.log("Generating...");

    const startTime = Date.now();
    const result = await generateText(prompt, {
      maxLength: 100,
      temperature: 0.7,
    });
    const duration = Date.now() - startTime;

    console.log(`✓ Generated text (took ${duration}ms):`);
    console.log(`"${result}"`);
    console.log("");
  } catch (error) {
    console.log("✗ Error generating text:", error instanceof Error ? error.message : String(error));
    return;
  }

  // Test 3: Generate text with a different prompt
  console.log("Test 3: Generating text with instruction prompt...");
  try {
    const prompt = "Explain how a computer works in simple terms.";
    console.log(`Prompt: "${prompt}"`);
    console.log("Generating...");

    const startTime = Date.now();
    const result = await generateText(prompt, {
      maxLength: 150,
      temperature: 0.7,
    });
    const duration = Date.now() - startTime;

    console.log(`✓ Generated text (took ${duration}ms):`);
    console.log(`"${result}"`);
    console.log("");
  } catch (error) {
    console.log("✗ Error generating text:", error instanceof Error ? error.message : String(error));
    return;
  }

  // Test 4: Reset pipeline
  console.log("Test 4: Testing pipeline reset...");
  try {
    resetPipeline();
    console.log("✓ Pipeline reset successfully");
    console.log("");
  } catch (error) {
    console.log("✗ Error resetting pipeline:", error instanceof Error ? error.message : String(error));
  }

  console.log("=".repeat(60));
  console.log("All tests completed!");
  console.log("=".repeat(60));
}

// Run the test
testSmolLM().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

