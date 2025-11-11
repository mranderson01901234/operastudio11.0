"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LinkWithFavicon } from "./link-with-favicon";
import { YouTubeVideoCard } from "./youtube-video-card";
import { SearchAnswer } from "@/components/search/search-answer";
import type { SearchResultMetadata } from "@/lib/search/search-result-types";
import { normalizeToAnswerPayload } from "@/lib/search/normalize-answer-payload";

interface MessageContentProps {
  content: string;
  className?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Extract URLs from text and replace with LinkWithFavicon components
 */
function processUrls(text: string): React.ReactNode[] {
  // URL regex pattern
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before URL
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add URL as LinkWithFavicon
    const url = match[0];
    parts.push(<LinkWithFavicon key={match.index} url={url} />);

    lastIndex = match.index + url.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Pre-process content to convert plain URLs to markdown links and add dividers
 */
function preprocessUrls(content: string): string {
  // First, handle URLs in code blocks (backticks) like `https://...`
  const codeBlockUrlPattern = /`(https?:\/\/[^\s`]+)`/g;
  content = content.replace(codeBlockUrlPattern, (match, url) => {
    return `[${extractCompanyName(url)}](${url})`;
  });
  
  // Then handle plain URLs that aren't already in markdown links
  // Match URLs that appear after whitespace, newlines, or at start of line
  // But skip if they're already part of a markdown link [text](url)
  const plainUrlPattern = /(https?:\/\/[^\s\)]+)/g;
  let lastIndex = 0;
  let result = '';
  
  let match;
  while ((match = plainUrlPattern.exec(content)) !== null) {
    const beforeMatch = content.substring(lastIndex, match.index);
    result += beforeMatch;
    
    // Check if this URL is already part of a markdown link
    const beforeUrl = content.substring(0, match.index);
    const isInMarkdownLink = beforeUrl.match(/\]\([^)]*$/);
    
    if (!isInMarkdownLink) {
      // Convert to markdown link with company name
      result += `[${extractCompanyName(match[0])}](${match[0]})`;
    } else {
      // Keep as-is if already in a markdown link
      result += match[0];
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining content
  result += content.substring(lastIndex);
  
  // Add horizontal dividers before sections that start with common patterns
  // Add divider before "You can explore", "Here are", "For more", etc.
  result = result.replace(/\n\n(You can explore|Here are|For more|To learn more|Additional|More information)/gi, '\n\n---\n\n$1');
  
  // Add divider after welcome messages
  result = result.replace(/(Welcome to [^.]+\.[\s\n]+)/gi, '$1\n---\n\n');
  
  return result;
}

/**
 * Check if URL is a YouTube video
 */
function isYouTubeVideo(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be/.test(url);
}

/**
 * Extract title and description from markdown link text
 * Format: [Title](url) - Description or [Title - Description](url)
 */
function parseLinkText(linkText: string): { title: string; description?: string } {
  if (!linkText) return { title: "" };
  
  // Check for "Title - Description" format
  const dashMatch = linkText.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch) {
    return {
      title: dashMatch[1].trim(),
      description: dashMatch[2].trim(),
    };
  }
  
  return { title: linkText.trim() };
}

/**
 * Extract company name from URL for display
 */
function extractCompanyName(url: string): string {
  try {
    const urlObj = new URL(url);
    let domain = urlObj.hostname.replace(/^www\./, "");
    const parts = domain.split(".");
    
    if (parts.length >= 2) {
      const name = parts[parts.length - 2].toLowerCase();
      
      const brandMap: Record<string, string> = {
        "reuters": "Reuters",
        "google": "Google",
        "sciencedaily": "ScienceDaily",
        "github": "GitHub",
        "twitter": "Twitter",
        "facebook": "Facebook",
        "linkedin": "LinkedIn",
        "youtube": "YouTube",
        "reddit": "Reddit",
        "medium": "Medium",
        "stackoverflow": "Stack Overflow",
        "wikipedia": "Wikipedia",
      };
      
      if (brandMap[name]) {
        return brandMap[name];
      }
      
      // Capitalize first letter
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
    }
    return domain;
  } catch {
    return url;
  }
}

/**
 * Component to render message content with clickable links and favicons
 */
export function MessageContent({ content, className = "", metadata }: MessageContentProps) {
  // Check if this message has search results metadata
  const searchResults = metadata?.searchResults as SearchResultMetadata | undefined;

  // Debug logging disabled to reduce console noise
  // Only log in development mode and only for significant events
  if (metadata && process.env.NODE_ENV === "development") {
    const hasMeaningfulData = Object.keys(metadata).some(key => {
      const value = metadata[key];
      return value !== undefined && value !== null && 
             (key !== "thinking" || (typeof value === "string" && value.trim().length > 0 && value !== "Processing tool result..."));
    });
    
    // Only process significant metadata changes, not routine processing messages
    if (hasMeaningfulData && metadata.thinking !== "Processing tool result...") {
      // Metadata processed
    }
  }

  // Pre-process content to convert plain URLs to markdown links
  const processedContent = preprocessUrls(content);
  
  // Render search results UI if available
  if (searchResults) {
    // Normalize SearchResultMetadata to SearchAnswerPayload for the structured Answer/Watch/Listen view
    const answerPayload = normalizeToAnswerPayload(searchResults, content);
    
    return (
      <div className={`${className} message-content min-w-0 w-full`}>
        <SearchAnswer payload={answerPayload} />
      </div>
    );
  }
  
  // Use ReactMarkdown to handle markdown formatting, but customize link rendering
  return (
    <div className={`${className} message-content min-w-0 w-full`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom link component - renders links with favicons or YouTube cards
          a: ({ node, href, children, ...props }) => {
            if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
              // Check if it's a YouTube video
              if (isYouTubeVideo(href)) {
                const linkText = children && React.Children.count(children) > 0 
                  ? String(children).trim()
                  : "";
                const { title, description } = parseLinkText(linkText);
                
                // Always render YouTube videos as cards
                // Extract relevance from the next sibling text node if available
                let relevance: string | undefined;
                
                // Try to find relevance in the next text node or paragraph
                const nodeWithParent = node as any;
                if (nodeWithParent?.parent) {
                  const siblings = (nodeWithParent.parent as any).children || [];
                  const linkIndex = siblings.findIndex((s: any) => s === node);
                  
                  if (linkIndex >= 0 && linkIndex < siblings.length - 1) {
                    // Check next sibling for relevance text
                    const nextSibling = siblings[linkIndex + 1];
                    if (nextSibling) {
                      let textContent = '';
                      
                      if (nextSibling.type === 'text') {
                        textContent = nextSibling.value || '';
                      } else if (nextSibling.type === 'paragraph' && nextSibling.children) {
                        textContent = nextSibling.children
                          .filter((c: any) => c.type === 'text')
                          .map((c: any) => c.value || '')
                          .join(' ');
                      }
                      
                      // Look for relevance patterns
                      const relevanceMatch = textContent.match(/why.*?relevant[:\s]+(.+?)(?:\.|$|Why|why)/i);
                      if (relevanceMatch) {
                        relevance = relevanceMatch[1].trim();
                      }
                    }
                  }
                }
                
                return (
                  <div className="my-3">
                    <YouTubeVideoCard
                      url={href}
                      title={title || undefined}
                      description={description}
                      relevance={relevance}
                    />
                  </div>
                );
              }
              
              // Regular link - use LinkWithFavicon
              const linkText = children && React.Children.count(children) > 0 
                ? String(children).trim()
                : undefined;
              return (
                <LinkWithFavicon url={href}>
                  {linkText}
                </LinkWithFavicon>
              );
            }
            // Fallback for non-HTTP links
            return (
              <a 
                href={href} 
                {...props} 
                style={{ color: "rgb(59 130 246)" }}
                className="hover:underline"
              >
                {children}
              </a>
            );
          },
          // Keep other markdown elements simple with reduced spacing
          p: ({ children, node }) => {
            // Check if paragraph is inside a list item
            const nodeWithParent = node as any;
            const isInListItem = nodeWithParent?.parent?.type === 'listItem';
            return (
              <p 
                className={isInListItem ? "" : "mb-1 last:mb-0"}
                style={isInListItem ? { marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 } : undefined}
              >
                {children}
              </p>
            );
          },
          ul: ({ children }) => (
            <ul
              className="list-disc list-inside mb-0"
              style={{
                marginTop: 0,
                marginBottom: 0,
                paddingTop: 0,
                paddingBottom: 0,
                lineHeight: '1.2'
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className="list-decimal list-inside mb-0"
              style={{
                marginTop: 0,
                marginBottom: 0,
                paddingTop: 0,
                paddingBottom: 0,
                lineHeight: '1.2'
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li
              className="leading-tight"
              style={{
                marginTop: 0,
                marginBottom: 0,
                paddingTop: 0,
                paddingBottom: 0,
                lineHeight: '1.2'
              }}
            >
              {children}
            </li>
          ),
          hr: () => <hr className="my-1.5 border-t border-border opacity-50" />,
          // COMMENTED OUT: Custom heading font sizes
          // h1: ({ children }) => <h1 className="text-2xl font-bold mt-2 mb-1.5 text-foreground">{children}</h1>,
          // h2: ({ children }) => <h2 className="text-2xl font-bold mt-3 mb-2 text-foreground">{children}</h2>,
          // h3: ({ children }) => <h3 className="text-lg font-semibold mt-2 mb-1 text-foreground">{children}</h3>,
          
          // LARGE, BOLD headings for sections with better visual hierarchy
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground border-b-2 border-primary/30 pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => {
            // Make ALL h2 headers large and bold
            return (
              <h2 className="text-4xl font-extrabold mt-6 mb-3 text-foreground">
                {children}
              </h2>
            );
          },
          h3: ({ children }) => (
            <h3 className="text-xl font-bold mt-6 mb-2 pt-4 text-foreground flex items-center gap-2 border-t-2 border-border/40">
              <span className="inline-block w-1 h-6 bg-primary/60 rounded"></span>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-lg font-semibold mt-5 mb-2 pt-3 text-foreground/90 border-t border-border/30">
              {children}
            </h4>
          ),
          strong: ({ children, node }) => {
            const text = String(children).trim();

            // Check if this looks like a file or property name
            const hasExtension = /\.[a-zA-Z0-9]+$/.test(text);
            const isProperty = text.endsWith(':') || /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(text); // Like "Property Name"
            const isShort = text.length > 0 && text.length < 100;
            const looksLikeIdentifier = /^[a-zA-Z0-9_\-\.\/\\\s]+$/.test(text);

            // Enhanced styling for file names and property labels
            if ((hasExtension || isProperty) && isShort && looksLikeIdentifier) {
              return (
                <strong className="font-extrabold text-base text-foreground">
                  {children}
                </strong>
              );
            }

            // Default bold text
            return <strong className="font-bold text-foreground">{children}</strong>;
          },
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => {
            const codeText = String(children);
            // Check if it's a URL
            if (codeText.match(/^https?:\/\//)) {
              return (
                <LinkWithFavicon url={codeText} className="!inline-flex" />
              );
            }
            // Check if it looks like a file path or folder
            const isPath = codeText.match(/[\/\\]/) || codeText.includes('.');

            return (
              <code
                className={`${
                  isPath
                    ? 'bg-primary/20 border-primary/40 px-2.5 py-1 rounded-md text-base font-bold font-mono text-foreground shadow-sm'
                    : 'bg-muted/80 px-2 py-0.5 rounded text-sm font-mono text-foreground border border-border/30'
                }`}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            // Extract text content to check length
            const textContent = React.Children.toArray(children)
              .map(child => {
                if (typeof child === 'string') return child;
                if (React.isValidElement(child) && child.props.children) {
                  return String(child.props.children);
                }
                return '';
              })
              .join('');

            // For long command output (>500 chars), use fixed height with scroll
            const isLongOutput = textContent.length > 500;

            return (
              <pre
                className={`bg-muted/50 text-foreground p-4 rounded-lg overflow-x-auto mb-3 font-mono text-sm border border-border/40 ${
                  isLongOutput ? 'max-h-80 overflow-y-auto' : ''
                }`}
                style={isLongOutput ? {
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(var(--primary), 0.3) transparent'
                } : undefined}
              >
                {children}
              </pre>
            );
          },
          // Table components with beautiful styling
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-border/40 bg-muted/20 shadow-sm">
              <table className="w-full border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gradient-to-b from-muted/60 to-muted/40 border-b-2 border-primary/30">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/30 bg-background/40">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="transition-all duration-150 hover:bg-muted/50 hover:shadow-sm">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-5 py-3.5 text-left text-xs font-bold text-foreground/90 uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-5 py-3.5 text-sm text-foreground/90 align-top">
              {children}
            </td>
          ),
          // Blockquote styling
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/50 pl-4 py-2 my-3 italic text-foreground/80 bg-muted/20 rounded-r">
              {children}
            </blockquote>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

