import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wallet, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [{ title: "Sign in — Moneta" }, { name: "description", content: "Sign in to Moneta money manager." }],
  }),
});

function AuthPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const { next } = Route.useSearch();
  const returnTo = next || "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      if (next) window.location.replace(next);
      else nav({ to: "/dashboard", replace: true });
    }
  }, [session, loading, nav, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + returnTo, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        toast.success("Password reset email sent.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + returnTo },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-primary)" }} />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-secondary)" }} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg" style={{ background: "var(--gradient-primary)" }}>
            <Wallet className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Moneta</h1>
          <p className="text-sm text-muted-foreground">Your money, beautifully managed.</p>
        </div>

        <div className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-lg)] backdrop-blur">
          <form onSubmit={submit} className="grid gap-4">
            {mode === "signup" && (
              <div className="grid gap-2">
                <Label>Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {mode !== "forgot" && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Password</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">
                      Forgot?
                    </button>
                  )}
                </div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </div>
            )}
            <Button type="submit" disabled={busy} className="h-11 text-base font-semibold" style={{ background: "var(--gradient-primary)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}
            </Button>

            {mode !== "forgot" && (
              <>
                <div className="relative my-2 text-center text-xs text-muted-foreground">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  <span className="relative bg-card px-3">or</span>
                </div>
                <Button type="button" variant="outline" onClick={google} className="h-11 gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.3h5.9c-.3 1.4-1 2.6-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.3z"/>
                    <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.8c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8C4.1 20.9 7.8 23 12 23z"/>
                    <path fill="#FBBC05" d="M6 14.3c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V7.3H2.3C1.5 8.8 1 10.6 1 12.2s.5 3.4 1.3 4.9L6 14.3z"/>
                    <path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1C17.4 2 14.9 1 12 1 7.8 1 4.1 3.1 2.3 6.3L6 9.1c.9-2.5 3.2-4.4 6-4.4z"/>
                  </svg>
                  Continue with Google
                </Button>
              </>
            )}
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" && (
              <>New here? <button onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">Create an account</button></>
            )}
            {mode === "signup" && (
              <>Already have an account? <button onClick={() => setMode("signin")} className="font-medium text-primary hover:underline">Sign in</button></>
            )}
            {mode === "forgot" && (
              <button onClick={() => setMode("signin")} className="font-medium text-primary hover:underline">Back to sign in</button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}