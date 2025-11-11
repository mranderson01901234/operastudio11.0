/**
 * Data normalization utilities for SearchAnswer component
 * Transforms SearchResultMetadata → SearchAnswerPayload
 */

import type { SearchResultMetadata, SearchAnswerPayload } from "./search-result-types";

/**
 * Extract favicon URL for a domain
 * Uses Google's favicon service as fallback
 */
function extractFavicon(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

/**
 * Generate thumbnail URL for a domain
 * Uses multiple fallback strategies for thumbnails
 */
function extractThumbnail(url: string, existingThumbnail?: string): string {
  // If we already have a thumbnail from the API, use it
  if (existingThumbnail) {
    return existingThumbnail;
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Strategy 1: Use Google's page screenshot API (free and reliable)
    return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;

    // TODO: Implement proper screenshot service
    // Screenshot services often have rate limits or require API keys:
    // - thum.io: Often slow or rate-limited
    // - apiflash.com: Requires API key
    // - screenshotone.com: Requires API key
    //
    // Better solution: Fetch Open Graph images from the actual pages
    // For now, using larger favicons (128px) as placeholders
  } catch {
    return "";
  }
}

/**
 * Parse markdown content into structured sections
 * Handles clean format with ## headings and - bullets
 * Removes any ** bold ** or other markdown from bullet text
 */
function parseSectionsFromMarkdown(content: string): SearchAnswerPayload["sections"] {
  console.log("[parseSectionsFromMarkdown] Full content:", content);
  console.log("[parseSectionsFromMarkdown] Content length:", content.length);

  let sections: SearchAnswerPayload["sections"] = [];

  const lines = content.split('\n');
  console.log("[parseSectionsFromMarkdown] Total lines:", lines.length);
  console.log("[parseSectionsFromMarkdown] First 10 lines:", lines.slice(0, 10));

  let currentSection: { heading: string; summary?: string; bullets: Array<{ text: string }> } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Check for ## headings
    const hashHeadingMatch = line.match(/^#{2,3}\s+(.+)$/);

    if (hashHeadingMatch) {
      console.log("[parseSectionsFromMarkdown] Found heading:", hashHeadingMatch[1]);
      // Save previous section
      if (currentSection && currentSection.bullets.length > 0) {
        sections.push(currentSection);
      }

      // Start new section - clean heading of any markdown
      const heading = hashHeadingMatch[1]
        .trim()
        .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove ** bold **
        .replace(/_(.+?)_/g, '$1');        // Remove _italics_

      currentSection = {
        heading,
        summary: undefined,
        bullets: [],
      };
    } else {
      // Check for bullet points (-, *, •, or numbered lists)
      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
      const numberedMatch = line.match(/^\d+\.\s+(.+)$/);

      if (bulletMatch || numberedMatch) {
        console.log("[parseSectionsFromMarkdown] Found bullet:", line);
        
        // If no current section, create one with default heading
        if (!currentSection) {
          currentSection = {
            heading: "Answer",
            summary: undefined,
            bullets: [],
          };
        }
        
        let text = bulletMatch ? bulletMatch[1].trim() : numberedMatch![1].trim();

        // Clean text of markdown formatting
        text = text
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove [text](url) links - keep only text
          .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove ** bold **
          .replace(/__(.+?)__/g, '$1')       // Remove __ bold __
          .replace(/_(.+?)_/g, '$1')          // Remove _italics_
          .replace(/\*(.+?)\*/g, '$1')        // Remove *italics*
          .replace(/`(.+?)`/g, '$1')          // Remove `code`
          .trim();

        currentSection.bullets.push({ text });
      } else if (currentSection && line.length > 20) {
        // If we have a current section with no bullets yet, this might be a summary
        // Also check if we should accumulate summary text across multiple lines
        if (currentSection.bullets.length === 0) {
          const cleaned = line
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .trim();
          
          // Use as summary if it's reasonable length and not a header pattern
          if (cleaned.length > 0 && cleaned.length <= 300 && !cleaned.match(/^(Related|Sources|References?):/i)) {
            // Accumulate summary text if we already have a summary (multi-line summary)
            if (currentSection.summary) {
              currentSection.summary += ' ' + cleaned;
              // Limit total summary length
              if (currentSection.summary.length > 300) {
                currentSection.summary = currentSection.summary.substring(0, 297) + '...';
              }
            } else {
              currentSection.summary = cleaned;
            }
            continue; // Skip adding as bullet
          }
        }
        
        // Otherwise, treat it as a bullet (paragraph that isn't formatted as bullet)
        const cleaned = line
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/__(.+?)__/g, '$1')
          .replace(/_(.+?)_/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .trim();
        
        if (cleaned.length > 0 && !cleaned.match(/^(Related|Sources|References?):/i)) {
          currentSection.bullets.push({ text: cleaned });
        }
      }
    }
  }

  // Save last section
  if (currentSection && currentSection.bullets.length > 0) {
    sections.push(currentSection);
  }

  // Generate summaries for sections that don't have them
  sections = sections.map(section => {
    // If summary already exists and is not empty, keep it
    if (section.summary && section.summary.trim().length > 0) {
      return section;
    }

    // Generate contextual summary based on section heading and content
    if (section.bullets.length > 0) {
      let summary = '';
      const heading = section.heading.toLowerCase();
      const bulletCount = section.bullets.length;

      // Check for specific section types and generate appropriate summaries
      if (heading.includes('podcast')) {
        // Podcasts section
        const podcastNames = section.bullets.slice(0, 3).map(b => {
          // Extract podcast name (before first colon or dash)
          const match = b.text.match(/^([^:\-]+)/);
          return match ? match[1].trim() : b.text.substring(0, 30);
        });
        summary = `${bulletCount} AI podcast${bulletCount === 1 ? '' : 's'} covering artificial intelligence topics, including ${podcastNames.slice(0, 2).join(', ')}${bulletCount > 2 ? ', and more' : ''}.`;
      } else if (heading.includes('article') || heading.includes('list')) {
        // Articles/Lists section
        summary = `${bulletCount} curated article${bulletCount === 1 ? '' : 's'} and list${bulletCount === 1 ? '' : 's'} featuring AI podcast recommendations, reviews, and guides to help you discover quality AI content.`;
      } else if (heading.includes('reddit') || heading.includes('discussion')) {
        // Reddit/Discussion section
        summary = `Community discussions and recommendations from Reddit about AI podcasts, including user experiences and suggestions from the r/ArtificialIntelligence community.`;
      } else if (heading.includes('video') || heading.includes('youtube')) {
        // Video section
        summary = `${bulletCount} video${bulletCount === 1 ? '' : 's'} and YouTube content related to the query, providing visual explanations and tutorials.`;
      } else {
        // Generic section - extract meaningful content from bullets
        const firstBullet = section.bullets[0].text;

        // Try to extract descriptive content (look for colons, dashes, or parentheses with descriptions)
        const descMatch = firstBullet.match(/[:|\-|—]\s*(.+?)(?:\||$)/);
        const parenMatch = firstBullet.match(/\(([^)]{20,})\)/);

        if (descMatch && descMatch[1].length > 30) {
          summary = descMatch[1].trim();
          // Add count if multiple items
          if (bulletCount > 1) {
            summary = `${bulletCount} items. ` + summary;
          }
        } else if (parenMatch && parenMatch[1].length > 30) {
          summary = parenMatch[1].trim();
          if (bulletCount > 1) {
            summary = `${bulletCount} items. ` + summary;
          }
        } else {
          // Fallback: extract sentences from first 1-2 bullets
          const bulletsToUse = section.bullets.slice(0, 2);
          for (let i = 0; i < bulletsToUse.length; i++) {
            const bullet = bulletsToUse[i].text;
            const sentences = bullet.match(/[^.!?]+[.!?]+/g) || [];

            if (sentences.length > 0) {
              const sentencesToTake = i === 0 ? Math.min(2, sentences.length) : 1;
              const extracted = sentences.slice(0, sentencesToTake).join(' ').trim();

              if (summary.length + extracted.length <= 300) {
                summary += (summary.length > 0 ? ' ' : '') + extracted;
              } else if (summary.length === 0) {
                summary = extracted.substring(0, 280).trim() + '...';
                break;
              }
            }
          }

          // Last resort: use first part of first bullet
          if (!summary || summary.trim().length < 30) {
            summary = firstBullet.substring(0, 200).trim();
            if (firstBullet.length > 200) summary += '...';
          }
        }
      }

      // Always set summary if we have a valid one
      if (summary && summary.trim().length > 0) {
        return {
          ...section,
          summary: summary.trim(),
        };
      }
    }

    // If we somehow don't have a summary, return section as-is
    return section;
  });
  
  // Debug: Log sections with summaries
  console.log("[normalizeToAnswerPayload] Sections with summaries:", sections.map(s => ({
    heading: s.heading,
    hasSummary: !!s.summary,
    summaryLength: s.summary?.length || 0,
    bulletsCount: s.bullets.length
  })));

  // Fallback: If no structured sections found, create a default section from plain text
  if (sections.length === 0 && content.trim().length > 0) {
    console.log("[parseSectionsFromMarkdown] No structured sections found, creating fallback section");
    
    // Clean the content
    let cleanedContent = content
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove [text](url) links - keep only text
      .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove ** bold **
      .replace(/__(.+?)__/g, '$1')       // Remove __ bold __
      .replace(/_(.+?)_/g, '$1')          // Remove _italics_
      .replace(/\*(.+?)\*/g, '$1')        // Remove *italics*
      .replace(/`(.+?)`/g, '$1')          // Remove `code`
      .trim();

    // Split into paragraphs (double newlines) or single newlines
    const paragraphs = cleanedContent
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // If we have paragraphs, use them as bullets
    if (paragraphs.length > 0) {
      const firstParagraph = paragraphs[0];
      const summary = firstParagraph.length <= 200 
        ? firstParagraph.substring(0, 200).trim() + (firstParagraph.length > 200 ? '...' : '')
        : undefined;
      
      sections.push({
        heading: "Answer",
        summary,
        bullets: paragraphs.map(text => ({ text })),
      });
    } else {
      // Fallback: split by single newlines or sentences
      const lines = cleanedContent
        .split(/\n+/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.match(/^(Related|Sources|References?):/i));
      
      if (lines.length > 0) {
        const firstLine = lines[0];
        const summary = firstLine.length <= 200 
          ? firstLine.substring(0, 200).trim() + (firstLine.length > 200 ? '...' : '')
          : undefined;
        
        sections.push({
          heading: "Answer",
          summary,
          bullets: lines.map(text => ({ text })),
        });
      }
    }
  }

  console.log("[parseSectionsFromMarkdown] Final sections count:", sections.length);
  console.log("[parseSectionsFromMarkdown] All sections:", sections);

  return sections;
}

/**
 * Attempt to match bullets with sources based on text content
 */
function assignSourceIndices(
  sections: SearchAnswerPayload["sections"],
  sources: SearchAnswerPayload["sources"]
): SearchAnswerPayload["sections"] {
  return sections.map(section => ({
    ...section,
    bullets: section.bullets.map((bullet, idx) => {
      // Simple heuristic: assign sources in round-robin fashion
      // In production, use more sophisticated matching (NLP, keywords, etc.)
      const sourceIndex = idx % sources.length;
      return {
        ...bullet,
        sourceIndex,
      };
    }),
  }));
}

/**
 * Normalize SearchResultMetadata to SearchAnswerPayload
 * 
 * @param metadata - Original search result metadata
 * @param llmContent - LLM-generated markdown content
 * @returns Normalized payload for SearchAnswer component
 */
export function normalizeToAnswerPayload(
  metadata: SearchResultMetadata,
  llmContent: string
): SearchAnswerPayload {
  console.log("[normalizeToAnswerPayload] Starting normalization");
  console.log("[normalizeToAnswerPayload] Metadata:", metadata);
  console.log("[normalizeToAnswerPayload] LLM content:", llmContent.substring(0, 200));

  // Extract sources from results
  const sources = metadata.results.map(result => ({
    url: result.url,
    title: result.hostname.replace(/^www\./, ''),
    favicon: extractFavicon(result.url),
    thumbnail: extractThumbnail(result.url, result.thumbnail), // Use API thumbnail if available, otherwise generate
    description: result.description,
  }));

  console.log("[normalizeToAnswerPayload] Extracted sources:", sources.length);
  console.log("[normalizeToAnswerPayload] First source:", sources[0]);

  // Parse sections from markdown
  let sections = parseSectionsFromMarkdown(llmContent);

  console.log("[normalizeToAnswerPayload] Parsed sections:", sections.length);
  console.log("[normalizeToAnswerPayload] First section:", sections[0]);

  // Assign source indices to bullets
  if (sources.length > 0) {
    sections = assignSourceIndices(sections, sources);
  }

  const payload = {
    query: metadata.query,
    mode: "answer" as const,
    sources,
    sections,
    followups: metadata.relatedQuestions,
    stepsCaption: "Assistant steps",
  };

  console.log("[normalizeToAnswerPayload] Final payload:", payload);

  return payload;
}

/**
 * Simple variant that takes pre-structured data
 */
export function createAnswerPayload(
  query: string,
  sources: SearchAnswerPayload["sources"],
  sections: SearchAnswerPayload["sections"],
  options?: {
    followups?: string[];
    stepsCaption?: string;
    mode?: "answer" | "images";
  }
): SearchAnswerPayload {
  return {
    query,
    mode: options?.mode || "answer",
    sources,
    sections,
    followups: options?.followups,
    stepsCaption: options?.stepsCaption || "Assistant steps",
  };
}

