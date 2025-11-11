# How to Check if Local Model Was Used

## Visual Indicators

After sending a message, check the response:

1. **Local Model Indicator**: If you see a green badge saying "Local Model (SmolLM2-360M)" below the response, the local model was used.

2. **Gemini API Indicator**: If you see a blue badge saying "Gemini API", Gemini was used instead.

## Console Logs

### Browser Console (Client-Side)

Open your browser's developer console (F12) and look for:

```
[Task Router] Message: gather system information
[Task Router] Analysis: { type: "local", confidence: 0.8, reason: "..." }
[Task Router] Should use local model: true
[Chat Interface] Task routing decision: { message: "...", useLocalModel: true, ... }
[Chat Interface] Using local model (SmolLM2-360M)
[Chat Interface] Local model response: { response: "...", metadata: {...} }
```

### Server Console (Terminal)

Check your Next.js dev server terminal for:

```
[Local Model API] Received request: { prompt: "gather system information", ... }
```

## Testing

To verify the local model is working:

1. **Send**: "gather system information"
2. **Check browser console** for routing logs
3. **Check response** for green "Local Model" badge
4. **Check server terminal** for API logs

## Troubleshooting

### If Local Model Not Used

1. **Check message matching**: The message must contain one of these phrases:
   - "gather system information"
   - "get system info"
   - "system details"
   - "system information"
   - "system status"

2. **Check console logs**: Look for `[Task Router]` logs to see why it wasn't routed to local model

3. **Check API route**: Look for errors in server console

### Common Issues

- **Model not initialized**: First request may take 10-30 seconds to download model
- **Fallback to Gemini**: If local model fails, it automatically falls back to Gemini
- **Message doesn't match**: Try exact phrase "gather system information"

## Expected Behavior

When you type "gather system information":
- ✅ Should route to local model
- ✅ Should show green badge
- ✅ Should see console logs
- ✅ Response time: 100-500ms (after first load)

