import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isLoggedIn } from "../../api/client";

export default function Header({ showSearch = false, onSearch, searchPlaceholder = "Search tournaments…" }) {
  const navigate = useNavigate();
  const [val, setVal] = useState("");
  
  // Initialize theme from localStorage or default to light
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
      setTheme(savedTheme);
    }
  }, []);

  const handleSearch = (v) => { setVal(v); if (onSearch) onSearch(v); };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <header className="site-header" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="header-row">
        <Link to="/" className="header-brand" aria-label="TheScoreBoard — home" style={{ color: "var(--ink)", cursor: "pointer", textDecoration: "none" }}>
          The<span className="accent" style={{ color: "var(--primary)" }}>Score</span>Board
        </Link>

        {showSearch && (
          <div className="header-search" style={{ flex:1, maxWidth:400, position:"relative", display:"flex", alignItems:"center", margin:"0 20px" }}>
            <span style={{ position:"absolute", left:12, fontSize:13, opacity:.5, pointerEvents:"none", color: "var(--ink)" }}>🔍</span>
            <input
              style={{
                width:"100%", background:"var(--input-bg)",
                border:"1.5px solid var(--input-border)", borderRadius:8,
                padding:"7px 32px 7px 34px", fontSize:13,
                fontFamily:"var(--font-body)", color:"var(--ink)", outline:"none",
              }}
              placeholder={searchPlaceholder}
              value={val}
              onChange={e => handleSearch(e.target.value)}
            />
            {val && (
              <button onClick={() => handleSearch("")}
                style={{ position:"absolute", right:10, background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:14 }}>
                ×
              </button>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, width:32, height:32, cursor:"pointer", color:"var(--ink)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {theme === "light" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>
          {isLoggedIn() ? (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/organiser")} style={{ color: "var(--ink)" }}>Dashboard</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/login")} style={{ color: "var(--ink)" }}>Log in</button>
          )}
        </div>
      </div>
    </header>
  );
}