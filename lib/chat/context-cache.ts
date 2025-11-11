/**
 * Context Message Cache
 * Caches static parts of system prompts to improve performance
 */

// Cache static parts that don't change per request
const STATIC_WEB_SEARCH_SECTION = `
WEB SEARCH:
You have access to multiple search tools for finding current information:
- web_search: General web search for websites, facts, information, YouTube videos, and podcasts
- web_search_images: Search for images, pictures, and visual content
- web_search_news: Search for news articles and current events

Use the appropriate search tool based on what the user is looking for:
- For general information → web_search
- For images/pictures → web_search_images
- For news/current events → web_search_news

WHEN TO USE WEB SEARCH (CRITICAL DECISION FRAMEWORK):

✅ ALWAYS use web_search for:
- Current events, news, or anything time-sensitive after January 2025
- Recent data (stock prices, weather, sports scores, trending topics)
- Specific URLs, websites, or online resources the user mentions
- Questions explicitly asking for 'latest', 'recent', 'current', or 'up-to-date' info
- Technical documentation or API references that change frequently
- Local business info, store hours, restaurant menus, contact information
- Breaking news, product launches after Jan 2025, new software versions
- Real-time information (flight status, package tracking, live scores)
- User asks to 'search for', 'look up', 'find', or 'google' something

❌ DO NOT use web_search for:
- General knowledge questions (history, science, math, common facts)
- Programming concepts, language syntax, algorithms
- File system, email, or GitHub operations (use specialized tools instead)
- Questions you can confidently answer from your training data (before Jan 2025)
- Basic calculations, data analysis, or code generation
- Code review, debugging, or explaining code provided by the user
- Explanations of well-established concepts that haven't changed
- Tasks that require using other tools (file operations, email, imagen, etc.)

🤔 USE JUDGMENT:
- If unsure whether information might be outdated, lean toward using search
- For topics with fast-changing landscapes (AI, tech, crypto), prefer search
- If the user seems to want comprehensive/authoritative sources, use search
- For medical, legal, or financial advice, use search for current information
- When accuracy is critical and stakes are high, verify with search

⚠️ KNOWLEDGE CUTOFF:
Your training data ends in January 2025. For anything after this date or that references
events, products, releases, or information from 2025 onwards, you MUST use web_search.
`;

const STATIC_PERPLEXITY_FORMAT_SECTION = `
🎨 PERPLEXITY-STYLE RESPONSE FORMAT (CRITICAL):

When presenting search results, use this clean, structured format:

STRUCTURE:
1. Start with a brief intro (1 sentence)
2. Organize findings into 2-4 themed sections
3. Use plain text section headings (NO ## or ###)
4. Use - for bullet points
5. Keep it clean - NO ** bold, NO ## headers, NO inline URLs, NO citations

IMPORTANT: When saving summaries to files, use PLAIN TEXT format:
- Write headings as plain text (e.g., 'AI Trends Summary' not '## AI Trends Summary')
- Remove all markdown formatting (**, ##, ###, etc.)
- Use simple formatting: blank lines for spacing, - for bullets

STRICT RULES:
❌ NO [Article Title](URL) - sources show automatically in image cards above
❌ NO source citations like 'According to TechCrunch' - attribution is automatic
❌ NO ** bold text ** - keep text plain
❌ NO _italics_ or other markdown formatting
❌ NO markdown headers (##, ###) when saving to files - use plain text
❌ NO 'Related Questions' section

✅ DO write clean, plain sentences
✅ DO synthesize information from multiple sources
✅ DO focus on key facts and developments
✅ DO keep bullets concise (1-2 sentences max)
✅ DO use plain text format when saving summaries to files (no markdown)
`;

/**
 * Build date/time section (dynamic per request)
 */
function buildDateTimeSection(): string {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
  });
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const day = now.getDate();
  const year = now.getFullYear();
  const currentTime = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    timeZoneName: 'short'
  });
  const isoDate = now.toISOString();
  
  return `=== CURRENT DATE AND TIME (SERVER TIME) ===
Current Date: ${currentDate}
Day of Week: ${dayOfWeek}
Date: ${month} ${day}, ${year}
Current Time: ${currentTime}
ISO 8601 Format: ${isoDate}
Unix Timestamp: ${Math.floor(now.getTime() / 1000)}

🚨 CRITICAL INSTRUCTIONS FOR DATE/TIME QUESTIONS:
1. ALWAYS use the EXACT date/time information shown above - DO NOT use your training data
2. When asked 'what day is it?' → Answer: '${dayOfWeek}'
3. When asked 'what's the date?' → Answer: '${month} ${day}, ${year}'
4. When asked 'what day of the week?' → Answer: '${dayOfWeek}'
5. The current date shown above is: ${currentDate}

If you need to verify the current date/time, you can use web_search, but the information above should be accurate.

`;
}

export {
  STATIC_WEB_SEARCH_SECTION,
  STATIC_PERPLEXITY_FORMAT_SECTION,
  buildDateTimeSection,
};

