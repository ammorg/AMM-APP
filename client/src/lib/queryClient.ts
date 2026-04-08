import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ── ApiError ─────────────────────────────────────────────────────────────────
// Structured error that carries HTTP status so callers can branch on 401/403
// separately from true network failures.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isSessionExpired() {
    return this.status === 401 || this.status === 403;
  }
}

// ── Helper: throw ApiError for non-OK responses ───────────────────────────────
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message: string;
    try {
      const body = await res.json();
      message = body?.error ?? body?.message ?? res.statusText;
    } catch {
      message = (await res.text().catch(() => "")) || res.statusText;
    }
    throw new ApiError(res.status, `${res.status}: ${message}`);
  }
}

// ── apiRequest ────────────────────────────────────────────────────────────────
// Throws ApiError (with .status) on non-OK responses.
// Throws a plain Error with message "Network error" when fetch itself fails
// (no internet, DNS failure, etc.).
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch {
    throw new Error("Network error");
  }

  await throwIfResNotOk(res);
  return res;
}

// ── getQueryFn ────────────────────────────────────────────────────────────────
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
        credentials: "include",
      });
    } catch {
      throw new Error("Network error");
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
