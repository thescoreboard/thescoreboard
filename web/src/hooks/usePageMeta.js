import { useEffect } from "react";

const SITE_TITLE = "TheScoreBoard — Find Local Sports Tournaments & Live Scores";

/**
 * Sets the document title (and optionally meta description) for a page,
 * restoring the site-wide defaults on unmount. SPA routes all share
 * index.html, so without this every page shows the same title in search
 * results and browser tabs.
 */
export default function usePageMeta(title, description) {
  useEffect(() => {
    if (title) document.title = `${title} | TheScoreBoard`;

    const meta = document.querySelector('meta[name="description"]');
    const prevDescription = meta?.getAttribute("content");
    if (description && meta) meta.setAttribute("content", description);

    return () => {
      document.title = SITE_TITLE;
      if (description && meta && prevDescription) meta.setAttribute("content", prevDescription);
    };
  }, [title, description]);
}
