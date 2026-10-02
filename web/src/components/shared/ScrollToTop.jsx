import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// React Router doesn't reset scroll position on navigation — without this,
// clicking a link while scrolled down (e.g. "About Us" in the footer) lands
// on the new page still scrolled to that same pixel offset. Skips the reset
// when a hash is present so deep links can still scroll
// to their target section (Landing.jsx handles that itself).
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
