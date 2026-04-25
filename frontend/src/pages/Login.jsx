import { useState } from "react";
import { Link } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase environment variables are missing.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          setMessage("Account created. Check your email to confirm the account before signing in.");
        }
      }
    } catch (submitError) {
      setError(submitError.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <section className="panel w-full max-w-md p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">Welcome back</p>
        <h1 className="mt-3 text-3xl font-semibold">Football analytics, tuned to your clubs.</h1>
        <div className="mt-8 flex rounded-full border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "signin" ? "bg-[color:var(--color-accent)] text-slate-950" : "text-[color:var(--color-text-muted)]"
            }`}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "signup" ? "bg-[color:var(--color-accent)] text-slate-950" : "text-[color:var(--color-text-muted)]"
            }`}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
          {!isSupabaseConfigured ? (
            <p className="text-sm text-amber-200">
              Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment to enable auth.
            </p>
          ) : null}
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-[color:var(--color-text-muted)]">
          {mode === "signin" ? "Need a new account?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="text-[color:var(--color-accent)]"
            onClick={() => {
              setError("");
              setMessage("");
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
        <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
          Onboarding stays at <Link to="/onboarding" className="text-[color:var(--color-accent)]">/onboarding</Link> after login.
        </p>
      </section>
    </main>
  );
}
