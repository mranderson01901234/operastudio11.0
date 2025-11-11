import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isModelReady } from "@/lib/clients/smollm";

/**
 * Background initialization endpoint
 * Called when user signs in to pre-download the model
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Check if model is already ready
    const ready = await isModelReady();
    
    if (ready) {
      return NextResponse.json({
        status: "ready",
        message: "Model is already initialized",
      });
    }

    // Start initialization in background (non-blocking)
    // Trigger initialization - this will start downloading the model
    import("@/lib/clients/smollm")
      .then(async ({ triggerInitialization }) => {
        try {
          await triggerInitialization();
          // Initialization completed
        } catch (error) {
          // Errors are expected during download - model will be ready later
        }
      })
      .catch((error) => {
        // Import errors are fine - will retry on next request
      });

    // Return immediately - initialization happens in background
    return NextResponse.json({
      status: "initializing",
      message: "Model initialization started in background",
    });
  } catch (error) {
    console.error("[Local Model Init API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to initialize model",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Check initialization status
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

