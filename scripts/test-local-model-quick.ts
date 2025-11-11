#!/usr/bin/env tsx

/**
 * Quick test script for local model
 * Usage: npm run test-local-model "your prompt here"
 */

import { generateText, isModelReady } from "../lib/clients/smollm";

async function quickTest() {
  const prompt = process.argv[2] || "What is artificial intelligence?";
  
  console.log("Testing Local Model (SmolLM2/GPT2)");
  console.log("=".repeat(50));
  console.log(`Prompt: "${prompt}"`);
  console.log("");

  try {
    // Check if model is ready
    console.log("Checking if model is ready...");
    const ready = await isModelReady();
    
    if (!ready) {
      console.log("❌ Model is not ready");
      console.log("   The model will download automatically or use Gemini API instead.");
      process.exit(1);
    }
    
    console.log("✓ Model is ready!");
    console.log("");

    // Generate text
    console.log("Generating response...");
    const startTime = Date.now();
    const result = await generateText(prompt, {
      maxLength: 200,
      temperature: 0.7,
    });
    const duration = Date.now() - startTime;

    console.log("");
    console.log("Response:");
    console.log("-".repeat(50));
    console.log(result);
    console.log("-".repeat(50));
    console.log(`\n✓ Generated in ${duration}ms`);
    
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

quickTest();

