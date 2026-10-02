/**
 * VenuePicker — venue search with Photon (Komoot) geocoder + manual fallback.
 *
 * Photon uses OpenStreetMap data but with far superior POI indexing vs Nominatim —
 * sports venues, turfs, grounds, gyms etc. are much better covered. Free, no API key.
 *
 * If the venue isn't found, the user can switch to "Manual entry" mode and type
 * anything freely — it is stored as plain text (no coordinates).
 *
 * Props
 * ─────
 *   value    – { name, city, state, lat, lng } | null
 *   onChange – (venue | null) => void
 *   placeholder – optional string
 */
import { useState, useRef, useEffect, useCallback } from "react";

const PHOTON_URL = "https://photon.komoot.io/api/";

// Photon returns GeoJSON features — extract readable address parts
function extractAddress(properties = {}) {
  const city  = properties.city  || properties.district  || properties.county || "";
  const state = properties.state || "";
  const name  = properties.name  || "";
  return { name, city, state };
}

// Build a short readable detail line under the result name
function buildDetail(properties = {}) {
  const parts = [];
  if (properties.street)  parts.push(properties.street);
  if (properties.city)    parts.push(properties.city);
  else if (properties.district) parts.push(properties.district);
  if (properties.state)   parts.push(properties.state);
  if (properties.country) parts.push(properties.country);
  return parts.join(", ");
}

// Categorise the result type for a tag chip
function typeLabel(properties = {}) {
  const t  = (properties.type    || "").toLowerCase();
  const ot = (properties.osm_key || "").toLowerCase();
  if (t === "stadium" || ot === "stadium")       return { label: "Stadium",      color: "#7c3aed" };
  if (ot === "sports_centre" || t === "sports_centre") return { label: "Sports Centre", color: "#0369a1" };
  if (t === "pitch" || ot === "pitch")           return { label: "Ground",       color: "#15803d" };
  if (t === "leisure" || ot === "leisure")       return { label: "Leisure",      color: "#0369a1" };
  if (ot === "amenity")                          return { label: "Place",        color: "#92400e" };
  return null;
}

export default function VenuePicker({
  value,
  onChange,
  placeholder = "Search venue, turf, stadium, ground…",
}) {
  const [query,   setQuery]   = useState(value?.name || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [mode,    setMode]    = useState("search"); // "search" | "manual"
  const [manual,  setManual]  = useState({ name: value?.name || "", mapsUrl: "" });

  const debounce = useRef(null);
  const wrapRef  = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // When parent resets value to null, clear everything
  useEffect(() => {
    if (!value) {
      setQuery(""); setResults([]); setOpen(false);
      setManual({ name: "", mapsUrl: "" });
    }
  }, [value]);

  // ── Parse Google Maps URL for coordinates ──────────────────
  const parseGoogleMapsUrl = (url) => {
    if (!url) return { lat: null, lng: null };
    // Format: @lat,lng,zoom  (most common — place links, directions)
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    // Format: q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    // Format: ll=lat,lng
    const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
    return { lat: null, lng: null };
  };

  // ── Search ─────────────────────────────────────────────────
  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      // Bias results towards India, limit to 8
      const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=8&lang=en&bbox=68.1,6.5,97.4,35.7`;
      const res  = await fetch(url);
      const data = await res.json();
      const features = (data.features || []).filter(f => f.properties?.name);
      setResults(features);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    if (value) onChange(null); // clear confirmed selection on re-type
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(v), 300);
  };

  const handleSelect = (feature) => {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const { name, city, state } = extractAddress(props);
    const displayName = name || query;
    onChange({
      name:    displayName,
      city:    city,
      state:   state,
      lat:     coords[1] ?? null,  // Photon is [lng, lat]
      lng:     coords[0] ?? null,
    });
    setQuery(displayName);
    setResults([]);
    setOpen(false);
  };

  // ── Manual mode ────────────────────────────────────────────
  const handleManualSave = () => {
    if (!manual.name.trim()) return;
    const { lat, lng } = parseGoogleMapsUrl(manual.mapsUrl);
    onChange({
      name:  manual.name.trim(),
      city:  "",
      state: "",
      lat:   lat,
      lng:   lng,
    });
  };

  const handleClear = () => {
    setQuery(""); setResults([]); setOpen(false);
    setManual({ name: "", mapsUrl: "" });
    onChange(null);
  };

  const switchToManual = () => {
    setMode("manual");
    setOpen(false);
    setManual(v => ({ ...v, name: query || v.name }));
  };

  const switchToSearch = () => {
    setMode("search");
    setQuery("");
    onChange(null);
  };

  const isConfirmed = !!value?.name;
  const hasCoords   = isConfirmed && !!value?.lat;

  // ── Styles ─────────────────────────────────────────────────
  const inputRowStyle = (focused) => ({
    display: "flex", alignItems: "center",
    border: `1.5px solid ${focused ? "var(--primary, #FF6B35)" : "var(--border)"}`,
    borderRadius: 8,
    background: "var(--input-bg, var(--elevated, #f5f5f5))",
    overflow: "hidden",
    transition: "border-color .15s",
  });

  // ────────────────────────────────────────────────────────────
  // MANUAL MODE
  // ────────────────────────────────────────────────────────────
  if (mode === "manual") {
    return (
      <div ref={wrapRef}>
        <div style={{ background: "var(--elevated)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>
              Manual Venue Entry
            </span>
            <button type="button" onClick={switchToSearch}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--primary, #FF6B35)", fontWeight: 700, padding: 0 }}>
              ← Back to Search
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 5 }}>
              Venue / Ground Name *
            </label>
            <input
              className="input"
              autoFocus
              placeholder="e.g. Green Turf Andheri"
              value={manual.name}
              onChange={e => setManual(v => ({ ...v, name: e.target.value }))}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>

          {/* Google Maps link */}
          {(() => {
            const { lat, lng } = parseGoogleMapsUrl(manual.mapsUrl);
            const validCoords = lat !== null && lng !== null;
            return (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 5 }}>
                  Google Maps Link <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    placeholder="Paste a Google Maps link to pin the location"
                    value={manual.mapsUrl}
                    onChange={e => setManual(v => ({ ...v, mapsUrl: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", paddingRight: validCoords ? 90 : 12, borderRadius: 8, border: `1px solid ${validCoords ? "#16a34a" : "var(--border)"}`, background: "var(--surface)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .15s" }}
                  />
                  {manual.mapsUrl && (
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: validCoords ? "#16a34a" : "#dc2626", pointerEvents: "none" }}>
                      {validCoords ? `✓ ${lat.toFixed(4)}, ${lng.toFixed(4)}` : "No coords"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  Open Google Maps → find your venue → copy the URL from the address bar
                </div>
              </div>
            );
          })()}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleManualSave} disabled={!manual.name.trim()}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: manual.name.trim() ? "var(--primary, #FF6B35)" : "var(--elevated)", color: manual.name.trim() ? "#fff" : "var(--muted)", fontWeight: 700, fontSize: 13, cursor: manual.name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Save Venue →
            </button>
            {value && (
              <button type="button" onClick={handleClear}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Confirmed chip */}
        {isConfirmed && (
          <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: "rgba(255,107,53,.07)", border: "1px solid rgba(255,107,53,.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>✓ {value.name}</div>
            {hasCoords ? (
              <a href={`https://www.google.com/maps?q=${value.lat},${value.lng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--primary, #FF6B35)", textDecoration: "none", padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,107,53,.3)", whiteSpace: "nowrap" }}>
                View on Maps ↗
              </a>
            ) : (
              <span style={{ fontSize: 11, color: "#f59e0b" }}>(no map pin)</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // SEARCH MODE (default)
  // ────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>

      {/* Search input */}
      <div style={inputRowStyle(open)}>
        <span style={{ padding: "0 10px 0 12px", fontSize: 15, flexShrink: 0, color: isConfirmed ? "var(--primary, #FF6B35)" : "var(--muted)" }}>
          📍
        </span>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: 14, padding: "11px 0", fontFamily: "inherit" }}
        />
        {loading && (
          <span style={{ padding: "0 10px", fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>…</span>
        )}
        {(query || value) && !loading && (
          <button type="button" onClick={handleClear}
            style={{ border: "none", background: "none", cursor: "pointer", padding: "0 12px", color: "var(--muted)", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
            ×
          </button>
        )}
      </div>

      {/* Confirmed venue chip */}
      {isConfirmed && (
        <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: "rgba(255,107,53,.07)", border: "1px solid rgba(255,107,53,.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✓ {value.name}
            </div>
            {(value.city || value.state) && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                {[value.city, value.state].filter(Boolean).join(", ")}
                {!hasCoords && <span style={{ color: "#f59e0b", marginLeft: 6 }}>(no map pin)</span>}
              </div>
            )}
          </div>
          {hasCoords && (
            <a
              href={`https://www.google.com/maps?q=${value.lat},${value.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--primary, #FF6B35)", textDecoration: "none", padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,107,53,.3)", whiteSpace: "nowrap" }}
            >
              View on Maps ↗
            </a>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && (results.length > 0 || (!loading && query.length >= 2)) && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,.14)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>

          {results.map((feature, i) => {
            const props  = feature.properties || {};
            const name   = props.name;
            const detail = buildDetail(props);
            const tag    = typeLabel(props);
            return (
              <div key={`${props.osm_id || i}`}
                onClick={() => handleSelect(feature)}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", cursor: "pointer", borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none", transition: "background .1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--elevated)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>📍</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    {tag && (
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, padding: "1px 6px", borderRadius: 20, background: `${tag.color}18`, color: tag.color, border: `1px solid ${tag.color}44`, flexShrink: 0 }}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                  {detail && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {results.length === 0 && !loading && (
            <div style={{ padding: "14px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
              No results found for "{query}"
            </div>
          )}

          {/* Manual entry CTA — always shown at bottom */}
          <div
            onClick={switchToManual}
            style={{ padding: "10px 14px", cursor: "pointer", background: "var(--elevated)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--elevated)"}
          >
            <span style={{ fontSize: 15 }}>✏️</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>Can't find your venue?</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Add it manually — type any name</div>
            </div>
          </div>

        </div>
      )}

      {/* Manual entry link — shown below input when dropdown is closed */}
      {!open && !isConfirmed && (
        <button type="button" onClick={switchToManual}
          style={{ marginTop: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--muted)", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>
          Can't find your venue? Add manually
        </button>
      )}

    </div>
  );
}
