import { APP_NAME } from "../appBrand.js";
import { formatRoleLabel } from "../auth/authConfig.js";

import { HeaderMailStatus } from "./HeaderMailStatus.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";

import { useAuth } from "../context/AuthContext.jsx";



function AppWordmark() {

  return (

    <svg

      className="app-header__logo-svg"

      viewBox="0 0 40 40"

      aria-hidden="true"

      focusable="false"

    >

      <defs>

        <linearGradient id="appLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">

          <stop offset="0%" stopColor="#f97316" />

          <stop offset="100%" stopColor="#7b1113" />

        </linearGradient>

      </defs>

      <rect width="40" height="40" rx="10" fill="url(#appLogoGradient)" />

      <path

        d="M10 13h20v2.2l-10 6.5-10-6.5V13zm0 5.8l10 6.5 10-6.5V27H10V18.8z"

        fill="#fff"

        opacity="0.95"

      />

      <path

        d="M26 24.5l3.5 3.5 1.8-1.8-3.5-3.5 3.5-3.5-1.8-1.8-3.5 3.5-3.5-3.5-1.8 1.8 3.5 3.5-3.5 3.5 1.8 1.8 3.5-3.5z"

        fill="#fff"

        transform="translate(-2 2) scale(0.55)"

      />

    </svg>

  );

}



export function AppHeader() {

  const { authRequired, user, logout } = useAuth();



  return (

    <header className="app-header">

      <div className="app-header__brand">

        <AppWordmark />

        <h1 className="app-header__title">{APP_NAME}</h1>

      </div>

      <div className="app-header__actions">

        {authRequired && user ? (

          <span className="app-header__user muted">

            {user.displayName} · {formatRoleLabel(user.role)}

          </span>

        ) : null}

        <HeaderMailStatus />

        <ThemeToggle />

        {authRequired && user ? (

          <button

            type="button"

            className="btn btn--secondary btn--small"

            onClick={logout}

          >

            Sign out

          </button>

        ) : null}

      </div>

    </header>

  );

}


