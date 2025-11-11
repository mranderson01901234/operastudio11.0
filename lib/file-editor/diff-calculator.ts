/**
 * Utility functions for calculating and working with file diffs
 */

import { diffLines, Change } from "diff";

export interface DiffChange {
  type: "added" | "removed" | "unchanged";
  value: string;
  lineNumber?: number;
  count: number;
}

export interface ChangeBlock {
  id: string;
  type: "removed" | "added" | "modified";
  startLine: number;
  endLine: number;
  originalLines: string[];
  proposedLines: string[];
  originalContent: string;
  proposedContent: string;
}

export interface FileDiff {
  changes: DiffChange[];
  changeBlocks: ChangeBlock[];
  addedLines: number;
  removedLines: number;
  modifiedLines: number[];
}

/**
 * Calculate line-based diff between two file contents
 */
export function calculateFileDiff(
  originalContent: string,
  newContent: string
): FileDiff {
  const changes = diffLines(originalContent, newContent);
  
  const diffChanges: DiffChange[] = [];
  const modifiedLines: number[] = [];
  let addedLines = 0;
  let removedLines = 0;
  let currentLine = 1;

  changes.forEach((change: Change) => {
    const lines = change.value.split("\n");
    // Remove empty line at end if present (diffLines includes trailing newline)
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    if (change.added) {
      addedLines += lines.length;
      diffChanges.push({
        type: "added",
        value: change.value,
        lineNumber: currentLine,
        count: lines.length,
      });
      // Mark lines as modified (added)
      for (let i = 0; i < lines.length; i++) {
        modifiedLines.push(currentLine + i);
      }
      currentLine += lines.length;
    } else if (change.removed) {
      removedLines += lines.length;
      diffChanges.push({
        type: "removed",
        value: change.value,
        lineNumber: currentLine,
        count: lines.length,
      });
      // Mark lines as modified (removed)
      for (let i = 0; i < lines.length; i++) {
        modifiedLines.push(currentLine + i);
      }
      // Don't increment currentLine for removed lines
    } else {
      // Unchanged
      diffChanges.push({
        type: "unchanged",
        value: change.value,
        lineNumber: currentLine,
        count: lines.length,
      });
      currentLine += lines.length;
    }
  });

  // Group changes into blocks for granular review
  const changeBlocks: ChangeBlock[] = [];
  const originalLines = originalContent.split("\n");
  const newLines = newContent.split("\n");
  let originalLineNum = 1;
  let blockId = 0;

  // Process changes and group consecutive removed+added into modified blocks
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = change.value.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    if (change.removed) {
      // Check if next change is added (making this a modification)
      const nextChange = changes[i + 1];
      if (nextChange?.added) {
        // Modified block (removed + added)
        const addedLines = nextChange.value.split("\n");
        const addedLinesFiltered = addedLines.filter(l => l !== "");
        
        changeBlocks.push({
          id: `block-${blockId++}`,
          type: "modified",
          startLine: originalLineNum,
          endLine: originalLineNum + lines.length - 1,
          originalLines: lines,
          proposedLines: addedLinesFiltered,
          originalContent: change.value,
          proposedContent: nextChange.value,
        });
        
        // Skip the next added change since we processed it
        i++;
        // Don't advance originalLineNum for removed lines
      } else {
        // Standalone removed block
        changeBlocks.push({
          id: `block-${blockId++}`,
          type: "removed",
          startLine: originalLineNum,
          endLine: originalLineNum + lines.length - 1,
          originalLines: lines,
          proposedLines: [],
          originalContent: change.value,
          proposedContent: "",
        });
        // Don't advance originalLineNum for removed lines
      }
    } else if (change.added) {
      // Standalone addition
      const addedLines = lines;
      changeBlocks.push({
        id: `block-${blockId++}`,
        type: "added",
        startLine: originalLineNum, // Insertion point
        endLine: originalLineNum,
        originalLines: [],
        proposedLines: addedLines,
        originalContent: "",
        proposedContent: change.value,
      });
      // Don't advance originalLineNum for additions (they're inserted)
    } else {
      // Unchanged - advance line counter
      originalLineNum += lines.length;
    }
  }

  return {
    changes: diffChanges,
    changeBlocks,
    addedLines,
    removedLines,
    modifiedLines: [...new Set(modifiedLines)].sort((a, b) => a - b),
  };
}

/**
 * Get character-based ranges for diff highlighting in Monaco Editor
 * Returns ranges for the original content (what we're displaying)
 */
export interface DiffRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  type: "added" | "removed";
}

export function getDiffRanges(
  originalContent: string,
  newContent: string
): DiffRange[] {
  const diff = calculateFileDiff(originalContent, newContent);
  const ranges: DiffRange[] = [];
  
  const originalLines = originalContent.split("\n");
  let currentOriginalLine = 1;
  
  diff.changes.forEach((change) => {
    if (change.type === "removed") {
      // These lines exist in original and are removed
      const startLine = currentOriginalLine;
      const endLine = currentOriginalLine + change.count - 1;
      
      ranges.push({
        startLine,
        startColumn: 1,
        endLine,
        endColumn: originalLines[startLine - 1]?.length || 1,
        type: "removed",
      });
      
      // Don't increment currentOriginalLine for removed lines
    } else if (change.type === "added") {
      // These lines are added - we can't highlight them in original content
      // Instead, we'll show them as "would be added" markers
      // For now, skip them since we're showing original content
      // In a future enhancement, we could show them as insert markers
    } else {
      // Unchanged - advance line counter
      currentOriginalLine += change.count;
    }
  });
  
  return ranges;
}

/**
 * Format diff summary for display
 */
export function formatDiffSummary(diff: FileDiff): string {
  const parts: string[] = [];
  
  if (diff.addedLines > 0) {
    parts.push(`+${diff.addedLines} line${diff.addedLines !== 1 ? "s" : ""}`);
  }
  
  if (diff.removedLines > 0) {
    parts.push(`-${diff.removedLines} line${diff.removedLines !== 1 ? "s" : ""}`);
  }
  
  if (parts.length === 0) {
    return "No changes";
  }
  
  return parts.join(", ");
}

