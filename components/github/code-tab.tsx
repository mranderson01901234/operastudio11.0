"use client";

import React, { useEffect, useState } from "react";
import { useGitHub } from "@/contexts/github-context";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { base64ToUtf8 } from "@/lib/utils/base64";

export function CodeTab() {
  const { state } = useGitHub();
  const { selectedRepository, repositoryDetails } = state;
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [loadingReadme, setLoadingReadme] = useState(false);

  useEffect(() => {
    if (!selectedRepository) return;

    const loadReadme = async () => {
      setLoadingReadme(true);
      try {
        // Double-encode repo name to handle dots (Next.js might treat dots as file extensions)
        const encodedOwner = encodeURIComponent(selectedRepository.owner);
        const encodedRepo = encodeURIComponent(encodeURIComponent(selectedRepository.repo));
        const response = await fetch(
          `/api/github/repo/${encodedOwner}/${encodedRepo}/file?path=README.md`
        );

        if (response.ok) {
          const data = await response.json();
          // Decode base64 content to UTF-8
          const content = base64ToUtf8(data.content);
          setReadmeContent(content);
        } else {
          // Try README.md, README.txt, README, etc.
          const readmeVariants = ["README.md", "README.txt", "README"];
          let found = false;

          // Re-encode for variants (already double-encoded above)
          for (const variant of readmeVariants) {
            try {
              const variantResponse = await fetch(
                `/api/github/repo/${encodedOwner}/${encodedRepo}/file?path=${variant}`
              );
              if (variantResponse.ok) {
                const variantData = await variantResponse.json();
                // Decode base64 content to UTF-8
                const content = base64ToUtf8(variantData.content);
                setReadmeContent(content);
                found = true;
                break;
              }
            } catch {
              // Continue to next variant
            }
          }

          if (!found) {
            setReadmeContent(null);
          }
        }
      } catch (error) {
        console.error("Error loading README:", error);
        setReadmeContent(null);
      } finally {
        setLoadingReadme(false);
      }
    };

    loadReadme();
  }, [selectedRepository]);

  if (loadingReadme) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!readmeContent) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No README found</p>
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeContent}</ReactMarkdown>
    </div>
  );
}

