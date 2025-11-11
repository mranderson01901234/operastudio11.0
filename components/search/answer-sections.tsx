"use client";

import React from "react";
import { InlineSourceBadge } from "./inline-source-badge";
import type { SearchAnswerPayload } from "@/lib/search/search-result-types";

interface AnswerSectionsProps {
  sections: SearchAnswerPayload["sections"];
  sources: SearchAnswerPayload["sources"];
}

/**
 * Extract title from bullet text (text before colon or first sentence)
 */
function extractBulletTitle(text: string): { title: string; content: string } {
  // Try to find a colon separator (common pattern: "Title: Description")
  const colonIndex = text.indexOf(':');
  if (colonIndex > 0 && colonIndex < 100) {
    // Only use colon if it's early in the text (likely a title separator)
    const title = text.substring(0, colonIndex).trim();
    const content = text.substring(colonIndex + 1).trim();
    if (title.length > 0 && title.length < 80) {
      return { title, content };
    }
  }
  
  // Fallback: use first sentence as title if it's short enough
  const sentenceMatch = text.match(/^([^.!?]+[.!?])\s*(.+)$/);
  if (sentenceMatch) {
    const firstSentence = sentenceMatch[1].trim();
    const rest = sentenceMatch[2].trim();
    if (firstSentence.length > 0 && firstSentence.length < 100) {
      return { title: firstSentence, content: rest };
    }
  }
  
  // If no clear title found, use first 60 chars as title
  if (text.length > 60) {
    const title = text.substring(0, 60).trim() + '...';
    const content = text.substring(60).trim();
    return { title, content };
  }
  
  // Short text: use as title only
  return { title: text, content: '' };
}

/**
 * Renders sectioned content with headings, bullets, and inline citations
 */
export function AnswerSections({ sections, sources }: AnswerSectionsProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <section key={idx} className="space-y-1.5">
          {/* Section Heading */}
          <h2 className="text-lg font-semibold text-zinc-200 tracking-tight">
            {section.heading}
          </h2>
          
          {/* Section Summary */}
          {section.summary && section.summary.trim().length > 0 && (
            <p className="text-sm text-zinc-400 leading-relaxed mb-2">
              {section.summary}
            </p>
          )}
          
          {/* Bullet List */}
          <ul className="space-y-0">
            {section.bullets.map((bullet, bulletIdx) => {
              const { title, content } = extractBulletTitle(bullet.text);
              
              return (
                <li key={bulletIdx} className="space-y-1">
                  {/* Divider Line - before each bullet point */}
                  {bulletIdx > 0 && (
                    <hr className="border-t border-zinc-700/50 mb-2 mt-0" />
                  )}
                  
                  {/* Bullet Header */}
                  <h3 className="text-base sm:text-lg font-bold text-white leading-tight mb-1">
                    {title}
                  </h3>
                  
                  {/* Bullet Content */}
                  {content && (
                    <div className="flex items-start gap-2 text-zinc-300 leading-relaxed">
                      {/* Custom Bullet */}
                      <span className="text-zinc-500 mt-1 select-none flex-shrink-0">•</span>
                      
                      {/* Content */}
                      <div className="flex-1">
                        {/* Bullet Text */}
                        <RichText content={content} />
                        
                        {/* Inline Source Badge */}
                        {bullet.sourceIndex !== undefined && sources[bullet.sourceIndex] && (
                          <InlineSourceBadge source={sources[bullet.sourceIndex]} />
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* If no content (short bullet), show source badge directly */}
                  {!content && bullet.sourceIndex !== undefined && sources[bullet.sourceIndex] && (
                    <div className="mt-1">
                      <InlineSourceBadge source={sources[bullet.sourceIndex]} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Render text with basic HTML support (bold, italic, code)
 * For security, only allows whitelisted tags
 */
function RichText({ content }: { content: string }) {
  // Check if content contains HTML tags
  const hasHtml = /<[^>]*>/.test(content);
  
  if (!hasHtml) {
    return <span>{content}</span>;
  }
  
  // Simple sanitization: only allow basic formatting tags
  // In production, consider using DOMPurify
  const sanitized = content
    .replace(/<(?!\/?(?:strong|em|code|b|i)\b)[^>]*>/gi, '')
    .trim();
  
  return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
}

