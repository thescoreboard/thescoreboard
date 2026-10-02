import { useCallback } from "react";
import { shareUrl } from "../api/client";

/**
 * Share hook — provides channel-specific share actions.
 *
 * Usage:
 *   const { share, copyLink } = useShare({ type: "tournament", slug: "my-cup" });
 *   share("whatsapp");   // opens WhatsApp with the share URL
 *   copyLink();          // writes link to clipboard
 */
export function useShare({ type, slug, matchId, title = "Check this out on TheScoreBoard!" }) {
  const getUrl = useCallback(() => {
    if (type === "tournament" && slug) return shareUrl.tournament(slug);
    if (type === "match"      && matchId) return shareUrl.match(matchId);
    return window.location.href;
  }, [type, slug, matchId]);

  const share = useCallback((channel) => {
    const url     = getUrl();
    const encoded = encodeURIComponent(url);
    const text    = encodeURIComponent(title);

    const channels = {
      whatsapp: `https://api.whatsapp.com/send?text=${text}%20${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      twitter:  `https://twitter.com/intent/tweet?url=${encoded}&text=${text}`,
    };

    const shareHref = channels[channel];
    if (shareHref) window.open(shareHref, "_blank", "noopener,width=600,height=500");
  }, [getUrl, title]);

  const copyLink = useCallback(async () => {
    const url = getUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fallback for browsers that block clipboard without user gesture
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    }
  }, [getUrl]);

  const shareInstagram = useCallback(async () => {
    // Instagram has no web share URL — copy link then open the app so user can paste.
    await copyLink();
    window.open("https://www.instagram.com/", "_blank", "noopener");
    return "copied";
  }, [copyLink]);

  const nativeShare = useCallback(async () => {
    if (!navigator.share) return false;
    try {
      await navigator.share({ title, url: getUrl() });
      return true;
    } catch {
      return false;
    }
  }, [getUrl, title]);

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return { share, shareInstagram, copyLink, nativeShare, canNativeShare, getUrl };
}
