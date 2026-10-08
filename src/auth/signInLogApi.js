import { apiFetch } from "../api/apiClient.js";

const AUTH_LOG_API = "/api/auth/sign-in-log";

export async function fetchSignInLog() {
  try {
    const result = await apiFetch(AUTH_LOG_API);
    if (!result.ok) {
      return {
        ok: false,
        entries: [],
        message:
          result.payload?.message ??
          `Sign-in log unavailable (${result.status}). Check your session or restart npm run dev.`,
      };
    }
    return result.payload;
  } catch (error) {
    return {
      ok: false,
      entries: [],
      message:
        error instanceof Error
          ? error.message
          : "Sign-in log unreachable. Run npm run dev to start the local bridge.",
    };
  }
}
