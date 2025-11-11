"use client";

import { useState, useEffect } from "react";
import { SignIn, SignUp, useUser } from "@clerk/nextjs";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolName: string;
}

export function SignInModal({ isOpen, onClose, toolName }: SignInModalProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const { isSignedIn } = useUser();

  // Close modal when user successfully signs in
  useEffect(() => {
    if (isSignedIn && isOpen) {
      onClose();
    }
  }, [isSignedIn, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-hidden">
      <div className="bg-background border border-sidebar-border rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-sidebar-border flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-sidebar-foreground">
              {mode === "sign-up" ? "Create Account" : "Sign In"}
            </h2>
            <p className="text-sm text-sidebar-foreground/70 mt-1">
              {mode === "sign-up" 
                ? `Sign up to access ${toolName}`
                : `Sign in to access ${toolName}`
              }
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0 ml-4"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Clerk Component */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0">
          <div className="w-full max-w-full overflow-x-hidden">
            {mode === "sign-up" ? (
              <SignUp
                appearance={{
                  theme: "dark",
                  elements: {
                    rootBox: "mx-auto w-full max-w-full overflow-x-hidden",
                    card: "shadow-none bg-transparent border-none w-full max-w-full overflow-x-hidden",
                    cardBox: "w-full max-w-full overflow-x-hidden",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton: "bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground border-sidebar-border",
                    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
                    formFieldInput: "bg-background border-sidebar-border text-sidebar-foreground",
                    formFieldLabel: "text-sidebar-foreground/70",
                    footerActionLink: "text-primary hover:text-primary/80",
                    identityPreviewText: "text-sidebar-foreground",
                    identityPreviewEditButton: "text-primary hover:text-primary/80",
                  },
                }}
                routing="hash"
                signInUrl="/sign-in"
              />
            ) : (
              <SignIn
                appearance={{
                  theme: "dark",
                  elements: {
                    rootBox: "mx-auto w-full max-w-full overflow-x-hidden",
                    card: "shadow-none bg-transparent border-none w-full max-w-full overflow-x-hidden",
                    cardBox: "w-full max-w-full overflow-x-hidden",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton: "bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground border-sidebar-border",
                    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
                    formFieldInput: "bg-background border-sidebar-border text-sidebar-foreground",
                    formFieldLabel: "text-sidebar-foreground/70",
                    footerActionLink: "text-primary hover:text-primary/80",
                  },
                }}
                routing="hash"
                signUpUrl="/sign-up"
              />
            )}
          </div>
        </div>

        {/* Footer with mode toggle */}
        <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/30">
          <p className="text-sm text-center text-sidebar-foreground/70">
            {mode === "sign-up" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setMode("sign-in")}
                  className="text-primary hover:text-primary/80 font-medium"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => setMode("sign-up")}
                  className="text-primary hover:text-primary/80 font-medium"
                >
                  Create account
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

