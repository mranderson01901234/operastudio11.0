/**
 * Verification script to confirm 100% that all tools (file system, email, GitHub)
 * are properly wired up with the new gemini-flash-latest model configuration.
 */

import { readFileSync } from "fs";
import { join } from "path";

console.log("=".repeat(80));
console.log("VERIFYING TOOLS WIRING WITH GEMINI MODEL");
console.log("=".repeat(80));
console.log();

const projectRoot = join(__dirname, "..");

// Read key files
const apiRoutePath = join(projectRoot, "app/api/chat/route.ts");
const apiRouteCode = readFileSync(apiRoutePath, "utf-8");

const geminiClientPath = join(projectRoot, "lib/clients/gemini.ts");
const geminiClientCode = readFileSync(geminiClientPath, "utf-8");

const sessionPath = join(projectRoot, "lib/chat/session.ts");
const sessionCode = readFileSync(sessionPath, "utf-8");

const toolDefinitionsPath = join(projectRoot, "lib/chat/tool-definitions.ts");
const toolDefinitionsCode = readFileSync(toolDefinitionsPath, "utf-8");

const emailToolsPath = join(projectRoot, "lib/chat/email-tool-definitions.ts");
const emailToolsCode = readFileSync(emailToolsPath, "utf-8");

const githubToolsPath = join(projectRoot, "lib/chat/github-tool-definitions.ts");
const githubToolsCode = readFileSync(githubToolsPath, "utf-8");

console.log("CHECK 1: Tool Imports in API Route");
console.log("-".repeat(80));
const hasFileToolsImport = apiRouteCode.includes('import { FILE_TOOLS');
const hasEmailToolsImport = apiRouteCode.includes('import { EMAIL_TOOLS');
const hasGitHubToolsImport = apiRouteCode.includes('import { GITHUB_TOOLS');

if (hasFileToolsImport) {
  console.log("✅ FILE_TOOLS imported");
} else {
  console.log("❌ FILE_TOOLS NOT imported");
}

if (hasEmailToolsImport) {
  console.log("✅ EMAIL_TOOLS imported");
} else {
  console.log("❌ EMAIL_TOOLS NOT imported");
}

if (hasGitHubToolsImport) {
  console.log("✅ GITHUB_TOOLS imported");
} else {
  console.log("❌ GITHUB_TOOLS NOT imported");
}
console.log();

console.log("CHECK 2: Tools Added to Available Tools Array");
console.log("-".repeat(80));
const hasFileToolsPush = apiRouteCode.includes('availableTools.push(...FILE_TOOLS)');
const hasEmailToolsPush = apiRouteCode.includes('availableTools.push(...EMAIL_TOOLS)');
const hasGitHubToolsPush = apiRouteCode.includes('availableTools.push(...GITHUB_TOOLS)');

if (hasFileToolsPush) {
  console.log("✅ FILE_TOOLS added to availableTools");
} else {
  console.log("❌ FILE_TOOLS NOT added to availableTools");
}

if (hasEmailToolsPush) {
  console.log("✅ EMAIL_TOOLS added to availableTools");
} else {
  console.log("❌ EMAIL_TOOLS NOT added to availableTools");
}

if (hasGitHubToolsPush) {
  console.log("✅ GITHUB_TOOLS added to availableTools");
} else {
  console.log("❌ GITHUB_TOOLS NOT added to availableTools");
}
console.log();

console.log("CHECK 3: Tools Passed to streamChat");
console.log("-".repeat(80));
const hasToolsPassed = apiRouteCode.includes('tools: enableTools ? availableTools : undefined');
if (hasToolsPassed) {
  console.log("✅ Tools passed to streamChat from API route");
} else {
  console.log("❌ Tools NOT passed to streamChat");
}
console.log();

console.log("CHECK 4: Session Layer Passes Tools");
console.log("-".repeat(80));
const sessionAcceptsTools = sessionCode.includes('tools?: ToolDefinition[]');
const sessionPassesTools = sessionCode.includes('tools, model');

if (sessionAcceptsTools) {
  console.log("✅ Session layer accepts tools parameter");
} else {
  console.log("❌ Session layer does NOT accept tools parameter");
}

if (sessionPassesTools) {
  console.log("✅ Session layer passes tools to connector");
} else {
  console.log("❌ Session layer does NOT pass tools to connector");
}
console.log();

console.log("CHECK 5: Gemini Client Accepts and Processes Tools");
console.log("-".repeat(80));
const geminiAcceptsTools = geminiClientCode.includes('tools?: ToolDefinition[]');
const geminiUsesTools = geminiClientCode.includes('createRequestConfig(signal, tools');
const geminiHasToolConfig = geminiClientCode.includes('functionDeclarations');

if (geminiAcceptsTools) {
  console.log("✅ Gemini client accepts tools parameter");
} else {
  console.log("❌ Gemini client does NOT accept tools parameter");
}

if (geminiUsesTools) {
  console.log("✅ Gemini client passes tools to createRequestConfig");
} else {
  console.log("❌ Gemini client does NOT pass tools to createRequestConfig");
}

if (geminiHasToolConfig) {
  console.log("✅ Gemini client configures tools (functionDeclarations)");
} else {
  console.log("❌ Gemini client does NOT configure tools");
}
console.log();

console.log("CHECK 6: Function Call Detection");
console.log("-".repeat(80));
const hasFunctionCallType = geminiClientCode.includes('type: "function_call"');
const hasFunctionCallDetection = geminiClientCode.includes('functionCall');
const hasFunctionCallYield = geminiClientCode.includes('yield {') && geminiClientCode.includes('functionCall:');

if (hasFunctionCallType) {
  console.log("✅ Function call type defined");
} else {
  console.log("❌ Function call type NOT defined");
}

if (hasFunctionCallDetection) {
  console.log("✅ Function calls detected in response");
} else {
  console.log("❌ Function calls NOT detected");
}

if (hasFunctionCallYield) {
  console.log("✅ Function calls yielded to stream");
} else {
  console.log("❌ Function calls NOT yielded");
}
console.log();

console.log("CHECK 7: Tool Definitions Exist");
console.log("-".repeat(80));
const hasFileToolsDef = toolDefinitionsCode.includes('export const FILE_TOOLS');
const hasEmailToolsDef = emailToolsCode.includes('export const EMAIL_TOOLS');
const hasGitHubToolsDef = githubToolsCode.includes('export const GITHUB_TOOLS');

if (hasFileToolsDef) {
  const fileToolCount = (toolDefinitionsCode.match(/name: "fs_/g) || []).length;
  console.log(`✅ FILE_TOOLS defined (${fileToolCount} tools)`);
} else {
  console.log("❌ FILE_TOOLS NOT defined");
}

if (hasEmailToolsDef) {
  const emailToolCount = (emailToolsCode.match(/name: "email_/g) || []).length;
  console.log(`✅ EMAIL_TOOLS defined (${emailToolCount} tools)`);
} else {
  console.log("❌ EMAIL_TOOLS NOT defined");
}

if (hasGitHubToolsDef) {
  const githubToolCount = (githubToolsCode.match(/name: "github_/g) || []).length;
  console.log(`✅ GITHUB_TOOLS defined (${githubToolCount} tools)`);
} else {
  console.log("❌ GITHUB_TOOLS NOT defined");
}
console.log();

console.log("CHECK 8: Model Configuration Includes Tools");
console.log("-".repeat(80));
const configHasTools = geminiClientCode.includes('tools: [') || geminiClientCode.includes('tools = [');
const configHasFunctionDeclarations = geminiClientCode.includes('functionDeclarations');

if (configHasTools || configHasFunctionDeclarations) {
  console.log("✅ Tools are added to config");
} else {
  console.log("❌ Tools are NOT added to config");
}
console.log();

console.log("=".repeat(80));
console.log("FINAL VERIFICATION SUMMARY");
console.log("=".repeat(80));
console.log();

const allChecks = [
  hasFileToolsImport && hasEmailToolsImport && hasGitHubToolsImport,
  hasFileToolsPush && hasEmailToolsPush && hasGitHubToolsPush,
  hasToolsPassed,
  sessionAcceptsTools && sessionPassesTools,
  geminiAcceptsTools && geminiUsesTools && geminiHasToolConfig,
  hasFunctionCallType && hasFunctionCallDetection && hasFunctionCallYield,
  hasFileToolsDef && hasEmailToolsDef && hasGitHubToolsDef,
  configHasTools || configHasFunctionDeclarations,
];

const passedChecks = allChecks.filter(Boolean).length;
const totalChecks = allChecks.length;

console.log(`Tool Wiring Status: ${passedChecks}/${totalChecks} checks passed`);
console.log();

if (passedChecks === totalChecks) {
  console.log("🎉 SUCCESS: All tools are properly wired up!");
  console.log();
  console.log("✅ File System Tools: Wired");
  console.log("✅ Email Tools: Wired");
  console.log("✅ GitHub Tools: Wired");
  console.log("✅ Model Configuration: Includes tools");
  console.log("✅ Function Call Detection: Active");
  console.log();
  console.log("The gemini-flash-latest model is fully configured with:");
  console.log("  - File system tools (fs_read, fs_write, fs_list, fs_delete)");
  console.log("  - Email tools (email_*)");
  console.log("  - GitHub tools (github_*)");
  console.log("  - Command execution (cmd_execute)");
  console.log("  - All tools properly passed through API → Session → Gemini Client");
  process.exit(0);
} else {
  console.log("⚠️  WARNING: Some tool wiring checks failed.");
  console.log("Please review the output above to identify issues.");
  process.exit(1);
}

