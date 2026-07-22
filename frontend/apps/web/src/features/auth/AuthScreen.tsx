import { useEffect, useState, type FormEvent } from "react";
import { Database, LogIn } from "lucide-react";
import { ThemeControl } from "../../components/ThemeControl.js";
import { mutate } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type { Status, ThemePreference } from "../../types/domain.js";

export function AuthScreen(props: {
  apiServerUrl: string;
  signUpEnabled: boolean;
  onApiServerChange: (url: string) => Promise<void>;
  onAuthenticated: () => Promise<void>;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [serverDraft, setServerDraft] = useState(props.apiServerUrl);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Use your TablesPro account" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setServerDraft(props.apiServerUrl);
  }, [props.apiServerUrl]);

  useEffect(() => {
    if (!props.signUpEnabled && mode === "sign-up") {
      setMode("sign-in");
    }
  }, [mode, props.signUpEnabled]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ tone: "idle", text: mode === "sign-in" ? "Signing in" : "Creating account" });
    try {
      const path = mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
      await mutate(path, {
        email: email.trim(),
        password,
        ...(mode === "sign-up" ? { name: name.trim() || email.trim() } : {})
      });
      if (mode === "sign-up") {
        await mutate("/api/me/profile", {
          handle: handle.trim() || name.trim() || email.trim().split("@")[0],
          displayName: name.trim() || email.trim()
        }, "PUT");
      }
      await props.onAuthenticated();
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveServer() {
    try {
      await props.onApiServerChange(serverDraft);
      setStatus({ tone: "success", text: "Server updated" });
    } catch (error) {
      setStatus({ tone: "danger", text: errorMessage(error) });
    }
  }

  return (
    <main className="auth-layout">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <div className="auth-card-heading">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              TP
            </div>
            <div>
              <strong>TablesPro</strong>
              <span>{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</span>
            </div>
          </div>
          <ThemeControl value={props.themePreference} onChange={props.onThemeChange} compact />
        </div>

        <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button type="button" aria-selected={mode === "sign-in"} onClick={() => setMode("sign-in")}>
            Sign in
          </button>
          {props.signUpEnabled ? (
            <button type="button" aria-selected={mode === "sign-up"} onClick={() => setMode("sign-up")}>
              Sign up
            </button>
          ) : null}
        </div>

        <div className="server-settings">
          <label className="stacked-field">
            <span>API server</span>
            <input
              type="url"
              spellCheck={false}
              value={serverDraft}
              onChange={(event) => setServerDraft(event.target.value)}
            />
          </label>
          <button type="button" className="small-button" onClick={() => void saveServer()}>
            <Database size={15} />
            Use
          </button>
        </div>

        {mode === "sign-up" ? (
          <>
            <label className="stacked-field">
              <span>Name</span>
              <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="stacked-field">
              <span>User id</span>
              <input autoComplete="username" value={handle} onChange={(event) => setHandle(event.target.value)} />
            </label>
          </>
        ) : null}

        <label className="stacked-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="stacked-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button type="submit" className="command-button" disabled={submitting}>
          <LogIn size={16} />
          {submitting ? "Working" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>

        <p className={`auth-status ${status.tone}`} aria-live="polite">
          {status.text}
        </p>
      </form>
    </main>
  );
}
