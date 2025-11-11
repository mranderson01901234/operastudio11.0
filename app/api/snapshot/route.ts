import { NextRequest, NextResponse } from "next/server";
import { snapshotBeforeOperation, recordOperation } from "@/lib/utils/operation-history";

/**
 * POST /api/snapshot
 * Create snapshot before destructive operation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, targetPath } = body;
    
    if (!operation || !targetPath) {
      return NextResponse.json(
        { error: "operation and targetPath are required" },
        { status: 400 }
      );
    }
    
    if (operation !== "write" && operation !== "delete") {
      return NextResponse.json(
        { error: "operation must be 'write' or 'delete'" },
        { status: 400 }
      );
    }
    
    const snapshot = await snapshotBeforeOperation(operation, targetPath);
    
    return NextResponse.json({
      success: true,
      snapshot: snapshot ? {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        operation: snapshot.operation,
        targetPath: snapshot.targetPath,
        backupPath: snapshot.backupPath,
        canRestore: snapshot.canRestore,
      } : null,
    });
  } catch (error) {
    console.error("[Snapshot API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error creating snapshot",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/snapshot
 * Record operation in history
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { operation, args, result, snapshot, error } = body;
    
    if (!operation || !result) {
      return NextResponse.json(
        { error: "operation and result are required" },
        { status: 400 }
      );
    }
    
    const operationId = recordOperation(
      operation,
      args || {},
      result,
      snapshot || undefined,
      error || undefined
    );
    
    return NextResponse.json({
      success: true,
      operationId,
    });
  } catch (error) {
    console.error("[Snapshot API] Error recording operation:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error recording operation",
      },
      { status: 500 }
    );
  }
}

