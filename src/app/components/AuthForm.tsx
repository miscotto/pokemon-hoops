"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { PokeButton, PokeCard, PokeInput, TypewriterText } from "./ui";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (result.error) setError(result.error.message || "Sign up failed");
      } else {
        const result = await signIn.email({ email, password });
        if (result.error) setError(result.error.message || "Sign in failed");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Professor Oak speech bubble */}
        <div className="relative">
          <div className="font-pixel text-[6px] text-[var(--color-text-muted)] mb-2 uppercase tracking-widest">
            PROFESSOR OAK SAYS:
          </div>
          <PokeCard className="p-4">
            <div
              className="absolute -top-2 left-6 w-0 h-0"
              style={{
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: "8px solid var(--color-border)",
              }}
            />
            <TypewriterText
              text={["Welcome, Trainer!", "Build your dream Pokemon roster."]}
              speed={45}
              className="text-[8px] leading-loose text-[var(--color-text)]"
            />
          </PokeCard>
        </div>

        {/* Login card */}
        <PokeCard className="p-5 flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <PokeButton
              variant={mode === "login" ? "primary" : "ghost"}
              size="md"
              className="flex-1"
              onClick={() => { setMode("login"); setError(""); }}
            >
              SIGN IN
            </PokeButton>
            <PokeButton
              variant={mode === "signup" ? "primary" : "ghost"}
              size="md"
              className="flex-1"
              onClick={() => { setMode("signup"); setError(""); }}
            >
              SIGN UP
            </PokeButton>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <PokeInput
                label="TRAINER NAME"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ash Ketchum"
              />
            )}
            <PokeInput
              label="EMAIL"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ash@pallet.town"
              required
            />
            <PokeInput
              label="PASSWORD"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />

            {error && (
              <div
                className="font-pixel text-[6px] leading-loose p-2 border-2"
                style={{
                  borderColor: "var(--color-danger)",
                  color: "var(--color-danger)",
                  backgroundColor: "var(--color-surface-alt)",
                }}
              >
                {error}
              </div>
            )}

            <PokeButton
              type="submit"
              variant="primary"
              size="md"
              disabled={loading}
              className="w-full mt-1 py-3 text-[8px]"
            >
              {loading ? "LOADING..." : mode === "login" ? "▶ SIGN IN" : "▶ CREATE ACCOUNT"}
            </PokeButton>
          </form>
        </PokeCard>
      </div>
    </div>
  );
}
