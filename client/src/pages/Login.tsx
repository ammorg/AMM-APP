import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronUp, LogIn, Hash } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import ammLogo from "@assets/amm-logo-primary.jpeg";
import aseBadge from "@assets/amm-ase-badge.jpeg";

const DEMO_ACCOUNTS = [
  { username: "admin", password: "admin1234", role: "Admin / Owner", desc: "Full access — all routes, finance, settings, team", pin: null },
  { username: "devon", password: "devon1234", role: "Lead Mechanic", desc: "Assigned jobs, customers, estimator", pin: "1492" },
  { username: "janelle", password: "janelle1234", role: "Mechanic", desc: "Own assigned jobs and related customers", pin: "2837" },
  { username: "remy", password: "remy1234", role: "Mechanic", desc: "Own assigned jobs and related customers", pin: "5501" },
];

function roleBadgeClass(role: string) {
  if (role.includes("Admin")) return "bg-primary/10 text-primary border-primary/20";
  if (role.includes("Lead")) return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200 dark:border-orange-900";
  return "bg-secondary text-secondary-foreground border-border";
}

export default function Login() {
  const { login } = useAuth();
  const [tab, setTab] = useState<"password" | "pin">("pin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  async function handlePinDigit(digit: string) {
    if (loading) return;
    const newPin = (pin + digit).slice(0, 4);
    setPin(newPin);
    setError("");
    if (newPin.length === 4) {
      setLoading(true);
      try {
        const res = await apiRequest("POST", "/api/auth/pin-login", { pin: newPin });
        const data = await res.json();
        if (data.user) {
          window.location.reload();
        } else {
          setError(data.error ?? "Incorrect PIN — please try again.");
          setPin("");
        }
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthorized) {
          setError("Incorrect PIN — please try again.");
        } else if (err instanceof ApiError && err.status >= 500) {
          setError("Server error — please try again shortly.");
        } else if (err instanceof Error && err.message === "Network error") {
          setError("Could not reach the server. Check your connection.");
        } else {
          setError("Incorrect PIN — please try again.");
        }
        setPin("");
      }
      setLoading(false);
    }
  }

  function handlePinBackspace() {
    setPin(p => p.slice(0, -1));
    setError("");
  }

  function fillDemo(acc: typeof DEMO_ACCOUNTS[0]) {
    if (tab === "pin" && acc.pin) {
      setPin(acc.pin);
      setError("");
    } else {
      setTab("password");
      setUsername(acc.username);
      setPassword(acc.password);
      setError("");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col lg:flex-row">

      {/* ── Left panel: AMM branding ── */}
      <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 py-12 bg-zinc-950 relative overflow-hidden">
        {/* Subtle gear accent in background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
          <div className="w-[600px] h-[600px] rounded-full border-[60px] border-red-600" />
        </div>

        {/* AMM Logo — primary brand image */}
        <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-sm">
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 w-72 lg:w-80">
            <img
              src={ammLogo}
              alt="Affordable Mobile Mechanics logo"
              className="w-full h-auto object-cover"
            />
          </div>

          <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
            Lafayette&rsquo;s mobile repair service — we come to you.
          </p>

          {/* Trust strip */}
          <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
            <img
              src={aseBadge}
              alt="ASE Certified"
              className="w-10 h-10 object-contain rounded"
            />
            <div className="text-left">
              <p className="text-white text-xs font-semibold">ASE Certified Technicians</p>
              <p className="text-zinc-400 text-xs">Mobile · Affordable · Reliable</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: login form ── */}
      <div className="lg:w-1/2 flex flex-col items-center justify-center px-6 py-10 bg-background">
        <div className="w-full max-w-sm space-y-4">

          {/* Heading */}
          <div className="text-center mb-2">
            <h1 className="text-lg font-bold tracking-tight">Dispatch Operations</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>

          {/* Tab selector */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "pin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setTab("pin"); setError(""); setPin(""); }}
              data-testid="tab-pin"
            >
              <Hash size={14} /> Staff PIN
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "password" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setTab("password"); setError(""); }}
              data-testid="tab-password"
            >
              <LogIn size={14} /> Password
            </button>
          </div>

          {/* PIN login */}
          {tab === "pin" && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-5 space-y-4">
                <p className="text-sm font-medium text-center">Enter your 4-digit PIN</p>

                {/* PIN dots */}
                <div className="flex justify-center gap-3 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                        i < pin.length
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/40"
                      }`}
                    />
                  ))}
                </div>

                {error && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                  </Alert>
                )}

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-2">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={loading || key === ""}
                      onClick={() => {
                        if (key === "⌫") handlePinBackspace();
                        else if (key !== "") handlePinDigit(key);
                      }}
                      data-testid={key === "⌫" ? "btn-pin-backspace" : key !== "" ? `btn-pin-${key}` : undefined}
                      className={`
                        h-14 rounded-xl text-lg font-semibold transition-all
                        ${key === "" ? "invisible" : ""}
                        ${key === "⌫" ? "text-muted-foreground text-base" : ""}
                        ${key !== "" ? "bg-secondary hover:bg-secondary/80 active:scale-95 disabled:opacity-50" : ""}
                      `}
                    >
                      {loading && key === "0" ? (
                        <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                      ) : key}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Staff PIN login. Admin uses the Password tab.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Password login */}
          {tab === "password" && (
            <Card className="border-border shadow-sm">
              <CardContent className="p-5">
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      data-testid="input-username"
                      placeholder="Enter username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      disabled={loading}
                      aria-required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      data-testid="input-password"
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={loading}
                      aria-required
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="py-2">
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    data-testid="button-login"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <LogIn size={16} />
                        Sign In
                      </span>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Demo credentials panel */}
          <Card className="border-border/60 bg-muted/30">
            <button
              type="button"
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setDemoOpen(o => !o)}
              data-testid="btn-demo-panel"
            >
              <span>Demo accounts</span>
              {demoOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {demoOpen && (
              <div className="px-4 pb-4 space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs text-muted-foreground mb-3">
                  Click any account to prefill credentials.
                </p>
                {DEMO_ACCOUNTS.map(acc => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className="w-full text-left rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 transition-colors p-3 space-y-1"
                    data-testid={`demo-account-${acc.username}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-mono font-semibold text-foreground">{acc.username}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${roleBadgeClass(acc.role)}`}>
                        {acc.role}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{acc.desc}</div>
                    <div className="flex gap-3 text-xs font-mono text-muted-foreground/70">
                      {acc.pin && <span>PIN: <span className="text-primary font-semibold">{acc.pin}</span></span>}
                      <span>pw: {acc.password}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
