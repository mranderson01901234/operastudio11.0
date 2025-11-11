# Gemini API Rate Limit Optimization Plan

## Current Issues

1. **Large System Messages**: Every request includes:
   - Full system context (~5000+ tokens)
   - File context (can be 100KB+)
   - Tool capabilities (~2000 tokens)
   - Total: Can easily exceed 50K+ tokens per request

2. **Recursive Follow-ups**: Each tool call triggers a NEW full API request with all system messages again

3. **No Caching**: System info rebuilt every time

4. **Multiple System Messages**: 3+ separate system messages increase overhead

## Gemini API Rate Limits (as of 2024)

- **Free Tier**: 
  - 15 requests per minute (RPM)
  - 1,500 requests per day (RPD)
  
- **Paid Tier**:
  - 360 requests per minute (RPM)
  - 50,000 requests per day (RPD)

## Optimization Strategies

### 1. Reduce System Message Size
- Truncate system context to essential info only
- Limit file context to active file + summary of others
- Condense tool capabilities message

### 2. Optimize Follow-up Requests
- Skip full system context in follow-ups (only send tool result)
- Use minimal context for recursive calls
- Cache system messages

### 3. Implement Request Caching
- Cache system context (changes rarely)
- Cache file context until files change
- Reuse tool capabilities message

### 4. Reduce Token Usage
- Truncate large file contents more aggressively
- Remove redundant information
- Combine system messages into one

### 5. Add Rate Limit Handling
- Detect 429 errors
- Implement exponential backoff
- Queue requests when at limit

