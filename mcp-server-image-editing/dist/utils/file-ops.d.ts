/**
 * Atomically write image: tmp → fsync → rename
 * Prevents corruption during writes
 */
export declare function writeImageAtomically(buffer: Buffer, mimeType: string): Promise<{
    path: string;
    hash: string;
}>;
//# sourceMappingURL=file-ops.d.ts.map