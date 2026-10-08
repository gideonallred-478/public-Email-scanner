import { useAuth } from "../context/AuthContext.jsx";
import { getTabsForRole, canReviewSiteListSuggestions } from "../auth/rolePermissions.js";
import { useSiteLists } from "../context/SiteListsContext.jsx";

export function TabNavigation({ activeTab, onTabChange }) {
  const { user } = useAuth();
  const { pendingSuggestions } = useSiteLists();
  const tabs = getTabsForRole(user?.role);
  const showSuggestionBadge =
    canReviewSiteListSuggestions(user?.role) && pendingSuggestions.length > 0;

  return (
    <nav className="app-nav" aria-label="Main navigation">
      <div className="app-nav__inner">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`app-nav__tab${
              activeTab === tab.id ? " app-nav__tab--active" : ""
            }`}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {tab.id === "site-lists" && showSuggestionBadge ? (
              <span
                className="app-nav__tab-badge"
                aria-label={`${pendingSuggestions.length} pending site list suggestions`}
              >
                {pendingSuggestions.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
