"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Shield, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ShaderAnimation = lazy(() => import("@/components/ui/shader-animation").then(m => ({ default: m.ShaderAnimation })));

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }
    if (!termsAccepted) {
      toast.error("You must agree to the Terms of Service.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, fullName || undefined);
      toast.success("Account created! Welcome to Krypts.");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Sign up failed.");
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
          <p className="text-sm text-surface-50">Create your account</p>
        </div>

        <Card className="border-surface-25/50 bg-off-black backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-surface-cream">Get started for free</CardTitle>
            <CardDescription className="text-surface-50">Protect your digital content in minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name (optional)</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jane Smith"
                    className="pl-9"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>

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
                    placeholder="Min. 6 characters"
                    className="pl-9 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={6}
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

              <div className="flex items-start space-x-2 pt-2 pb-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-surface-25/50 bg-off-black text-shockingly-green focus:ring-shockingly-green"
                />
                <Label htmlFor="terms" className="text-sm font-normal text-surface-50 leading-snug">
                  I agree to the{" "}
                  <Dialog>
                    <DialogTrigger className="text-shockingly-green hover:underline">
                      Terms of Service
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-off-black border-surface-25/50 text-surface-cream sm:rounded-xl">
                      <DialogHeader>
                        <DialogTitle className="text-xl">Krypts Terms of Service</DialogTitle>
                        <DialogDescription className="text-surface-50">
                          Last updated: July 2026
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 text-sm mt-4 text-surface-cream/80 leading-relaxed">
                        <p><strong>1. Acceptance of Terms</strong><br/>By accessing or using Krypts DRM, you agree to be bound by these Terms of Service. If you do not agree, you may not use our services.</p>
                        <p><strong>2. Description of Service</strong><br/>Krypts DRM provides digital rights management tools, secure hosting, and access control for digital content. You are solely responsible for ensuring you have the legal right and copyright ownership to distribute any content you upload.</p>
                        <p><strong>3. Acceptable Use</strong><br/>You may not use our service for any illegal activities, distributing malware, or infringing on intellectual property rights. We reserve the right to suspend or ban accounts that violate these terms or generate excessively high risk scores.</p>
                        <p><strong>4. Privacy & Data</strong><br/>We encrypt and protect your files using AES-256. We do not access the raw contents of your protected files without your explicit consent or as required by a lawful subpoena. Refer to our Privacy Policy for details on data retention.</p>
                        <p><strong>5. Limitation of Liability</strong><br/>Krypts DRM is provided "as is" without any warranties. We are not liable for any data loss, piracy bypasses, unauthorized distributions, or business interruptions. Your use of the platform is at your own risk.</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {" "}and Privacy Policy.
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-surface-50">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-shockingly-green hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-500">
          AES-256 Encrypted • Zero-Knowledge Architecture
        </p>
      </div>
    </div>
  );
}
