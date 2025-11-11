/**
 * Utility functions to detect repository and file references in chat messages.
 * This enables auto-populating the sidebar and opening files when mentioned in chat.
 */

export interface DetectedRepository {
  owner: string;
  repo: string;
  fullName: string; // owner/repo
}

export interface DetectedFile {
  path: string;
  isGitHub: boolean;
  owner?: string;
  repo?: string;
  filePath?: string; // Path within repo (for GitHub files)
}

/**
 * Detects GitHub repository references in text.
 * Matches patterns like:
 * - "owner/repo"
 * - "github.com/owner/repo"
 * - "https://github.com/owner/repo"
 * - "the owner/repo repository"
 */
export function detectRepositoryReferences(text: string): DetectedRepository[] {
  const repositories: DetectedRepository[] = [];
  const seen = new Set<string>();

  // Pattern 1: owner/repo (most common)
  // Matches: "user/repo", "owner/project-name", etc.
  // Excludes common false positives like "path/to/file", "version/1.0", etc.
  const ownerRepoPattern = /\b([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,100})\b/g;
  
  // Pattern 2: github.com/owner/repo or https://github.com/owner/repo
  const githubUrlPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,100})(?:\/|$|\.git|#|\?)/g;

  // Extract from owner/repo pattern
  let match;
  while ((match = ownerRepoPattern.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const fullName = `${owner}/${repo}`;
    
    // Skip if it looks like a file path (has common file extensions or path-like structure)
    if (repo.includes('.') && !repo.match(/^[a-zA-Z0-9-]+$/)) {
      continue;
    }
    
    // Skip common false positives
    if (repo.match(/^(v?\d+\.\d+|main|master|dev|develop|staging|production)$/i)) {
      continue;
    }
    
    if (!seen.has(fullName)) {
      seen.add(fullName);
      repositories.push({ owner, repo, fullName });
    }
  }

  // Extract from GitHub URLs
  while ((match = githubUrlPattern.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const fullName = `${owner}/${repo}`;
    
    if (!seen.has(fullName)) {
      seen.add(fullName);
      repositories.push({ owner, repo, fullName });
    }
  }

  return repositories;
}

/**
 * Detects file references in text.
 * Matches patterns like:
 * - "path/to/file.ts"
 * - "README.md"
 * - "owner/repo/path/to/file.ts" (GitHub file)
 * - "github.com/owner/repo/blob/main/path/to/file.ts"
 */
export function detectFileReferences(text: string): DetectedFile[] {
  const files: DetectedFile[] = [];
  const seen = new Set<string>();

  // Pattern 1: GitHub file URLs
  // Matches: github.com/owner/repo/blob/branch/path/to/file
  const githubFileUrlPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,100})\/(?:blob|tree)\/[^\s\/]+?\/(.+?)(?:\s|$|#|\?|\)|,|\.)/g;
  
  let match;
  while ((match = githubFileUrlPattern.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const filePath = match[3].trim();
    
    // Clean up file path (remove trailing punctuation)
    const cleanPath = filePath.replace(/[.,;:!?]+$/, '');
    
    if (cleanPath && !seen.has(`github://${owner}/${repo}/${cleanPath}`)) {
      seen.add(`github://${owner}/${repo}/${cleanPath}`);
      files.push({
        path: `github://${owner}/${repo}/${cleanPath}`,
        isGitHub: true,
        owner,
        repo,
        filePath: cleanPath,
      });
    }
  }

  // Pattern 2: owner/repo/path/to/file (GitHub file reference)
  // This is more lenient - matches owner/repo followed by what looks like a file path
  const githubFilePattern = /\b([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,100})\/([^\s]+\.(?:ts|tsx|js|jsx|py|java|cpp|c|h|hpp|go|rs|rb|php|swift|kt|scala|r|lua|pl|vue|svelte|md|json|yaml|yml|xml|html|css|scss|sass|sql|sh|bash|zsh|dockerfile|txt|log|conf|config|ini|toml|lock|lockfile|package|lock\.json|package\.json|tsconfig|jsconfig|gitignore|dockerignore|env|example|sample|test|spec|spec\.ts|spec\.js|test\.ts|test\.js|e2e|e2e\.ts|e2e\.js))\b/gi;
  
  while ((match = githubFilePattern.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const filePath = match[3];
    
    // Skip if it's just owner/repo without a file path
    if (!filePath || filePath.split('/').length < 2) {
      continue;
    }
    
    const fullPath = `github://${owner}/${repo}/${filePath}`;
    if (!seen.has(fullPath)) {
      seen.add(fullPath);
      files.push({
        path: fullPath,
        isGitHub: true,
        owner,
        repo,
        filePath,
      });
    }
  }

  // Pattern 3: Local file paths (absolute or relative)
  // Matches: /path/to/file.ts, ~/path/to/file.ts, ./path/to/file.ts, path/to/file.ts
  const localFilePattern = /(?:^|\s)(?:(?:\/|~\/|\.\/)?[^\s]+?\/)?([^\s\/]+\.(?:ts|tsx|js|jsx|py|java|cpp|c|h|hpp|go|rs|rb|php|swift|kt|scala|r|lua|pl|vue|svelte|md|json|yaml|yml|xml|html|css|scss|sass|sql|sh|bash|zsh|dockerfile|txt|log|conf|config|ini|toml|lock|lockfile|package|lock\.json|package\.json|tsconfig|jsconfig|gitignore|dockerignore|env|example|sample|test|spec|spec\.ts|spec\.js|test\.ts|test\.js|e2e|e2e\.ts|e2e\.js))\b/gi;
  
  while ((match = localFilePattern.exec(text)) !== null) {
    const filePath = match[0].trim();
    
    // Skip if it's a GitHub URL (already handled)
    if (filePath.includes('github.com')) {
      continue;
    }
    
    // Skip if it's already detected as a GitHub file
    if (filePath.match(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\//)) {
      continue;
    }
    
    if (!seen.has(filePath)) {
      seen.add(filePath);
      files.push({
        path: filePath,
        isGitHub: false,
      });
    }
  }

  return files;
}

/**
 * Detects if a message is asking to view/see/open/show a file.
 * Returns true if the message contains file-viewing intent.
 */
export function isFileViewRequest(text: string): boolean {
  const lowerText = text.toLowerCase();
  const viewKeywords = [
    'show me',
    'show the',
    'display',
    'open',
    'view',
    'see',
    'look at',
    'check',
    'read',
    'get',
    'fetch',
    'load',
  ];
  
  return viewKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Detects if a message is asking about a repository.
 * Returns true if the message contains repository-related intent.
 */
export function isRepositoryRequest(text: string): boolean {
  const lowerText = text.toLowerCase();
  const repoKeywords = [
    'repository',
    'repo',
    'repository',
    'github repo',
    'github repository',
    'show repo',
    'show repository',
    'open repo',
    'open repository',
    'view repo',
    'view repository',
    'browse repo',
    'browse repository',
  ];
  
  return repoKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Detects if a message is asking to work with GitHub or view repositories.
 * More comprehensive than isRepositoryRequest - catches phrases like "work on github", "show my repos", etc.
 */
export function isGitHubViewRequest(text: string): boolean {
  const lowerText = text.toLowerCase();
  const githubKeywords = [
    'github',
    'repositories',
    'repos',
    'repository',
    'repo',
    'my repos',
    'my repositories',
    'show repos',
    'show repositories',
    'list repos',
    'list repositories',
    'browse repos',
    'browse repositories',
    'work on github',
    'work with github',
    'open github',
    'view github',
    'check github',
    'see github',
    'look at github',
    'github repos',
    'github repositories',
  ];
  
  return githubKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Detects if a message is asking to VIEW emails (not send).
 * Returns true if the message contains email viewing intent.
 * Distinguishes between viewing emails vs sending emails.
 */
export function isEmailViewRequest(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Keywords that indicate viewing emails (not sending)
  const viewKeywords = [
    'show me my emails',
    'show my emails',
    'show emails',
    'display emails',
    'view emails',
    'view my emails',
    'see emails',
    'see my emails',
    'check emails',
    'check my emails',
    'list emails',
    'list my emails',
    'open emails',
    'open my emails',
    'browse emails',
    'browse my emails',
    'read emails',
    'read my emails',
    'look at emails',
    'look at my emails',
    'get emails',
    'fetch emails',
    'load emails',
    'email inbox',
    'my inbox',
    'inbox',
    'email list',
    'my email list',
  ];
  
  // Keywords that indicate sending emails (should NOT trigger view)
  const sendKeywords = [
    'send email',
    'send an email',
    'send a email',
    'compose email',
    'write email',
    'write an email',
    'draft email',
    'email to',
    'email someone',
    'reply to',
    'reply',
    'respond to',
    'respond',
  ];
  
  // Check if it's a send request first - if so, don't trigger view
  const isSendRequest = sendKeywords.some(keyword => lowerText.includes(keyword));
  if (isSendRequest) {
    return false;
  }
  
  // Check if it's a view request
  return viewKeywords.some(keyword => lowerText.includes(keyword));
}

