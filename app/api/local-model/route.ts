import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText, isModelReady } from "@/lib/clients/smollm";
import { analyzeTask, getLocalModelPrompt } from "@/lib/chat/task-router";

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { prompt, taskType, context } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Import the generateText function
    const { generateText } = await import("@/lib/clients/smollm");

    // Analyze task if not provided
    const analysis = taskType 
      ? { type: taskType as "local" | "gemini", confidence: 1.0, reason: "Explicit task type" }
      : analyzeTask(prompt, context);

    // Only proceed if task is suitable for local model
    if (analysis.type !== "local") {
      return NextResponse.json(
        { error: "Task is not suitable for local model", analysis },
        { status: 400 }
      );
    }

    // Check if model is actually ready before proceeding
    const { isModelReady } = await import("@/lib/clients/smollm");
    const modelReady = await isModelReady();
    
    if (!modelReady) {
      // Model not ready - silently fall back to Gemini
      // Return a flag so client knows to use Gemini
      return NextResponse.json(
        { 
          error: "Model not ready",
          fallback: true,
        },
        { status: 503 }
      );
    }

    // Get task-specific prompt
    const formattedPrompt = getLocalModelPrompt(
      prompt,
      taskType || "general",
      context
    );

    // Generate response
    const startTime = Date.now();
    
    try {
      const response = await generateText(formattedPrompt, {
        maxLength: 512,
        temperature: 0.7,
        topP: 0.9,
        doSample: true,
      });
      const duration = Date.now() - startTime;
      
      return NextResponse.json({
        response,
        metadata: {
          model: "SmolLM2-360M",
          duration,
          taskType: analysis.type,
          confidence: analysis.confidence,
        },
      });
    } catch (genError) {
      // Silent error - fall back to Gemini
      return NextResponse.json(
        {
          error: "Generation failed",
          fallback: true,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    // Silent error - fall back to Gemini
    return NextResponse.json(
      {
        error: "Request failed",
        fallback: true,
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  try {
    const ready = await isModelReady();
    return NextResponse.json({
      ready,
      model: "SmolLM2-360M",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}

