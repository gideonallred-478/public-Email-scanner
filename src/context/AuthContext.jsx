import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  authenticateLocalUser,
  isAuthRequired,
  getDemoPreviewUser,
} from "../auth/authConfig.js";
import { setAuthToken, getAuthToken } from "../api/apiClient.js";
import {
  fetchSharedDataStatus,
  fetchServerSession,
  isSharedDataActive,
  loginWithServer,
  logoutFromServer,
} from "../api/sharedDataApi.js";

const AUTH_SESSION_KEY = "senior-email-scanner-auth-session";

const AuthContext = createContext(null);

function persistSession(user) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!user) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
  } catch {
    // ignore storage failures
  }
}

export function AuthProvider({ children }) {
  const authRequired = isAuthRequired();
  const [user, setUser] = useState(() => getDemoPreviewUser());
  const [loginError, setLoginError] = useState("");
  const [sharedDataReady, setSharedDataReady] = useState(false);
  const [useSharedAuth, setUseSharedAuth] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(authRequired);

  useEffect(() => {
    if (!authRequired) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const status = await fetchSharedDataStatus();
        if (cancelled) return;

        const shared = Boolean(status?.enabled);
        setUseSharedAuth(shared);

        if (shared && getAuthToken()) {
          const session = await fetchServerSession();
          if (!cancelled && session.ok && session.payload?.user) {
            setUser(session.payload.user);
            persistSession(session.payload.user);
            setBootstrapping(false);
            return;
          }
          setAuthToken("");
        }

        if (!shared) {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        if (!cancelled) {
          setSharedDataReady(true);
          setBootstrapping(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authRequired]);

  const login = useCallback(
    async (username, password) => {
      if (useSharedAuth) {
        const result = await loginWithServer(username, password);
        if (!result.ok || !result.payload?.ok) {
          const message =
            result.payload?.message ?? "Invalid username or password.";
          setLoginError(message);
          return { ok: false, error: message };
        }

        const account = result.payload.user;
        setLoginError("");
        setUser(account);
        persistSession(account);
        setAuthToken(result.payload.token ?? "");
        return { ok: true, user: account };
      }

      const account = authenticateLocalUser(username, password);
      if (!account) {
        setLoginError("Invalid username or password.");
        return { ok: false, error: "Invalid username or password." };
      }

      setLoginError("");
      setUser(account);
      persistSession(account);
      return { ok: true, user: account };
    },
    [useSharedAuth]
  );

  const logout = useCallback(async () => {
    if (useSharedAuth) {
      await logoutFromServer();
      setAuthToken("");
    }
    setLoginError("");
    setUser(null);
    persistSession(null);
  }, [useSharedAuth]);

  const value = useMemo(
    () => ({
      authRequired,
      user,
      isAuthenticated: !authRequired || Boolean(user),
      bootstrapping,
      sharedDataReady,
      useSharedData: useSharedAuth && isSharedDataActive(),
      login,
      logout,
      loginError,
      clearLoginError: () => setLoginError(""),
    }),
    [
      authRequired,
      user,
      bootstrapping,
      sharedDataReady,
      useSharedAuth,
      login,
      logout,
      loginError,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
