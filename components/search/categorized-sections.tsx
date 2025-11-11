"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InlineSourceTag } from "./inline-source-tag";
import type { SearchResultItem } from "@/lib/search/search-result-types";

interface CategorizedSectionsProps {
  content: string; // LLM-generated markdown content
  results: SearchResultItem[];
}

/**
 * Parses LLM-generated markdown content and extracts categories
 * Renders categorized sections with inline source tags
 */
export function CategorizedSections({ content, results }: CategorizedSectionsProps) {
  // Parse markdown to extract categories and bullet points
  // Look for ## headings followed by bullet points
  const sections = parseCategorizedContent(content, results);

  if (sections.length === 0) {
    // Fallback: render content as-is with markdown
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div key={index} className="space-y-1">
          {/* Section Heading */}
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {section.title}
          </h3>

          {/* Bullet Points */}
          <ul className="space-y-1 list-none pl-0">
            {section.items.map((item, itemIndex) => {
              // Find matching source for this item
              const source = findSourceForText(item.text, results);

              return (
                <li key={itemIndex} className="flex items-start gap-2">
                  <span className="text-foreground mt-1.5">•</span>
                  <div className="flex-1">
                    <span className="text-foreground">{item.text}</span>
                    {source && (
                      <InlineSourceTag
                        hostname={source.hostname}
                        url={source.url}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface ParsedSection {
  title: string;
  items: Array<{ text: string; sources?: string[] }>;
}

/**
 * Parse markdown content to extract categorized sections
 * Handles both markdown headings (## Heading) and plain text headings
 */
function parseCategorizedContent(
  content: string,
  results: SearchResultItem[]
): ParsedSection[] {
  const sections: ParsedSection[] = [];

  // First, try to parse markdown headings (## or ###)
  const markdownHeadingRegex = /^(#{2,3})\s+(.+)$/gm;
  const markdownParts = content.split(markdownHeadingRegex);

  for (let i = 0; i < markdownParts.length; i += 3) {
    if (markdownParts[i + 1] && markdownParts[i + 2]) {
      const heading = markdownParts[i + 2].trim();
      const sectionContent = markdownParts[i + 3] || "";

      // Extract bullet points from section content
      const bulletRegex = /^[-*]\s+(.+)$/gm;
      const items: Array<{ text: string }> = [];
      let match;

      while ((match = bulletRegex.exec(sectionContent)) !== null) {
        items.push({ text: match[1].trim() });
      }

      if (items.length > 0) {
        sections.push({ title: heading, items });
      }
    }
  }

  // If no markdown sections found, try plain text headings
  if (sections.length === 0) {
    // Look for plain text headings: standalone lines followed by blank line and bullets
    const lines = content.split('\n');
    const plainTextSections: Array<{ title: string; startLine: number; endLine: number }> = [];
    
    // Find all potential plain text headings
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const lineAfterNext = i + 2 < lines.length ? lines[i + 2].trim() : '';
      
      // Detect plain text heading:
      // - Line is not empty and reasonable length (heading-like)
      // - Doesn't start with bullet, markdown heading, or number
      // - Previous line is empty or end of content (standalone)
      // - Next line is empty AND line after next starts with bullet
      //   OR next line directly starts with bullet
      const isStandalone = prevLine === '' || i === 0;
      const hasBulletsAfter = nextLine.match(/^[-*]/) || lineAfterNext.match(/^[-*]/);
      const isHeadingLike = 
        line.length > 0 &&
        line.length < 150 && // Reasonable heading length
        !line.match(/^[-*#\d]/) && // Not a bullet, markdown heading, or numbered list
        !line.match(/^https?:\/\//); // Not a URL
      
      if (isStandalone && isHeadingLike && hasBulletsAfter) {
        // Find where this section ends (next heading or end)
        let endLine = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          const checkLine = lines[j].trim();
          // Check if this is a new heading
          if (checkLine.length > 0 && 
              checkLine.length < 150 &&
              !checkLine.match(/^[-*#\d]/) &&
              !checkLine.match(/^https?:\/\//) &&
              (j === 0 || lines[j - 1].trim() === '')) {
            const checkNext = j + 1 < lines.length ? lines[j + 1].trim() : '';
            if (checkNext.match(/^[-*]/)) {
              endLine = j;
              break;
            }
          }
        }
        
        plainTextSections.push({ title: line, startLine: i, endLine });
      }
    }
    
    // Extract bullet points for each section
    plainTextSections.forEach((section) => {
      const sectionText = lines.slice(section.startLine + 1, section.endLine).join('\n');
      const bulletRegex = /^[-*]\s+(.+)$/gm;
      const items: Array<{ text: string }> = [];
      let bulletMatch;

      while ((bulletMatch = bulletRegex.exec(sectionText)) !== null) {
        items.push({ text: bulletMatch[1].trim() });
      }

      if (items.length > 0) {
        sections.push({ title: section.title, items });
      }
    });
  }

  // Fallback: If still no sections, try simple markdown heading detection
  if (sections.length === 0) {
    const simpleHeadingRegex = /^##\s+(.+)$/gm;
    const simpleMatches = Array.from(content.matchAll(simpleHeadingRegex));

    if (simpleMatches.length > 0) {
      simpleMatches.forEach((match, index) => {
        const title = match[1].trim();
        const startIndex = match.index! + match[0].length;
        const endIndex =
          index < simpleMatches.length - 1
            ? simpleMatches[index + 1].index!
            : content.length;
        const sectionText = content.substring(startIndex, endIndex);

        const bulletRegex = /^[-*]\s+(.+)$/gm;
        const items: Array<{ text: string }> = [];
        let bulletMatch;

        while ((bulletMatch = bulletRegex.exec(sectionText)) !== null) {
          items.push({ text: bulletMatch[1].trim() });
        }

        if (items.length > 0) {
          sections.push({ title, items });
        }
      });
    }
  }

  return sections;
}

/**
 * Find matching source for a text snippet
 * Looks for hostname mentions or URL patterns in the text
 */
function findSourceForText(
  text: string,
  results: SearchResultItem[]
): SearchResultItem | undefined {
  // Try to find hostname in text
  for (const result of results) {
    const hostname = result.hostname.replace(/^www\./, "");
    if (text.toLowerCase().includes(hostname.toLowerCase())) {
      return result;
    }
  }

  // Try to find URL in text
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urlMatch = text.match(urlRegex);
  if (urlMatch) {
    const url = urlMatch[0];
    return results.find((r) => r.url === url);
  }

  // Return first result as fallback
  return results[0];
}

