# Image Editing Tools Reference - Sharp vs ImageSorcery

Complete list of available operations/tools for editing Imagen4-generated images.

---

## Sharp Library - Available Operations

Sharp is a high-performance Node.js image processing library. Here are all the operations you can expose as LLM tools:

### 📐 **Geometric Operations**

#### 1. **Resize** (`imagen_resize`)
```typescript
sharp(image).resize(width, height, {
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside',
  position: 'center' | 'top' | 'right' | 'bottom' | 'left' | 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest',
  background: { r: 255, g: 255, b: 255, alpha: 1 },
  kernel: 'nearest' | 'cubic' | 'lanczos2' | 'lanczos3'
})
```
**Use Cases:**
- "Resize to 1920x1080"
- "Make this image smaller"
- "Scale to fit 800px width"

#### 2. **Crop** (`imagen_crop`)
```typescript
sharp(image).extract({ left: x, top: y, width: w, height: h })
```
**Use Cases:**
- "Crop to focus on the center"
- "Remove the edges"
- "Crop to square"

#### 3. **Rotate** (`imagen_rotate`)
```typescript
sharp(image).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
```
**Use Cases:**
- "Rotate 90 degrees clockwise"
- "Turn this upside down"

#### 4. **Flip** (`imagen_flip`)
```typescript
sharp(image).flip() // horizontal
sharp(image).flop() // vertical
```
**Use Cases:**
- "Flip horizontally"
- "Mirror the image"

---

### 🎨 **Color & Tone Adjustments**

#### 5. **Brightness** (`imagen_brightness`)
```typescript
sharp(image).modulate({ brightness: 1.2 }) // 1.0 = no change, >1.0 = brighter, <1.0 = darker
```
**Use Cases:**
- "Make this brighter"
- "Darken the image"

#### 6. **Saturation** (`imagen_saturation`)
```typescript
sharp(image).modulate({ saturation: 1.5 }) // 1.0 = no change, >1.0 = more saturated, <1.0 = less saturated
```
**Use Cases:**
- "Make colors more vibrant"
- "Desaturate the image"

#### 7. **Hue** (`imagen_hue`)
```typescript
sharp(image).modulate({ hue: 90 }) // degrees, 0-360
```
**Use Cases:**
- "Shift colors warmer"
- "Make it more blue"

#### 8. **Contrast** (`imagen_contrast`)
```typescript
sharp(image).linear(1.2, -(128 * 0.2)) // multiplier, offset
// Or use normalize() for auto-contrast
sharp(image).normalize()
```
**Use Cases:**
- "Increase contrast"
- "Auto-adjust contrast"

#### 9. **Gamma Correction** (`imagen_gamma`)
```typescript
sharp(image).gamma(2.2) // default is 2.2
```
**Use Cases:**
- "Adjust gamma"
- "Correct brightness curve"

#### 10. **Tint** (`imagen_tint`)
```typescript
sharp(image).tint({ r: 255, g: 200, b: 150 }) // RGB tint color
```
**Use Cases:**
- "Add warm tint"
- "Make it sepia-toned"

---

### 🖼️ **Filters & Effects**

#### 11. **Blur** (`imagen_blur`)
```typescript
sharp(image).blur(sigma) // sigma = blur radius (0.3 to 1000)
```
**Use Cases:**
- "Blur the background"
- "Add soft focus"

#### 12. **Sharpen** (`imagen_sharpen`)
```typescript
sharp(image).sharpen({ sigma: 1, flat: 1, jagged: 2 })
```
**Use Cases:**
- "Sharpen the image"
- "Make it crisper"

#### 13. **Grayscale** (`imagen_grayscale`)
```typescript
sharp(image).greyscale()
```
**Use Cases:**
- "Convert to black and white"
- "Make it grayscale"

#### 14. **Sepia** (`imagen_sepia`)
```typescript
sharp(image).tint({ r: 112, g: 66, b: 20 }) // sepia color
```
**Use Cases:**
- "Apply sepia filter"
- "Make it vintage"

#### 15. **Threshold** (`imagen_threshold`)
```typescript
sharp(image).threshold(128) // 0-255
```
**Use Cases:**
- "Convert to pure black and white"
- "Apply threshold"

#### 16. **Negate** (`imagen_negate`)
```typescript
sharp(image).negate()
```
**Use Cases:**
- "Invert colors"
- "Create negative effect"

---

### 🔄 **Format & Conversion**

#### 17. **Format Conversion** (`imagen_convert`)
```typescript
sharp(image).jpeg({ quality: 80 })
sharp(image).png({ compressionLevel: 9 })
sharp(image).webp({ quality: 80 })
sharp(image).avif({ quality: 80 })
```
**Use Cases:**
- "Convert to JPEG"
- "Save as WebP"
- "Change format to PNG"

#### 18. **Quality Adjustment** (`imagen_quality`)
```typescript
sharp(image).jpeg({ quality: 90 }) // 1-100
sharp(image).webp({ quality: 80 })
```
**Use Cases:**
- "Reduce file size"
- "Increase quality"

---

### 🎭 **Compositing & Overlays**

#### 19. **Composite** (`imagen_composite`)
```typescript
sharp(image).composite([
  { input: overlayBuffer, top: 100, left: 100, blend: 'over' }
])
```
**Blend modes:** 'over', 'in', 'out', 'atop', 'dest', 'dest-over', 'dest-in', 'dest-out', 'dest-atop', 'xor', 'add', 'saturate', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'colour-dodge', 'colour-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'

**Use Cases:**
- "Add a watermark"
- "Overlay another image"
- "Blend two images"

#### 20. **Add Text Overlay** (`imagen_text`)
```typescript
// Requires SVG or canvas library
// Can composite text as image
```
**Use Cases:**
- "Add text to the image"
- "Create a caption"

---

### 🔍 **Advanced Operations**

#### 21. **Extract Channel** (`imagen_extract_channel`)
```typescript
sharp(image).extractChannel('red')
sharp(image).extractChannel('green')
sharp(image).extractChannel('blue')
sharp(image).extractChannel('alpha')
```
**Use Cases:**
- "Extract red channel"
- "Get alpha mask"

#### 22. **Join Channels** (`imagen_join_channels`)
```typescript
sharp(image).joinChannel([redChannel, greenChannel, blueChannel])
```
**Use Cases:**
- "Combine channels"
- "Rebuild RGB from channels"

#### 23. **Remove Alpha** (`imagen_remove_alpha`)
```typescript
sharp(image).removeAlpha()
```
**Use Cases:**
- "Remove transparency"
- "Flatten alpha channel"

#### 24. **Ensure Alpha** (`imagen_ensure_alpha`)
```typescript
sharp(image).ensureAlpha()
```
**Use Cases:**
- "Add transparency channel"

---

### 📊 **Metadata & Analysis**

#### 25. **Get Metadata** (`imagen_metadata`)
```typescript
const metadata = await sharp(image).metadata()
// Returns: width, height, format, channels, density, etc.
```
**Use Cases:**
- "Get image dimensions"
- "Check image format"
- "Analyze image properties"

#### 26. **Get Stats** (`imagen_stats`)
```typescript
const stats = await sharp(image).stats()
// Returns: channels, histograms, etc.
```
**Use Cases:**
- "Analyze color distribution"
- "Get image statistics"

---

## ImageSorcery MCP Server - Available Operations

ImageSorcery provides **LLM-native** computer vision capabilities that make it perfect for natural language-driven image editing:

### 🎯 **Basic Editing** (Similar to Sharp)

1. **Crop** - Crop images
2. **Resize** - Resize images
3. **Rotate** - Rotate images
4. **Flip** - Mirror images horizontally/vertically
5. **Format Conversion** - Convert between formats

### 🤖 **LLM-Native Computer Vision** (⭐ KEY DIFFERENTIATOR)

#### 27. **Semantic Object Search** (`imagen_find_objects`) ⭐ MOST POWERFUL FOR LLMs
```typescript
// Uses CLIP model to find objects based on natural language descriptions
```
**Use Cases:**
- "Find all the dogs in the image"
- "Locate the person wearing a red shirt"
- "Find the car in the background"
- "Where is the sunset?"
- "Show me all the text signs"

**Why This is Powerful:**
- LLM can describe what to find in natural language
- CLIP understands semantic meaning, not just object classes
- Returns bounding boxes/coordinates for found objects
- Enables context-aware editing: "blur everything except the person"

#### 28. **Object Detection** (`imagen_detect_objects`)
```typescript
// Detects objects using YOLO/pre-trained models
// Returns: object type, confidence, bounding boxes
```
**Use Cases:**
- "Detect all objects in the image"
- "What objects are in this image?"
- "Find all people, cars, and buildings"
- "Count the number of objects"

**Returns structured data:**
```json
{
  "objects": [
    { "type": "person", "confidence": 0.95, "bbox": [x, y, w, h] },
    { "type": "car", "confidence": 0.87, "bbox": [x, y, w, h] }
  ]
}
```

#### 29. **Background Removal** (`imagen_remove_background`)
```typescript
// Removes background, keeps foreground subject
```
**Use Cases:**
- "Remove the background"
- "Isolate the subject"
- "Create transparent background"
- "Extract the foreground"

#### 30. **OCR (Text Extraction)** (`imagen_extract_text`)
```typescript
// Extracts text from image using OCR
// Returns: text content, bounding boxes for each word
```
**Use Cases:**
- "Read text from image"
- "Extract all text"
- "What does the sign say?"
- "Get text from this document"

**Returns:**
```json
{
  "text": "Hello World",
  "words": [
    { "text": "Hello", "bbox": [x, y, w, h] },
    { "text": "World", "bbox": [x, y, w, h] }
  ]
}
```

### 🎨 **Drawing & Annotation** (More Advanced Than Sharp)

#### 31. **Draw Text** (`imagen_draw_text`)
```typescript
// Adds text overlay with full styling options
// Position, font, size, color, background, rotation
```
**Use Cases:**
- "Add caption at the bottom"
- "Write 'Hello' in the center"
- "Add watermark text"
- "Label the objects"

#### 32. **Draw Shapes** (`imagen_draw_shape`)
```typescript
// Draws rectangles, circles, lines, polygons
// With fill, stroke, opacity options
```
**Use Cases:**
- "Draw a rectangle around the person"
- "Add a circle highlight"
- "Draw an arrow pointing to..."
- "Create a border"

#### 33. **Draw Arrows** (`imagen_draw_arrow`)
```typescript
// Draws arrows with customizable style
```
**Use Cases:**
- "Point an arrow at the car"
- "Add arrows to show direction"
- "Highlight with arrows"

#### 34. **Fill Areas** (`imagen_fill`)
```typescript
// Fill specific areas with color, pattern, or transparency
// Can use detected object regions
```
**Use Cases:**
- "Fill the background with blue"
- "Make the sky more colorful"
- "Fill detected objects with color"

#### 35. **Overlay Images** (`imagen_overlay`)
```typescript
// More advanced compositing than Sharp
// Supports blend modes, positioning, masking
```
**Use Cases:**
- "Overlay a logo"
- "Add a watermark image"
- "Composite two images"
- "Blend images together"

### 🎨 **Color & Style Operations**

#### 36. **Change Color Palette** (`imagen_change_color`)
```typescript
// Modify color palette, not just adjust
// Can target specific colors or regions
```
**Use Cases:**
- "Change the sky to purple"
- "Make all red objects blue"
- "Convert to sepia tone"
- "Apply color grading"

#### 37. **Blur Regions** (`imagen_blur_region`)
```typescript
// Blur specific regions (not entire image)
// Can use detected object coordinates
```
**Use Cases:**
- "Blur the background"
- "Blur everything except the person"
- "Blur faces for privacy"
- "Soft focus on subject"

### 📊 **Analysis & Metadata**

#### 38. **Get Metadata** (`imagen_get_metadata`)
```typescript
// Comprehensive metadata extraction
// More detailed than Sharp's metadata
```
**Returns:**
- Dimensions, format, color space
- EXIF data (camera, location, date)
- Color profiles
- File size, compression

**Use Cases:**
- "What are the image dimensions?"
- "When was this photo taken?"
- "What camera was used?"
- "Get all image information"

---

## 🚀 **Why ImageSorcery is Powerful for LLMs**

### 1. **Semantic Understanding**
- **CLIP Integration:** Can find objects by description, not just class names
- **Natural Language:** "Find the person wearing sunglasses" works!
- **Context-Aware:** Understands relationships and descriptions

### 2. **Structured Output**
- Returns bounding boxes, coordinates, confidence scores
- LLM can use this data for precise editing operations
- Enables chained operations: detect → edit → composite

### 3. **LLM-Native Workflow**
```
User: "Blur everything except the person in the red shirt"
  ↓
LLM calls: imagen_find_objects({ description: "person in red shirt" })
  ↓
Returns: { bbox: [x, y, w, h], confidence: 0.95 }
  ↓
LLM calls: imagen_blur_region({ 
  imageId: "current",
  excludeRegion: { x, y, w, h }  // from detection
})
  ↓
Result: Background blurred, person preserved
```

### 4. **Rich Annotation**
- Draw shapes, arrows, text with precise control
- Perfect for creating instructional images
- LLM can describe what to annotate

### 5. **Multi-Modal Understanding**
- OCR + Object Detection + Semantic Search
- LLM can understand both visual and textual content
- Enables complex reasoning about images

---

## Recommended Tool Set for LLM

Here's a prioritized list of tools to implement first:

### **Phase 1: Essential Tools** (Start Here)

1. ✅ `imagen_resize` - Most common operation
2. ✅ `imagen_crop` - Very useful
3. ✅ `imagen_brightness` - Common adjustment
4. ✅ `imagen_contrast` - Common adjustment
5. ✅ `imagen_saturation` - Common adjustment
6. ✅ `imagen_rotate` - Simple but useful
7. ✅ `imagen_format` - Format conversion

### **Phase 2: Filters & Effects**

8. ✅ `imagen_blur` - Popular effect
9. ✅ `imagen_sharpen` - Image enhancement
10. ✅ `imagen_grayscale` - Common filter
11. ✅ `imagen_sepia` - Vintage effect
12. ✅ `imagen_flip` - Orientation fix

### **Phase 3: Advanced Operations**

13. ✅ `imagen_composite` - Overlay images
14. ✅ `imagen_text` - Add text (requires canvas/SVG)
15. ✅ `imagen_hue` - Color adjustment
16. ✅ `imagen_tint` - Color effects

### **Phase 4: ImageSorcery LLM-Native Features** ⭐ HIGHEST VALUE

17. ✅ `imagen_find_objects` - **Semantic search with CLIP** (game-changer!)
18. ✅ `imagen_detect_objects` - Object detection with bounding boxes
19. ✅ `imagen_remove_background` - Very useful
20. ✅ `imagen_extract_text` - OCR capability
21. ✅ `imagen_blur_region` - Region-based blur (use with detection)
22. ✅ `imagen_fill` - Fill specific areas
23. ✅ `imagen_draw_arrow` - Advanced annotation
24. ✅ `imagen_change_color` - Targeted color changes
25. ✅ `imagen_get_metadata` - Comprehensive metadata

---

## Tool Definition Examples

### Example 1: Resize Tool

```typescript
{
  name: "imagen_resize",
  description: "Resize an image to specific dimensions. Use this when the user wants to change the size of an image, make it smaller, larger, or fit specific dimensions.",
  parameters: {
    type: "object",
    properties: {
      imageId: {
        type: "string",
        description: "ID of the image to resize. Use 'current' for the most recently generated image, or a specific image ID."
      },
      width: {
        type: "number",
        description: "Target width in pixels"
      },
      height: {
        type: "number",
        description: "Target height in pixels"
      },
      fit: {
        type: "string",
        enum: ["cover", "contain", "fill", "inside", "outside"],
        description: "How to fit the image: 'cover' (crop to fill), 'contain' (fit entire image), 'fill' (stretch), 'inside' (fit within), 'outside' (fit around). Default: 'cover'"
      },
      maintainAspectRatio: {
        type: "boolean",
        description: "Whether to maintain aspect ratio. If true, only width or height needs to be specified. Default: true"
      }
    },
    required: ["imageId"]
  }
}
```

### Example 2: Adjust Tool (Combined)

```typescript
{
  name: "imagen_adjust",
  description: "Adjust image properties like brightness, contrast, saturation, and hue. Use this when the user wants to improve or modify the appearance of an image.",
  parameters: {
    type: "object",
    properties: {
      imageId: {
        type: "string",
        description: "ID of the image to adjust. Use 'current' for the most recently generated image."
      },
      brightness: {
        type: "number",
        description: "Brightness adjustment (0.5 to 2.0, where 1.0 is no change). Values > 1.0 make brighter, < 1.0 make darker. Default: 1.0"
      },
      contrast: {
        type: "number",
        description: "Contrast adjustment (0.5 to 2.0, where 1.0 is no change). Values > 1.0 increase contrast. Default: 1.0"
      },
      saturation: {
        type: "number",
        description: "Saturation adjustment (0.0 to 2.0, where 1.0 is no change). 0.0 = grayscale, > 1.0 = more vibrant. Default: 1.0"
      },
      hue: {
        type: "number",
        description: "Hue rotation in degrees (0-360). Default: 0"
      }
    },
    required: ["imageId"]
  }
}
```

### Example 3: Filter Tool

```typescript
{
  name: "imagen_filter",
  description: "Apply visual filters or effects to an image. Use this when the user wants to change the style or add effects like blur, sharpen, grayscale, etc.",
  parameters: {
    type: "object",
    properties: {
      imageId: {
        type: "string",
        description: "ID of the image to filter. Use 'current' for the most recently generated image."
      },
      filter: {
        type: "string",
        enum: ["blur", "sharpen", "grayscale", "sepia", "negate", "threshold"],
        description: "Type of filter to apply: 'blur' (soften), 'sharpen' (enhance edges), 'grayscale' (black and white), 'sepia' (vintage brown tone), 'negate' (invert colors), 'threshold' (pure black/white)"
      },
      intensity: {
        type: "number",
        description: "Filter intensity (0-100). For blur: radius in pixels. For sharpen: strength. Default: 50"
      }
    },
    required: ["imageId", "filter"]
  }
}
```

---

## Comparison: Sharp vs ImageSorcery

| Feature | Sharp | ImageSorcery |
|---------|-------|--------------|
| **Basic Editing** | ✅ Excellent | ✅ Good |
| **Performance** | ⚡ Very Fast | 🐢 Slower (Python-based) |
| **Format Support** | ✅ Many formats | ✅ Many formats |
| **Object Detection** | ❌ No | ✅ Yes (YOLO) |
| **Semantic Search** | ❌ No | ✅ **Yes (CLIP)** ⭐ |
| **Background Removal** | ❌ No | ✅ Yes |
| **OCR** | ❌ No | ✅ Yes |
| **Drawing/Annotation** | ⚠️ Limited | ✅ **Advanced** (shapes, arrows, text) |
| **Region-Based Editing** | ❌ No | ✅ Yes (blur regions, fill areas) |
| **Color Palette Changes** | ⚠️ Limited | ✅ Yes (targeted color changes) |
| **Metadata Extraction** | ✅ Basic | ✅ **Comprehensive** (EXIF, etc.) |
| **LLM-Native Features** | ❌ No | ✅ **Yes** (semantic search, structured output) |
| **Ease of Integration** | ✅ Easy (npm) | ⚠️ MCP server setup |
| **TypeScript Support** | ✅ Full | ⚠️ Partial |

---

## Recommendation

### **Use Sharp for:**
- Basic editing (resize, crop, adjust, filters)
- High-performance operations
- Format conversion
- Quick implementation
- Operations that don't need semantic understanding

### **Use ImageSorcery for:** ⭐ LLM-Native Features
- **Semantic object search** (`imagen_find_objects`) - This is the killer feature!
- **Context-aware editing** (blur regions, fill areas based on detection)
- **Background removal** (very useful!)
- **OCR/text extraction** (extract and understand text)
- **Advanced drawing/annotation** (shapes, arrows, text with positioning)
- **Targeted color changes** (change specific colors/regions)
- **Structured output** (bounding boxes, coordinates for LLM reasoning)

### **Best Approach:**

**Hybrid Strategy:**
1. **Start with Sharp** - Implement basic operations quickly (resize, crop, adjust)
2. **Add ImageSorcery** - For LLM-native features (semantic search, detection, OCR)
3. **Use Both** - Sharp for performance-critical operations, ImageSorcery for intelligence

**Why ImageSorcery is Essential for LLMs:**
- **Semantic Search** (`imagen_find_objects`) enables natural language image interaction
- **Structured Output** (bounding boxes) allows LLM to reason about image content
- **Chained Operations** - Detect → Edit → Composite workflows
- **Context-Aware Editing** - "Blur everything except X" becomes possible

**Example LLM Workflow:**
```
User: "Find the person in the red shirt and blur everything else"

LLM:
1. imagen_find_objects({ description: "person in red shirt" })
   → Returns: { bbox: [100, 200, 150, 300] }
2. imagen_blur_region({ imageId: "current", excludeRegion: [100, 200, 150, 300] })
   → Blurs everything except the detected person
```

This is only possible with ImageSorcery's semantic understanding!

---

## Implementation Priority

1. **Week 1:** Sharp - Basic operations (resize, crop, adjust, rotate)
2. **Week 2:** Sharp - Filters (blur, sharpen, grayscale, sepia)
3. **Week 3:** ImageSorcery - Background removal (high value!)
4. **Week 4:** Sharp - Compositing, ImageSorcery - OCR

This gives you a complete, powerful image editing toolkit for your LLM! 🎨

