# Gemini API Rate Limit Optimization

## Gemini API Rate Limits

### Free Tier
- **15 requests per minute (RPM)**
- **1,500 requests per day (RPD)**

### Paid Tier  
- **360 requests per minute (RPM)**
- **50,000 requests per day (RPD)**

## Optimizations Implemented

### 1. Reduced System Message Size ✅
- **Before**: ~10,000+ tokens per request (full software inventory, file system structure, etc.)
- **After**: ~2,000-3,000 tokens per request (summaries only)
- **Savings**: ~70% reduction in system message tokens

**Changes:**
- Software inventory: Show counts instead of listing all packages
- File system: Summary only (project count, config file count)
- Running state: Summary only (port count, container count)
- Removed detailed listings that weren't essential

### 2. Optimized Follow-up Requests ✅
- **Before**: Every tool call triggered a NEW full API request with all system messages
- **After**: Follow-up requests skip heavy system/file context
- **Savings**: ~80% reduction in tokens for recursive tool calls

**Changes:**
- Removed file context from follow-up requests (LLM already has it)
- Removed full system context from follow-ups
- Only include essential tool capabilities message

### 3. Reduced File Context Size ✅
- **Before**: 100KB max context size
- **After**: 50KB max context size  
- **Savings**: 50% reduction in file context tokens

### 4. Added Rate Limit Error Handling ✅
- Detects 429 (Rate Limit) errors
- Shows user-friendly error message with retry time
- Provides tips to reduce API usage

### 5. Combined System Messages ✅
- Multiple system messages combined into one
- Reduced overhead from message formatting

## Expected Impact

### Token Usage Reduction
- **Initial request**: ~70% reduction (from ~50K to ~15K tokens)
- **Follow-up requests**: ~85% reduction (from ~50K to ~7K tokens)
- **Overall**: ~75% reduction in token usage

### API Call Reduction
- Fewer tokens = faster responses = fewer timeout retries
- Optimized follow-ups = less API overhead
- Better error handling = fewer failed retries

## Additional Recommendations

### For Users:
1. **Close unused file tabs** - Reduces file context size
2. **Use shorter messages** - Reduces input tokens
3. **Wait between requests** - Avoids hitting rate limits
4. **Consider paid tier** - Higher rate limits (360 RPM vs 15 RPM)

### Future Optimizations:
1. **Cache system context** - Only rebuild when system info changes
2. **Lazy load file context** - Only include files relevant to current query
3. **Request queuing** - Queue requests when approaching rate limit
4. **Exponential backoff** - Automatically retry with backoff on 429 errors
5. **Token counting** - Track and display token usage to users

## Monitoring

To check if you're hitting rate limits:
1. Look for 429 errors in browser console
2. Check network tab for failed requests
3. Monitor response times (slow responses may indicate throttling)

## Current Status

✅ System message size optimized
✅ Follow-up requests optimized  
✅ File context size reduced
✅ Rate limit error handling added
✅ User-friendly error messages

The system should now use significantly fewer tokens and be less likely to hit rate limits.

