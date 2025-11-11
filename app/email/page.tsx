"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useEmail } from "@/contexts/email-context";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function EmailPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkEmailAccount, state } = useEmail();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const success = searchParams.get("success");
  const errorParam = searchParams.get("error");

  useEffect(() => {
    checkEmailAccount();
  }, [checkEmailAccount]);

  useEffect(() => {
    if (success === "true") {
      // Redirect to home after successful connection
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
  }, [success, router]);

  useEffect(() => {
    if (errorParam) {
      const details = searchParams.get("details");
      let errorMessage = "";
      
      switch (errorParam) {
        case "unauthorized":
          errorMessage = "Please sign in first";
          break;
        case "no_code":
          errorMessage = "Authorization code not received";
          break;
        case "token_exchange_failed":
          errorMessage = "Failed to exchange authorization code";
          break;
        case "no_access_token":
          errorMessage = "No access token received from Google";
          break;
        case "user_info_failed":
          errorMessage = details 
            ? `Failed to fetch user information: ${decodeURIComponent(details)}`
            : "Failed to fetch user information";
          break;
        case "user_info_fetch_error":
          errorMessage = "Error fetching user information";
          break;
        case "no_email_in_response":
          errorMessage = "No email address found in response";
          break;
        case "internal_error":
          errorMessage = "An internal error occurred";
          break;
        default:
          errorMessage = "An error occurred during connection";
      }
      
      setError(errorMessage);
    }
  }, [errorParam, searchParams]);

  const handleConnectGmail = async () => {
    if (!user) {
      setError("Please sign in first");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/email/gmail/connect");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to initiate connection");
      }

      const data = await response.json();
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Gmail");
      setConnecting(false);
    }
  };

  if (!isLoaded) {
    return <div className="p-8">Loading...</div>;
  }

  if (state.hasEmailAccount) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-2xl font-semibold">Gmail Connected</h1>
            <p className="text-muted-foreground">
              Your Gmail account is connected and ready to use.
            </p>
          </div>
          <Button onClick={() => router.push("/")} className="w-full" size="lg">
            Go to Email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Connect Gmail</h1>
          <p className="text-muted-foreground">
            Connect your Gmail account to view and manage emails
          </p>
        </div>

        {success === "true" && (
          <div className="bg-green-500/10 text-green-500 p-4 rounded-md border border-green-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <p className="text-sm font-medium">Successfully connected!</p>
            </div>
            <p className="text-xs mt-1">Redirecting...</p>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md border border-destructive/20">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        <Button
          onClick={handleConnectGmail}
          disabled={connecting || !user}
          className="w-full"
          size="lg"
        >
          {connecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            "Connect Gmail"
          )}
        </Button>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• You'll be redirected to Google to authorize access</p>
          <p>• We'll only access emails you've authorized</p>
          <p>• You can disconnect at any time</p>
        </div>
      </div>
    </div>
  );
}

