#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { ImageEditingTools } from "./tools/image-editing.js";
import { ImageResolver } from "./resolvers/image-resolver.js";
import { writeImageAtomically } from "./utils/file-ops.js";
/**
 * MCP Server for Image Editing
 * Provides image editing tools via Sharp library
 */
class ImageEditingMCPServer {
    server;
    imageTools;
    imageResolver;
    constructor() {
        this.imageTools = new ImageEditingTools();
        this.imageResolver = new ImageResolver();
        this.server = new Server({
            name: "operastudio-image-editing",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [
                {
                    name: "imagen_crop",
                    description: "Crop an image to a specific rectangular region. Use this when the user wants to focus on part of an image or remove edges.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            imageId: {
                                type: "string",
                                description: "ID of the image to crop. Use 'current' for the most recently generated image, or a specific image ID.",
                            },
                            x: {
                                type: "number",
                                description: "X coordinate of the top-left corner of the crop region (in pixels)",
                            },
                            y: {
                                type: "number",
                                description: "Y coordinate of the top-left corner of the crop region (in pixels)",
                            },
                            width: {
                                type: "number",
                                description: "Width of the crop region (in pixels)",
                            },
                            height: {
                                type: "number",
                                description: "Height of the crop region (in pixels)",
                            },
                        },
                        required: ["imageId", "x", "y", "width", "height"],
                    },
                },
                {
                    name: "imagen_resize",
                    description: "Resize an image to specific dimensions. Use this when the user wants to change the size of an image.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            imageId: {
                                type: "string",
                                description: "ID of the image to resize. Use 'current' for the most recently generated image.",
                            },
                            width: {
                                type: "number",
                                description: "Target width in pixels",
                            },
                            height: {
                                type: "number",
                                description: "Target height in pixels",
                            },
                            maintainAspectRatio: {
                                type: "boolean",
                                description: "Whether to maintain aspect ratio (default: true)",
                            },
                        },
                        required: ["imageId", "width", "height"],
                    },
                },
                {
                    name: "imagen_adjust",
                    description: "Adjust image properties like brightness, contrast, saturation, and hue. Use this when the user wants to improve or modify the appearance of an image.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            imageId: {
                                type: "string",
                                description: "ID of the image to adjust. Use 'current' for the most recently generated image.",
                            },
                            brightness: {
                                type: "number",
                                description: "Brightness adjustment (0.5 to 2.0, where 1.0 is no change). Values > 1.0 make brighter, < 1.0 make darker. Default: 1.0",
                            },
                            contrast: {
                                type: "number",
                                description: "Contrast adjustment (0.5 to 2.0, where 1.0 is no change). Values > 1.0 increase contrast. Default: 1.0",
                            },
                            saturation: {
                                type: "number",
                                description: "Saturation adjustment (0.0 to 2.0, where 1.0 is no change). 0.0 = grayscale, > 1.0 = more vibrant. Default: 1.0",
                            },
                            hue: {
                                type: "number",
                                description: "Hue rotation in degrees (0-360). Default: 0",
                            },
                        },
                        required: ["imageId"],
                    },
                },
                {
                    name: "imagen_filter",
                    description: "Apply visual filters or effects to an image. Use this when the user wants to change the style or add effects like blur, sharpen, grayscale, etc.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            imageId: {
                                type: "string",
                                description: "ID of the image to filter. Use 'current' for the most recently generated image.",
                            },
                            filter: {
                                type: "string",
                                enum: ["blur", "sharpen", "grayscale", "sepia", "negate", "threshold"],
                                description: "Type of filter to apply",
                            },
                            intensity: {
                                type: "number",
                                description: "Filter intensity (0-100). For blur: radius in pixels. For sharpen: strength. Default: 50",
                            },
                        },
                        required: ["imageId", "filter"],
                    },
                },
                {
                    name: "imagen_rotate",
                    description: "Rotate or flip an image. Use this when the user wants to change the orientation.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            imageId: {
                                type: "string",
                                description: "ID of the image to rotate. Use 'current' for the most recently generated image.",
                            },
                            angle: {
                                type: "number",
                                description: "Rotation angle in degrees (90, 180, 270)",
                            },
                            flip: {
                                type: "string",
                                enum: ["horizontal", "vertical", "both"],
                                description: "Flip direction (optional, alternative to rotation)",
                            },
                        },
                        required: ["imageId"],
                    },
                },
                {
                    name: "imagen_format",
                    description: "Convert image format (PNG, JPEG, WebP, etc.). Use this when the user wants to change the file format.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            imageId: {
                                type: "string",
                                description: "ID of the image to convert. Use 'current' for the most recently generated image.",
                            },
                            format: {
                                type: "string",
                                enum: ["png", "jpeg", "jpg", "webp", "avif"],
                                description: "Target format",
                            },
                            quality: {
                                type: "number",
                                description: "Quality for lossy formats (1-100). Default: 80",
                            },
                        },
                        required: ["imageId", "format"],
                    },
                },
            ];
            return { tools };
        });
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            if (!args || typeof args !== "object") {
                throw new Error("Invalid arguments");
            }
            try {
                // Resolve imageId to actual image data (path or base64)
                const resolvedImage = await this.imageResolver.resolve(args.imageId);
                // Load image buffer
                let inputBuffer;
                let sourceHash;
                if (resolvedImage.path) {
                    // Large image: read from file
                    const { readFile } = await import("fs/promises");
                    inputBuffer = await readFile(resolvedImage.path);
                    sourceHash = resolvedImage.hash;
                }
                else if (resolvedImage.base64) {
                    // Small image: use base64
                    inputBuffer = Buffer.from(resolvedImage.base64, "base64");
                    sourceHash = resolvedImage.hash;
                }
                else {
                    throw new Error("IMAGE_RESOLUTION_FAILED: No path or base64 available");
                }
                // Process image based on tool name
                let result;
                let editType;
                let editPrompt;
                let outputMimeType = resolvedImage.mimeType;
                switch (name) {
                    case "imagen_crop": {
                        const { x, y, width, height } = args;
                        result = await this.imageTools.crop(inputBuffer, x, y, width, height);
                        editType = "crop";
                        editPrompt = `Crop image at (${x}, ${y}) with size ${width}x${height}`;
                        break;
                    }
                    case "imagen_resize": {
                        const { width, height, maintainAspectRatio = true } = args;
                        result = await this.imageTools.resize(inputBuffer, width, height, maintainAspectRatio);
                        editType = "resize";
                        editPrompt = `Resize to ${width}x${height}`;
                        break;
                    }
                    case "imagen_adjust": {
                        const { brightness, contrast, saturation, hue } = args;
                        result = await this.imageTools.adjust(inputBuffer, {
                            brightness: brightness,
                            contrast: contrast,
                            saturation: saturation,
                            hue: hue,
                        });
                        editType = "adjust";
                        editPrompt = `Adjust: brightness=${brightness}, contrast=${contrast}, saturation=${saturation}, hue=${hue}`;
                        break;
                    }
                    case "imagen_filter": {
                        const { filter, intensity = 50 } = args;
                        result = await this.imageTools.applyFilter(inputBuffer, filter, intensity);
                        editType = "filter";
                        editPrompt = `Apply ${filter} filter with intensity ${intensity}`;
                        break;
                    }
                    case "imagen_rotate": {
                        const { angle, flip } = args;
                        result = await this.imageTools.rotate(inputBuffer, angle, flip);
                        editType = "rotate";
                        editPrompt = angle
                            ? `Rotate ${angle} degrees`
                            : `Flip ${flip}`;
                        break;
                    }
                    case "imagen_format": {
                        const { format, quality = 80 } = args;
                        result = await this.imageTools.convertFormat(inputBuffer, format, quality);
                        outputMimeType = this.imageTools.getMimeTypeForFormat(format);
                        editType = "format";
                        editPrompt = `Convert to ${format} format`;
                        break;
                    }
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
                // Calculate output hash
                const outputHash = this.imageTools.calculateHash(result);
                // Write result to temp file atomically
                const { path: outputPath } = await writeImageAtomically(result, outputMimeType);
                // Generate previews for UI
                const previews = await this.imageTools.generatePreviews(result);
                // Return result with metadata for storing edited image
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                image: {
                                    path: outputPath,
                                    mimeType: outputMimeType,
                                    size: result.length,
                                },
                                previews: {
                                    preview256: previews.preview256,
                                    preview1024: previews.preview1024,
                                },
                                metadata: {
                                    originalImageId: resolvedImage.id,
                                    editType,
                                    editPrompt,
                                    sourceHash,
                                    outputHash,
                                },
                            }),
                        },
                    ],
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                // Log error for debugging
                console.error(`[Image Editing MCP] Tool ${name} error:`, errorMessage);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: true,
                                code: errorMessage.includes("IMAGE_NOT_FOUND")
                                    ? "IMAGE_NOT_FOUND"
                                    : errorMessage.includes("IMAGE_TOO_LARGE")
                                        ? "IMAGE_TOO_LARGE"
                                        : errorMessage.includes("INVALID_ARGS")
                                            ? "INVALID_ARGS"
                                            : "PROCESSING_FAILED",
                                message: errorMessage,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Image Editing MCP server running on stdio");
    }
}
// Start server
const server = new ImageEditingMCPServer();
server.run().catch((error) => {
    console.error("Failed to start Image Editing MCP server:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map