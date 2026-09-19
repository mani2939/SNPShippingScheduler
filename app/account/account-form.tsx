"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Package,
  ArrowRight,
  ArrowUpRight,
  Mail,
  LockKeyhole,
} from "lucide-react";
type Mode = "login" | "register" | "forgot" | "resend" | "verify" | "reset";
const modes: Mode[] = [
  "login",
  "register",
  "forgot",
  "resend",
  "verify",
  "reset",
];
const headings: Record<Mode, string> = {
  login: "Welcome back.",
  register: "Create your account.",
  forgot: "Forgot your password?",
  resend: "Verify your email.",
  verify: "Confirm your email.",
  reset: "Choose a new password.",
};
const descriptions: Record<Mode, string> = {
  login: "Sign in to arrange your next dispatch.",
  register: "Register and verify your email to book a dispatch.",
  forgot: "We’ll email you a link to reset your password.",
  resend: "Enter your email to request a new verification link.",
  verify: "Enter the password you chose when registering to verify your email.",
  reset: "Use a new password with at least 12 characters.",
};
export default function AccountForm({
  initialMode,
  initialToken,
}: {
  initialMode: string;
  initialToken: string;
}) {
  const [mode, setMode] = useState<Mode>(
    modes.includes(initialMode as Mode) ? (initialMode as Mode) : "login",
  );
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    if (initialToken)
      window.history.replaceState(null, "", `/account?mode=${mode}`);
  }, []);
  function change(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setDone(false);
    setPassword("");
    setConfirmPassword("");
    window.history.replaceState(
      null,
      "",
      next === "login" ? "/account" : `/account?mode=${next}`,
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (
      (mode === "register" || mode === "reset") &&
      password !== confirmPassword
    ) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          name,
          email,
          password,
          token: initialToken,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (mode === "login") {
        window.location.assign("/");
        return;
      }
      setMessage(data.message);
      setPassword("");
      setConfirmPassword("");
      if (mode === "verify" || mode === "reset") setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const usesEmail = ["login", "register", "forgot", "resend"].includes(mode),
    usesPassword = ["login", "register", "verify", "reset"].includes(mode);
  return (
    <>
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Package size={23} />
          </span>
          <span>
            SNP<span className="brand-light">dispatch</span>
          </span>
        </Link>
        <Link href="/admin" className="admin-link">
          Admin portal <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="account-main">
        <section className="panel account-card">
          <div className="account-symbol">
            <LockKeyhole size={24} />
          </div>
          <div className="eyebrow">CUSTOMER ACCOUNT</div>
          <h1>{headings[mode]}</h1>
          <p className="muted">{descriptions[mode]}</p>
          {["login", "register"].includes(mode) && (
            <nav className="account-tabs" aria-label="Account access">
              <button
                type="button"
                disabled={busy}
                aria-pressed={mode === "login"}
                onClick={() => change("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={mode === "register"}
                onClick={() => change("register")}
              >
                Register
              </button>
            </nav>
          )}
          {message && (
            <div role="status" className="status-message">
              <Mail size={18} />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {!done ? (
            <form onSubmit={submit}>
              <fieldset disabled={busy} className="account-fields">
                {mode === "register" && (
                  <>
                    <label htmlFor="customer-name">Full name</label>
                    <input
                      id="customer-name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </>
                )}
                {usesEmail && (
                  <>
                    <label htmlFor="customer-email">Email address</label>
                    <input
                      id="customer-email"
                      type="email"
                      autoComplete="username"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </>
                )}
                {usesPassword && (
                  <>
                    <label htmlFor="customer-password">
                      {mode === "reset" ? "New password" : "Password"}
                    </label>
                    <input
                      id="customer-password"
                      type="password"
                      autoComplete={
                        mode === "register" || mode === "reset"
                          ? "new-password"
                          : "current-password"
                      }
                      required
                      minLength={
                        mode === "register" || mode === "reset" ? 12 : 1
                      }
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </>
                )}
                {(mode === "register" || mode === "reset") && (
                  <>
                    <p className="password-hint">
                      Use 12–128 characters. A long, unique passphrase works
                      well.
                    </p>
                    <label htmlFor="confirm-password">Confirm password</label>
                    <input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </>
                )}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (["verify", "reset"].includes(mode) && !initialToken)
                  }
                >
                  {busy
                    ? "Please wait…"
                    : {
                        login: "Sign in",
                        register: "Create account",
                        forgot: "Send reset link",
                        resend: "Send verification link",
                        verify: "Verify email",
                        reset: "Save new password",
                      }[mode]}
                  <ArrowRight size={17} />
                </button>
              </fieldset>
            </form>
          ) : (
            <button className="primary" onClick={() => change("login")}>
              Continue to sign in <ArrowRight size={17} />
            </button>
          )}
          {mode === "login" ? (
            <div className="account-links">
              <button disabled={busy} onClick={() => change("forgot")}>
                Forgot password?
              </button>
              <button disabled={busy} onClick={() => change("resend")}>
                Resend verification email
              </button>
            </div>
          ) : (
            !done && (
              <div className="account-links">
                <button disabled={busy} onClick={() => change("login")}>
                  Back to sign in
                </button>
                {["verify", "reset"].includes(mode) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      change(mode === "verify" ? "resend" : "forgot")
                    }
                  >
                    Request a new link
                  </button>
                )}
              </div>
            )
          )}
        </section>
        <p className="account-footer">
          Shipment dispatch on Monday, Wednesday and Friday.
        </p>
      </main>
    </>
  );
}
