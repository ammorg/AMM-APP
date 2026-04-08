import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest, ApiError } from "./queryClient";
import { queryClient } from "./queryClient";

export type UserRole = "admin" | "lead_mechanic" | "mechanic";

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  staffId: number | null;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  isAdmin: () => boolean;
  isLeadMechanic: () => boolean;
  isMechanic: () => boolean;
  canAccessFinance: () => boolean;
  canAccessSettings: () => boolean;
  canAccessTeam: () => boolean;
  canAccessEstimatorConfig: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check if there's an active session
  useEffect(() => {
    apiRequest("GET", "/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      })
      .catch(() => {
        // No session or network issue — that's fine at startup
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(username: string, password: string): Promise<{ error?: string }> {
    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const data = await res.json();
      setUser(data.user);
      // Invalidate all queries so data refreshes with new auth context
      queryClient.clear();
      return {};
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 400) {
          // The server returned a specific auth failure — surface it directly
          const bodyMessage = err.message.replace(/^\d+:\s*/, "");
          return { error: bodyMessage || "Invalid username or password." };
        }
        if (err.status >= 500) {
          return { error: "The server encountered an error. Please try again shortly." };
        }
        return { error: "Sign-in failed. Please try again." };
      }
      // Plain network failure (fetch threw, no response at all)
      return { error: "Could not reach the server. Check your connection and try again." };
    }
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // Best-effort logout — clear local state regardless
    }
    setUser(null);
    queryClient.clear();
  }

  const isAdmin = () => user?.role === "admin";
  const isLeadMechanic = () => user?.role === "lead_mechanic";
  const isMechanic = () => user?.role === "mechanic";
  const canAccessFinance = () => user?.role === "admin";
  const canAccessSettings = () => user?.role === "admin";
  const canAccessTeam = () => user?.role === "admin" || user?.role === "lead_mechanic";
  const canAccessEstimatorConfig = () => user?.role === "admin";

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      login, logout,
      isAdmin, isLeadMechanic, isMechanic,
      canAccessFinance, canAccessSettings, canAccessTeam, canAccessEstimatorConfig,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
