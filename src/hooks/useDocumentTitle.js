import { useEffect } from "react";
import { getDocumentTitleForTab } from "../utils/documentTitle.js";

export function useDocumentTitle(title) {
  useEffect(() => {
    if (typeof document === "undefined" || !title) return;
    document.title = title;
  }, [title]);
}

export function useTabDocumentTitle(tabId) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = getDocumentTitleForTab(tabId);
  }, [tabId]);
}
