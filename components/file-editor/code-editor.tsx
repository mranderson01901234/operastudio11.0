"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { editor } from "monaco-editor";
import { useFileEditor } from "@/contexts/file-editor-context";
import { cn } from "@/lib/utils";
import { calculateFileDiff, type ChangeBlock } from "@/lib/file-editor/diff-calculator";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

// Lazy load Monaco Editor to reduce initial bundle size (~50MB)
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1a1a1a]">
      <div className="text-sm text-muted-foreground">Loading editor...</div>
    </div>
  ),
});

interface CodeEditorProps {
  filePath: string | null;
  className?: string;
}

// Define theme once when module loads
let themeDefined = false;

function defineOperaStudioDarkTheme(monaco: typeof import("monaco-editor")) {
  if (themeDefined) return;
  
  monaco.editor.defineTheme("operastudio-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      // Keywords (function, const, let, if, etc.)
      { token: "keyword", foreground: "C586C0", fontStyle: "bold" },
      { token: "keyword.control", foreground: "C586C0" },
      { token: "keyword.operator", foreground: "C586C0" },
      { token: "keyword.other", foreground: "C586C0" },
      
      // Types (string, number, etc.)
      { token: "type", foreground: "4EC9B0" },
      { token: "type.identifier", foreground: "4EC9B0" },
      
      // Strings
      { token: "string", foreground: "CE9178" },
      { token: "string.quoted", foreground: "CE9178" },
      
      // Numbers
      { token: "number", foreground: "B5CEA8" },
      
      // Comments
      { token: "comment", foreground: "6A9955", fontStyle: "italic" },
      { token: "comment.line", foreground: "6A9955", fontStyle: "italic" },
      { token: "comment.block", foreground: "6A9955", fontStyle: "italic" },
      
      // Variables and identifiers
      { token: "identifier", foreground: "D4D4D4" },
      { token: "variable", foreground: "9CDCFE" },
      { token: "variable.name", foreground: "9CDCFE" },
      
      // Functions
      { token: "function", foreground: "DCDCAA" },
      { token: "function.name", foreground: "DCDCAA" },
      
      // Operators
      { token: "operator", foreground: "D4D4D4" },
      
      // Punctuation
      { token: "delimiter", foreground: "D4D4D4" },
      { token: "delimiter.bracket", foreground: "D4D4D4" },
      
      // Properties
      { token: "property", foreground: "9CDCFE" },
      
      // Classes
      { token: "class", foreground: "4EC9B0" },
      { token: "class.name", foreground: "4EC9B0" },
      
      // Interfaces
      { token: "interface", foreground: "4EC9B0" },
      { token: "interface.name", foreground: "4EC9B0" },
      
      // Decorators
      { token: "decorator", foreground: "DCDCAA" },
      
      // Regex
      { token: "regexp", foreground: "D16969" },
    ],
    colors: {
      // Editor background and foreground
      "editor.background": "#1a1a1a",
      "editor.foreground": "#d4d4d4",
      
      // Line numbers
      "editorLineNumber.foreground": "#858585",
      "editorLineNumber.activeForeground": "#c6c6c6",
      
      // Selection
      "editor.selectionBackground": "#264f78",
      "editor.selectionHighlightBackground": "#264f78",
      "editor.inactiveSelectionBackground": "#3a3d41",
      
      // Current line
      "editor.lineHighlightBackground": "#2a2d2e",
      "editor.lineHighlightBorder": "#2a2d2e",
      
      // Cursor
      "editorCursor.foreground": "#aeafad",
      "editorCursor.background": "#1a1a1a",
      
      // Find match
      "editor.findMatchBackground": "#515c6a",
      "editor.findMatchHighlightBackground": "#ea5c0055",
      
      // Bracket matching
      "editorBracketMatch.background": "#0064001a",
      "editorBracketMatch.border": "#888888",
      
      // Indent guides
      "editorIndentGuide.background": "#404040",
      "editorIndentGuide.activeBackground": "#707070",
      
      // Scrollbar
      "scrollbar.shadow": "#000000",
      "scrollbarSlider.background": "#42424280",
      "scrollbarSlider.hoverBackground": "#4e4e4e80",
      "scrollbarSlider.activeBackground": "#65656580",
      
      // Minimap
      "minimap.background": "#1a1a1a",
      "minimap.selectionHighlight": "#264f78",
      "minimap.findMatchHighlight": "#d18616",
      
      // Widgets
      "editorWidget.background": "#252526",
      "editorWidget.border": "#454545",
      
      // Suggest widget
      "editorSuggestWidget.background": "#252526",
      "editorSuggestWidget.border": "#454545",
      "editorSuggestWidget.foreground": "#cccccc",
      "editorSuggestWidget.selectedBackground": "#2a2d2e",
      
      // Hover
      "editorHoverWidget.background": "#252526",
      "editorHoverWidget.border": "#454545",
      
      // Error and warning
      "editorError.foreground": "#f48771",
      "editorWarning.foreground": "#cca700",
      "editorInfo.foreground": "#75beff",
      
      // Gutter
      "editorGutter.background": "#1a1a1a",
      "editorGutter.modifiedBackground": "#1b81a8",
      "editorGutter.addedBackground": "#629755",
      "editorGutter.deletedBackground": "#c74e39",
      
      // Diff
      "diffEditor.insertedTextBackground": "#9bb95533",
      "diffEditor.removedTextBackground": "#ff000033",
      
      // Overview ruler
      "editorOverviewRuler.border": "#7f7f7f4d",
      "editorOverviewRuler.currentContentForeground": "#a8a8a8",
      "editorOverviewRuler.incomingContentForeground": "#a8a8a8",
      "editorOverviewRuler.commonContentForeground": "#a8a8a8",
    },
  });
  
  themeDefined = true;
}

export function CodeEditor({ filePath, className }: CodeEditorProps) {
  const { state, updateFileContent, acceptChangeBlock, rejectChangeBlock, acceptAllChanges } = useFileEditor();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const widgetsRef = useRef<editor.IContentWidget[]>([]);
  const [changeBlocks, setChangeBlocks] = useState<ChangeBlock[]>([]);
  const [showKeepAll, setShowKeepAll] = useState(false);

  const file = filePath ? state.openFiles.get(filePath) : null;

  // Define theme before editor mounts - this ensures theme is ready before render
  const handleEditorWillMount = (monaco: typeof import("monaco-editor")) => {
    defineOperaStudioDarkTheme(monaco);
    monaco.editor.setTheme("operastudio-dark");
  };

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    // Ensure theme is applied after mount as well
    import("monaco-editor").then((monaco) => {
      defineOperaStudioDarkTheme(monaco);
      monaco.editor.setTheme("operastudio-dark");
    });
  };

  // Calculate change blocks and apply decorations
  useEffect(() => {
    if (!editorRef.current || !file || !file.pendingEdit) {
      setChangeBlocks([]);
      setShowKeepAll(false);
      return;
    }

    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    const originalContent = file.originalContent || file.content;
    const proposedContent = file.pendingEdit.proposedContent;
    
    // Calculate change blocks
    const diff = calculateFileDiff(originalContent, proposedContent);
    setChangeBlocks(diff.changeBlocks);
    setShowKeepAll(diff.changeBlocks.length > 0);

    let decorationIds: string[] = [];
    const acceptedBlocks = file.pendingEdit.acceptedBlocks || new Set();
    const rejectedBlocks = file.pendingEdit.rejectedBlocks || new Set();

    // Clean up previous widgets
    widgetsRef.current.forEach((widget) => {
      try {
        editor.removeContentWidget(widget);
      } catch {
        // Widget might not exist, ignore
      }
    });
    widgetsRef.current = [];

    import("monaco-editor").then((monaco) => {
      const decorations: editor.IModelDeltaDecoration[] = [];
      const proposedLines = proposedContent.split("\n");
      
      // Map change blocks to proposed content line numbers
      const { diffLines } = require("diff");
      const lineChanges = diffLines(originalContent, proposedContent);
      const blockToProposedLines = new Map<string, number[]>();
      
      let proposedLineNum = 1;
      let blockIndex = 0;
      
      // Iterate through diff changes and map to proposed content lines
      for (let i = 0; i < lineChanges.length; i++) {
        const change = lineChanges[i];
        const lines = change.value.split("\n");
        const nonEmptyLines = lines.filter((l: string) => l !== "");
        
        if (change.removed && !change.added) {
          // Check if next change is added (making this a modification)
          const nextChange = lineChanges[i + 1];
          if (nextChange?.added) {
            // Modified block
            const modifiedBlock = diff.changeBlocks[blockIndex];
            if (modifiedBlock && modifiedBlock.type === "modified") {
              const addedLines = nextChange.value.split("\n").filter((l: string) => l !== "");
              const lineNums: number[] = [];
              for (let j = 0; j < addedLines.length; j++) {
                lineNums.push(proposedLineNum + j);
              }
              blockToProposedLines.set(modifiedBlock.id, lineNums);
              proposedLineNum += addedLines.length;
              blockIndex++;
              i++; // Skip next change as we processed it
            }
          } else {
            // Standalone removed - doesn't exist in proposed content
            const removedBlock = diff.changeBlocks[blockIndex];
            if (removedBlock && removedBlock.type === "removed") {
              blockIndex++;
            }
          }
        } else if (change.added && !change.removed) {
          // Standalone added block
          const addedBlock = diff.changeBlocks[blockIndex];
          if (addedBlock && addedBlock.type === "added") {
            const lineNums: number[] = [];
            for (let j = 0; j < nonEmptyLines.length; j++) {
              lineNums.push(proposedLineNum + j);
            }
            blockToProposedLines.set(addedBlock.id, lineNums);
            proposedLineNum += nonEmptyLines.length;
            blockIndex++;
          } else {
            proposedLineNum += nonEmptyLines.length;
          }
        } else if (!change.removed && !change.added) {
          // Unchanged lines
          proposedLineNum += nonEmptyLines.length;
        }
      }
      
      // Apply decorations and widgets
      diff.changeBlocks.forEach((block) => {
        const isAccepted = acceptedBlocks.has(block.id);
        const isRejected = rejectedBlocks.has(block.id);
        const proposedLineNumbers = blockToProposedLines.get(block.id) || [];

        if (isRejected || block.type === "removed") {
          return;
        }

        // Highlight changed lines in proposed content
        if (proposedLineNumbers.length > 0) {
          proposedLineNumbers.forEach((lineNum) => {
            if (lineNum <= proposedLines.length) {
              decorations.push({
                range: new monaco.Range(lineNum, 1, lineNum, 1000),
                options: {
                  isWholeLine: true,
                  inlineClassName: isAccepted ? "monaco-diff-accepted" : "monaco-diff-added",
                  glyphMarginClassName: isAccepted ? "monaco-diff-accepted-glyph" : "monaco-diff-added-glyph",
                  marginClassName: isAccepted ? "monaco-diff-accepted-margin" : "monaco-diff-added-margin",
                  overviewRuler: {
                    color: isAccepted ? "#22c55e" : "#22c55e",
                    position: monaco.editor.OverviewRulerLane.Left,
                  },
                  inlineClassNameAffectsLetterSpacing: true,
                },
              });
            }
          });

          // Add inline Keep/Reject buttons for each line
          if (!isAccepted && !isRejected) {
            proposedLineNumbers.forEach((lineNum) => {
              if (lineNum <= proposedLines.length) {
                const widget: editor.IContentWidget = {
                  getId: () => `change-controls-${block.id}-line-${lineNum}`,
                  getDomNode: () => {
                    const container = document.createElement("div");
                    container.className = "inline-change-controls";
                    container.style.cssText = `
                      display: flex !important;
                      flex-direction: row !important;
                      flex-wrap: nowrap !important;
                      gap: 2px;
                      align-items: center;
                      position: absolute;
                      z-index: 1000;
                      background: transparent !important;
                      border: none !important;
                      padding: 0 !important;
                      margin: 0 !important;
                    `;

                    const keepBtn = document.createElement("button");
                    keepBtn.textContent = "Keep";
                    keepBtn.style.cssText = `
                      display: inline-flex !important;
                      align-items: center;
                      justify-content: center;
                      padding: 2px 6px;
                      background: rgba(34, 197, 94, 0.4) !important;
                      border: none !important;
                      border-radius: 2px;
                      cursor: pointer;
                      color: rgba(255, 255, 255, 0.9) !important;
                      font-size: 9px;
                      font-weight: 500;
                      transition: all 0.2s;
                      backdrop-filter: blur(4px);
                      flex-shrink: 0;
                      white-space: nowrap;
                      box-shadow: none !important;
                      outline: none !important;
                      height: 16px;
                      line-height: 1;
                    `;
                    keepBtn.onmouseenter = () => {
                      keepBtn.style.background = "rgba(34, 197, 94, 0.6) !important";
                    };
                    keepBtn.onmouseleave = () => {
                      keepBtn.style.background = "rgba(34, 197, 94, 0.4) !important";
                    };
                    keepBtn.onclick = (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (filePath) acceptChangeBlock(filePath, block.id);
                    };
                    keepBtn.title = "Keep this change";

                    const rejectBtn = document.createElement("button");
                    rejectBtn.textContent = "Reject";
                    rejectBtn.style.cssText = `
                      display: inline-flex !important;
                      align-items: center;
                      justify-content: center;
                      padding: 2px 6px;
                      background: rgba(239, 68, 68, 0.4) !important;
                      border: none !important;
                      border-radius: 2px;
                      cursor: pointer;
                      color: rgba(255, 255, 255, 0.9) !important;
                      font-size: 9px;
                      font-weight: 500;
                      transition: all 0.2s;
                      backdrop-filter: blur(4px);
                      flex-shrink: 0;
                      white-space: nowrap;
                      box-shadow: none !important;
                      outline: none !important;
                      height: 16px;
                      line-height: 1;
                    `;
                    rejectBtn.onmouseenter = () => {
                      rejectBtn.style.background = "rgba(239, 68, 68, 0.6) !important";
                    };
                    rejectBtn.onmouseleave = () => {
                      rejectBtn.style.background = "rgba(239, 68, 68, 0.4) !important";
                    };
                    rejectBtn.onclick = (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (filePath) rejectChangeBlock(filePath, block.id);
                    };
                    rejectBtn.title = "Reject this change";

                    container.appendChild(keepBtn);
                    container.appendChild(rejectBtn);

                    return container;
                  },
                  getPosition: () => {
                    // Position to the right of the line
                    const lineLength = proposedLines[lineNum - 1]?.length || 0;
                    return {
                      position: { lineNumber: lineNum, column: Math.max(lineLength + 1, 1) },
                      preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
                    };
                  },
                };

                editor.addContentWidget(widget);
                widgetsRef.current.push(widget);
              }
            });
          }
        }
      });

      // Apply decorations
      decorationIds = editor.deltaDecorations([], decorations);
    });

    // Cleanup function
    return () => {
      if (decorationIds.length > 0 && editorRef.current) {
        editorRef.current.deltaDecorations(decorationIds, []);
      }
      // Remove all content widgets
      widgetsRef.current.forEach((widget) => {
        try {
          if (editorRef.current) {
            editorRef.current.removeContentWidget(widget);
          }
        } catch {
          // Widget might not exist, ignore
        }
      });
      widgetsRef.current = [];
    };
  }, [file?.pendingEdit, file?.content, file?.originalContent, filePath, acceptChangeBlock, rejectChangeBlock]);

  const handleChange = (value: string | undefined) => {
    if (filePath && value !== undefined) {
      updateFileContent(filePath, value);
    }
  };

  if (!filePath || !file) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No file selected</p>
          <p className="text-xs mt-2">Click a file in the file tree to open it</p>
        </div>
      </div>
    );
  }

  const handleKeepAll = async () => {
    if (filePath) {
      await acceptAllChanges(filePath);
    }
  };

  // Show proposed content when there's a pending edit
  const displayContent = file?.pendingEdit ? file.pendingEdit.proposedContent : file?.content || "";

  return (
    <div className={cn(className, "bg-[#1a1a1a] relative")}>
      {showKeepAll && file?.pendingEdit && (
        <div className="absolute top-4 right-4 z-50">
          <Button
            onClick={handleKeepAll}
            size="lg"
            className="h-10 px-6 text-sm bg-green-600/90 hover:bg-green-600 text-white shadow-lg backdrop-blur-sm border border-green-500/30"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.9)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Check className="h-4 w-4 mr-2" />
            Keep All Changes
          </Button>
        </div>
      )}
      <Editor
        height="100%"
        language={file.language}
        value={displayContent}
        onChange={handleChange}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        theme="operastudio-dark"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
          lineNumbers: "on",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          readOnly: file.isStreaming, // Prevent edits during streaming
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          suggest: {
            enabled: true,
          },
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-[#1a1a1a]">
            <div className="text-sm text-muted-foreground">Loading editor...</div>
          </div>
        }
      />
    </div>
  );
}

