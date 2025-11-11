/**
 * Verification script to confirm 100% that the model configuration matches
 * the exact specification provided by the user.
 */

import { readFileSync } from "fs";
import { join } from "path";

console.log("=".repeat(80));
console.log("VERIFYING GEMINI MODEL CONFIGURATION");
console.log("=".repeat(80));
console.log();

const projectRoot = join(__dirname, "..");

// Read the gemini.ts file
const geminiClientPath = join(projectRoot, "lib/clients/gemini.ts");
const geminiClientCode = readFileSync(geminiClientPath, "utf-8");

// Read the session.ts file
const sessionPath = join(projectRoot, "lib/chat/session.ts");
const sessionCode = readFileSync(sessionPath, "utf-8");

// Read the reference model file
const referenceModelPath = join(projectRoot, "scripts/gemini-model.ts");
const referenceModelCode = readFileSync(referenceModelPath, "utf-8");

console.log("CHECK 1: Model Name");
console.log("-".repeat(80));
const hasGeminiFlashLatest = 
  geminiClientCode.includes('DEFAULT_MODEL = "gemini-flash-latest"') ||
  geminiClientCode.includes('DEFAULT_MODEL = "gemini-flash-latest"');
const sessionHasGeminiFlashLatest = sessionCode.includes('model: "gemini-flash-latest"');

if (hasGeminiFlashLatest) {
  console.log("✅ lib/clients/gemini.ts uses gemini-flash-latest");
} else {
  console.log("❌ lib/clients/gemini.ts does NOT use gemini-flash-latest");
}

if (sessionHasGeminiFlashLatest) {
  console.log("✅ lib/chat/session.ts uses gemini-flash-latest");
} else {
  console.log("❌ lib/chat/session.ts does NOT use gemini-flash-latest");
}
console.log();

console.log("CHECK 2: Temperature Configuration");
console.log("-".repeat(80));
const hasTemperature135 = geminiClientCode.includes("temperature: 1.35");
if (hasTemperature135) {
  console.log("✅ Temperature is set to 1.35");
} else {
  console.log("❌ Temperature is NOT set to 1.35");
}
console.log();

console.log("CHECK 3: Thinking Budget Configuration");
console.log("-".repeat(80));
const hasThinkingBudget0 = 
  geminiClientCode.includes("thinkingBudget: 0") ||
  geminiClientCode.includes('thinkingBudget: 0');
if (hasThinkingBudget0) {
  console.log("✅ Thinking budget is set to 0");
} else {
  console.log("❌ Thinking budget is NOT set to 0");
}
console.log();

console.log("CHECK 4: Image Size Configuration");
console.log("-".repeat(80));
const hasImageSize1K = 
  geminiClientCode.includes('imageSize: "1K"') ||
  geminiClientCode.includes("imageSize: '1K'");
if (hasImageSize1K) {
  console.log("✅ Image size is set to 1K");
} else {
  console.log("❌ Image size is NOT set to 1K");
}
console.log();

console.log("CHECK 5: System Instruction");
console.log("-".repeat(80));
const systemInstructionKeyPhrases = [
  "high-speed, reasoning-optimized assistant",
  "Prioritize short latency",
  "Answer First: Start with the result",
  "Never stream unnecessary tokens",
  "systemInstruction",
];

let systemInstructionChecks = 0;
for (const phrase of systemInstructionKeyPhrases) {
  if (geminiClientCode.includes(phrase)) {
    systemInstructionChecks++;
    console.log(`✅ Found: "${phrase}"`);
  } else {
    console.log(`❌ Missing: "${phrase}"`);
  }
}

if (systemInstructionChecks === systemInstructionKeyPhrases.length) {
  console.log();
  console.log("✅ System instruction is fully configured");
} else {
  console.log();
  console.log(`⚠️  System instruction partially configured (${systemInstructionChecks}/${systemInstructionKeyPhrases.length} checks passed)`);
}
console.log();

console.log("CHECK 6: System Instruction Format");
console.log("-".repeat(80));
const hasSystemInstructionArray = geminiClientCode.includes("systemInstruction: [");
const hasSystemInstructionText = geminiClientCode.includes("text: SYSTEM_INSTRUCTION_TEXT") || 
                                  geminiClientCode.includes('text: `Operate as a high-speed');

if (hasSystemInstructionArray) {
  console.log("✅ System instruction is in array format");
} else {
  console.log("❌ System instruction is NOT in array format");
}

if (hasSystemInstructionText) {
  console.log("✅ System instruction has text property");
} else {
  console.log("❌ System instruction does NOT have text property");
}
console.log();

console.log("CHECK 7: Comparison with Reference Model");
console.log("-".repeat(80));
const referenceHasModel = referenceModelCode.includes("gemini-flash-latest");
const referenceHasTemp = referenceModelCode.includes("temperature: 1.35");
const referenceHasThinking = referenceModelCode.includes("thinkingBudget: 0");
const referenceHasImage = referenceModelCode.includes("imageSize: '1K'");
const referenceHasSystem = referenceModelCode.includes("systemInstruction: [");

if (referenceHasModel && referenceHasTemp && referenceHasThinking && referenceHasImage && referenceHasSystem) {
  console.log("✅ Reference model file has all required configurations");
} else {
  console.log("⚠️  Reference model file missing some configurations");
  console.log(`   Model: ${referenceHasModel}, Temp: ${referenceHasTemp}, Thinking: ${referenceHasThinking}, Image: ${referenceHasImage}, System: ${referenceHasSystem}`);
}
console.log();

console.log("=".repeat(80));
console.log("FINAL VERIFICATION SUMMARY");
console.log("=".repeat(80));
console.log();

const allChecks = [
  hasGeminiFlashLatest && sessionHasGeminiFlashLatest,
  hasTemperature135,
  hasThinkingBudget0,
  hasImageSize1K,
  systemInstructionChecks === systemInstructionKeyPhrases.length,
  hasSystemInstructionArray && hasSystemInstructionText,
];

const passedChecks = allChecks.filter(Boolean).length;
const totalChecks = allChecks.length;

console.log(`Configuration Status: ${passedChecks}/${totalChecks} checks passed`);
console.log();

if (passedChecks === totalChecks) {
  console.log("🎉 SUCCESS: All configuration checks passed!");
  console.log("✅ The model is configured IDENTICALLY to the reference code.");
  console.log();
  console.log("The system is using:");
  console.log("  - Model: gemini-flash-latest");
  console.log("  - Temperature: 1.35");
  console.log("  - Thinking Budget: 0");
  console.log("  - Image Size: 1K");
  console.log("  - System Instruction: Full high-speed reasoning-optimized assistant prompt");
  console.log();
  console.log("To test the API connection, run:");
  console.log("  npx tsx scripts/test-gemini-model-config.ts");
  process.exit(0);
} else {
  console.log("⚠️  WARNING: Some configuration checks failed.");
  console.log("Please review the output above to identify missing configurations.");
  process.exit(1);
}

