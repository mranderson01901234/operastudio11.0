"use client";

import { useState, useRef } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { Upload, Image as ImageIcon, X, Loader2 } from "lucide-react";

export default function TestUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
    setResult(null);

    // Generate preview
    if (selectedFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(JSON.stringify(data, null, 2));
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clearSelection = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <ImageIcon className="w-8 h-8" />
          Image Upload Test
        </h1>

        <SignedOut>
          <div className="p-6 border rounded-lg bg-card">
            <p className="mb-4 text-muted-foreground">Please sign in to test image upload</p>
            <SignInButton mode="modal">
              <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                Sign In
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center bg-card hover:border-primary/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!file ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-4 w-full"
                >
                  <Upload className="w-16 h-16 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium mb-1">Click to upload image</p>
                    <p className="text-sm text-muted-foreground">
                      JPEG, PNG, WebP, or GIF (max 10MB)
                    </p>
                  </div>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="relative inline-block">
                    {preview && (
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-w-full max-h-64 rounded-lg border"
                      />
                    )}
                    <button
                      onClick={clearSelection}
                      className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">{file.name}</p>
                    <p>{(file.size / 1024).toFixed(1)} KB • {file.type}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Button */}
            {file && !result && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium text-lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Upload Image
                  </>
                )}
              </button>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 border-2 border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                <h3 className="font-bold text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                  <X className="w-5 h-5" />
                  Error
                </h3>
                <pre className="text-xs overflow-auto text-red-900 dark:text-red-200">{error}</pre>
              </div>
            )}

            {/* Success Message */}
            {result && (
              <div className="space-y-6">
                <div className="p-4 border-2 border-green-500 rounded-lg bg-green-50 dark:bg-green-950">
                  <h3 className="font-bold text-green-700 dark:text-green-300 mb-4 text-xl">
                    ✅ Upload Successful!
                  </h3>

                  <div className="space-y-6">
                    {/* Metadata */}
                    <div>
                      <p className="text-sm font-semibold mb-2">Image Metadata:</p>
                      <div className="bg-background p-3 rounded border text-sm space-y-1">
                        <p><span className="font-medium">ID:</span> {result.id}</p>
                        <p><span className="font-medium">Filename:</span> {result.originalName}</p>
                        <p><span className="font-medium">Format:</span> {result.mimeType}</p>
                        <p><span className="font-medium">Size:</span> {(result.sizeBytes / 1024).toFixed(1)} KB</p>
                        <p><span className="font-medium">Dimensions:</span> {result.width} × {result.height} px</p>
                        <p><span className="font-medium">API URL:</span> {result.fullUrl}</p>
                      </div>
                    </div>

                    {/* Thumbnail Preview */}
                    <div>
                      <p className="text-sm font-semibold mb-2">Thumbnail (256x256):</p>
                      <div className="bg-background p-4 rounded border inline-block">
                        <img
                          src={result.thumbnailUrl}
                          alt="Thumbnail"
                          className="rounded"
                        />
                      </div>
                    </div>

                    {/* Preview */}
                    <div>
                      <p className="text-sm font-semibold mb-2">Preview (1024x1024):</p>
                      <div className="bg-background p-4 rounded border">
                        <img
                          src={result.previewUrl}
                          alt="Preview"
                          className="rounded max-w-full mx-auto"
                        />
                      </div>
                    </div>

                    {/* Full Image */}
                    <div>
                      <p className="text-sm font-semibold mb-2">Full Resolution:</p>
                      <div className="bg-background p-4 rounded border">
                        <img
                          src={result.fullUrl}
                          alt="Full"
                          className="rounded max-w-full mx-auto"
                        />
                      </div>
                    </div>

                    {/* Upload Another */}
                    <button
                      onClick={clearSelection}
                      className="w-full px-6 py-3 border-2 rounded-lg hover:bg-muted transition-colors font-medium"
                    >
                      Upload Another Image
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SignedIn>
      </div>
    </div>
  );
}
