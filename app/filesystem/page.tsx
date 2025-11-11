"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function FileSystemPage() {
  const { user, isLoaded } = useUser();
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingData, setPairingData] = useState<{
    deviceId: string;
    deviceToken: string;
    pairNonce: string;
    expiresAt: number;
  } | null>(null);

  const handlePairDevice = async () => {
    if (!user) {
      setError("Please sign in first");
      return;
    }

    setPairing(true);
    setError(null);

    try {
      // Get device metadata
      const deviceMetadata = {
        os: navigator.platform.includes("Win") ? "win32" : navigator.platform.includes("Mac") ? "darwin" : "linux",
        arch: navigator.userAgent.includes("x86_64") || navigator.userAgent.includes("x64") ? "amd64" : "arm64",
        hostname: window.location.hostname,
        launcherVersion: "0.1.0",
      };

      // Call pairing endpoint
      const response = await fetch("/api/devices/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceMetadata }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pairing failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      setPairingData(data);

      // Construct protocol URL
      const protocolUrl = `operastudio://connect?device_id=${data.deviceId}&device_token=${data.deviceToken}&pair_nonce=${data.pairNonce}&user_id=${user.id}&origin=${window.location.origin}&expires=${data.expiresAt}`;

      // Open protocol URL
      window.location.href = protocolUrl;

      // Show success message
      setTimeout(() => {
        setPairing(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pair device");
      setPairing(false);
    }
  };

  if (!isLoaded) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">File System</h1>
          <p className="text-muted-foreground">
            Connect your local environment to access files and run commands
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md border border-destructive/20">
            {error}
          </div>
        )}

        {pairingData ? (
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-md space-y-2">
              <p className="text-sm font-medium">Pairing initiated</p>
              <p className="text-xs text-muted-foreground">
                Opening launcher... If it doesn't open automatically, check the launcher console.
              </p>
            </div>
            <Button
              onClick={() => {
                const protocolUrl = `operastudio://connect?device_id=${pairingData.deviceId}&device_token=${pairingData.deviceToken}&pair_nonce=${pairingData.pairNonce}&user_id=${user?.id}&origin=${window.location.origin}&expires=${pairingData.expiresAt}`;
                window.location.href = protocolUrl;
              }}
              className="w-full"
            >
              Open Launcher Again
            </Button>
          </div>
        ) : (
          <Button
            onClick={handlePairDevice}
            disabled={pairing || !user}
            className="w-full"
            size="lg"
          >
            {pairing ? "Pairing..." : "Connect Local Environment"}
          </Button>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Make sure the OperaStudio Launcher is installed and running</p>
          <p>• The launcher will open automatically to complete pairing</p>
          <p>• You'll be able to browse files and run commands securely</p>
        </div>
      </div>
    </div>
  );
}

