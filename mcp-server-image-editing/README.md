# Image Editing MCP Server

MCP server for image editing operations using Sharp library.

## Features

- Crop, resize, adjust, filter, rotate, format conversion
- File-based transport for large images
- Atomic writes for safe file operations
- Preview generation (256px, 1024px)
- Hash-based integrity tracking

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm start

# Development (watch mode)
npm run dev
```

## Environment Variables

- `USER_ID` - User ID for image resolution (set by MCP start route)
- `OPERASTUDIO_API_URL` - API base URL (default: http://localhost:3000)
- `IMAGE_TEMP_DIR` - Temp directory for images (default: /tmp/operastudio-images)

## Tools

- `imagen_crop` - Crop image to region
- `imagen_resize` - Resize image
- `imagen_adjust` - Adjust brightness/contrast/saturation/hue
- `imagen_filter` - Apply filters (blur, sharpen, grayscale, etc.)
- `imagen_rotate` - Rotate or flip image
- `imagen_format` - Convert format (PNG, JPEG, WebP, AVIF)

