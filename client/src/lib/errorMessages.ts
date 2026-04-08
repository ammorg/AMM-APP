import { ApiError } from "./queryClient";

/**
 * Maps an API error to a user-facing toast { title, description } pair.
 *
 * - 401 / 403 → "Your session expired. Please sign in again."
 * - 400       → validation message from server
 * - network   → connectivity hint
 * - other     → generic save failure
 */
export function mutationErrorToast(
  err: unknown,
  action: string,
): { title: string; description: string } {
  if (err instanceof ApiError) {
    if (err.isSessionExpired) {
      return {
        title: "Session expired",
        description: "Your session expired. Please sign in again.",
      };
    }
    if (err.status === 400) {
      const detail = err.message.replace(/^\d+:\s*/, "");
      return {
        title: `Could not ${action}`,
        description: detail || "Please check the form and try again.",
      };
    }
    if (err.status >= 500) {
      return {
        title: `Could not ${action}`,
        description: "The server encountered an error. Please try again shortly.",
      };
    }
    return {
      title: `Could not ${action}`,
      description: "An unexpected error occurred. Please try again.",
    };
  }

  // Plain network failure (fetch threw, no HTTP response)
  return {
    title: `Could not ${action}`,
    description: "Could not reach the server. Check your connection and try again.",
  };
}
