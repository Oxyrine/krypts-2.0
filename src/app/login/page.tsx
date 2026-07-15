"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Shield, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ShaderAnimation = lazy(() => import("@/components/ui/shader-animation").then(m => ({ default: m.ShaderAnimation })));

// ---------------------------------------------------------------------------
// Developer Quick Login — DEVELOPMENT ONLY
// Stores only email addresses (no passwords) for rapid account switching.
// NEVER expose this UI in production builds.
// ---------------------------------------------------------------------------

function QuickLoginButtons({ onSelect }: { onSelect: (email: string) => void }) {
  const [savedEmails, setSavedEmails] = useState<string[]>([]);

  const loadEmails = () => {
    try {
      // Migration: clean up any old entries that stored passwords
      const raw = localStorage.getItem("quickLogins");
      if (raw) {
        const parsed = JSON.parse(raw);
        // Legacy format was [{email, password}]; strip passwords immediately
        const emails: string[] = parsed.map((e: any) =>
          typeof e === "string" ? e : e.email
        );
        localStorage.setItem("quickLogins", JSON.stringify(emails));
        setSavedEmails(emails);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadEmails();
    window.addEventListener("storage", loadEmails);
    return () => window.removeEventListener("storage", loadEmails);
  }, []);

  if (savedEmails.length === 0) {
    return <p className="text-xs text-surface-50 italic text-center py-2">No quick logins saved yet. Enter an email above then click + Save.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {savedEmails.map((email, i) => (
        <div key={i} className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={() => onSelect(email)}
            title={email}
          >
            {email.split("@")[0]}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[10px] text-destructive h-7 w-7 p-0"
            onClick={() => {
              const updated = savedEmails.filter((x) => x !== email);
              localStorage.setItem("quickLogins", JSON.stringify(updated));
              setSavedEmails(updated);
            }}
          >
            x
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Logged in successfully!");
      router.push("/dashboard");
    } catch (err: any) {
      const msg = err.message || "Login failed.";
      if (err.status === 403) {
        toast.error(msg, { description: "Contact support if you believe this is an error." });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark relative flex min-h-screen items-center justify-center p-4 overflow-hidden bg-just-black font-mori">

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-shockingly-green/30 bg-shockingly-green/10">
            <Shield className="h-6 w-6 text-shockingly-green" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-surface-cream">Krypts DRM</h1>
          <p className="text-sm text-surface-50">Sign in to your account</p>
        </div>

        <Card className="border-surface-25/50 bg-off-black backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-surface-cream">Welcome back</CardTitle>
            <CardDescription className="text-surface-50">Enter your credentials to access your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>

              {/* ─── Developer Quick Login ─── DEV ENVIRONMENT ONLY ─── */}
              <div className="mt-6 border-t border-amber-500/30 pt-4">
                <div className="flex items-center gap-2 mb-2 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                  <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
                  <p className="text-[10px] text-amber-400 font-medium">DEV ONLY — Quick Email Switcher</p>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-surface-50">Saved emails (enter password manually)</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 px-2 text-shockingly-green"
                    onClick={() => {
                      if (!email) {
                        toast.error("Enter an email address first.");
                        return;
                      }
                      const existing: string[] = JSON.parse(localStorage.getItem("quickLogins") || "[]");
                      if (!existing.includes(email)) {
                        const updated = [...existing, email];
                        localStorage.setItem("quickLogins", JSON.stringify(updated));
                        toast.success(`Saved ${email}`);
                        window.dispatchEvent(new Event("storage"));
                      } else {
                        toast.error("Email already saved.");
                      }
                    }}
                  >
                    + Save Email
                  </Button>
                </div>

                <QuickLoginButtons
                  onSelect={(e) => {
                    // Only fills in the email — password must be entered manually.
                    // Passwords are never stored.
                    setEmail(e);
                    toast.info("Email filled in. Enter your password to continue.");
                  }}
                />
              </div>
            </form>

            <div className="mt-4 text-center text-sm text-surface-50">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-shockingly-green hover:underline">
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          Protected by Krypts DRM • AES-256 Encrypted
        </p>
      </div>
    </div>
  );
}
