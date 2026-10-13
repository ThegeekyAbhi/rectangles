import { useSyncExternalStore } from "react";

type AppliedTheme = "light" | "dark";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    observer.disconnect();
  };
}

function readAppliedTheme(): AppliedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The theme whose colours are on the page right now. It changes only once the page's
 * colour tokens have changed, so it is safe to read token values in response to it;
 * the theme setting itself changes a moment before the tokens do.
 */
export function useAppliedTheme(): AppliedTheme {
  return useSyncExternalStore(subscribe, readAppliedTheme, () => "light");
}
