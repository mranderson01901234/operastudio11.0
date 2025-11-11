import { NextRequest, NextResponse } from "next/server";
import { undoLastOperation } from "@/lib/utils/operation-history";

/**
 * POST /api/undo
 * Undo the last destructive file operation
 */
export async function POST(request: NextRequest) {
  try {
    const undoResult = await undoLastOperation();
    
    if (undoResult.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully undone: ${undoResult.operation}`,
        operation: undoResult.operation,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: undoResult.error || "Failed to undo operation",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[Undo API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during undo",
      },
      { status: 500 }
    );
  }
}

