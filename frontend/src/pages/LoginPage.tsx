import { useState } from "react";
import { useAuth } from "../state/auth";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { register, login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "register") await register(email, password);
      else await login(email, password);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full grid place-items-center bg-paper">
      <div className="w-full max-w-sm">
        {/* Wordmark — Zo style: serif, large, tight */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 grid place-items-center bg-ink-900 text-paper-50 font-serif text-lg">
              L
            </div>
            <div className="text-left leading-none">
              <div className="text-sm font-medium tracking-tight">Lab</div>
              <div className="text-2xs text-ink-400 uppercase tracking-widest">Automation</div>
            </div>
          </div>
          <h1 className="font-serif text-4xl text-ink-900 tracking-tight leading-none mb-2">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-sm text-ink-400">
            {mode === "login"
              ? "Sign in to manage your agents."
              : "Each agent is a filesystem, not a prompt."}
          </p>
        </div>

        <form onSubmit={submit} className="card">
          <div className="card-body space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            {err && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2">
                {err}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-line flex items-center justify-between bg-paper-100">
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }}
              className="text-xs text-ink-400 hover:text-ink-900 underline underline-offset-2 decoration-ink-300"
            >
              {mode === "login" ? "Create account" : "I have an account"}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? <span className="spinner" /> : <ArrowRight className="w-3.5 h-3.5 stroke-[1.75]" />}
              <span>{mode === "login" ? "Sign in" : "Create account"}</span>
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-2xs text-ink-300 font-mono">
          self-hosted · multi-tenant · v0.1
        </div>
      </div>
    </div>
  );
}
