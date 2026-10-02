import { useState } from "react";
import { createSponsor, updateSponsor, deleteSponsor } from "../../api/client";
import { MediaUpload } from "../shared/MediaUpload";

const TIERS = [
  { value: "title",   label: "Title Sponsor",   color: "#f59e0b" },
  { value: "gold",    label: "Gold",             color: "#d97706" },
  { value: "silver",  label: "Silver",           color: "#6b7280" },
  { value: "bronze",  label: "Bronze",           color: "#92400e" },
  { value: "partner", label: "Partner",          color: "var(--muted)" },
];

const TIER_META = Object.fromEntries(TIERS.map(t => [t.value, t]));

const BLANK = { name: "", tier: "partner", website: "", contact_phone: "", contact_email: "", description: "", logo_url: "" };

export default function SponsorsSection({ tournamentId, sponsors = [], onRefresh, flash }) {
  const [showForm, setShowForm]   = useState(false);
  const [editing,  setEditing]    = useState(null);   // sponsor_id being edited
  const [form,     setForm]       = useState(BLANK);
  const [saving,   setSaving]     = useState(false);
  const [deleting, setDeleting]   = useState(null);

  const openAdd = () => { setForm(BLANK); setEditing(null); setShowForm(true); };
  const openEdit = (s) => {
    setForm({
      name: s.name, tier: s.tier,
      website: s.website || "", contact_phone: s.contact_phone || "",
      contact_email: s.contact_email || "",
      description: s.description || "", logo_url: s.logo_url || "",
    });
    setEditing(s.sponsor_id);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { flash("Sponsor name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        tier: form.tier,
        logo_url:      form.logo_url      || null,
        website:       form.website.trim()       || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        description:   form.description.trim()   || null,
      };
      if (editing) {
        await updateSponsor(tournamentId, editing, payload);
        flash("Sponsor updated!");
      } else {
        await createSponsor(tournamentId, payload);
        flash("Sponsor added!");
      }
      closeForm();
      onRefresh();
    } catch (e) { flash("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (s) => {
    setDeleting(s.sponsor_id);
    try {
      await deleteSponsor(tournamentId, s.sponsor_id);
      flash("Sponsor removed.");
      onRefresh();
    } catch (e) { flash("Error: " + e.message); }
    finally { setDeleting(null); }
  };

  const byTier = (tier) => sponsors.filter(s => s.tier === tier);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="card-title" style={{ margin: 0 }}>Sponsors</div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Sponsor</button>
      </div>

      {sponsors.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 13 }}>
          No sponsors yet. Add your first sponsor to display them on the public tournament page.
        </div>
      )}

      {/* Sponsor cards grouped by tier */}
      {TIERS.map(({ value: tier, label, color }) => {
        const list = byTier(tier);
        if (!list.length) return null;
        return (
          <div key={tier} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5,
              color, marginBottom: 8, fontFamily: "var(--font-display)",
            }}>{label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map(s => (
                <div key={s.sponsor_id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "var(--elevated)", borderRadius: 10, padding: "10px 14px",
                  border: "1px solid var(--border)",
                }}>
                  {/* Logo */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {s.logo_url
                      ? <img src={s.logo_url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, color: "var(--primary)" }}>
                          {s.name[0].toUpperCase()}
                        </span>
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{s.name}</div>
                    {s.description && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.description}
                      </div>
                    )}
                    {(s.contact_phone || s.contact_email || s.website) && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {s.contact_phone && <span>📞 {s.contact_phone}</span>}
                        {s.contact_email && <span>✉️ {s.contact_email}</span>}
                        {s.website && <span>🔗 {s.website}</span>}
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-danger btn-sm"
                      disabled={deleting === s.sponsor_id}
                      onClick={() => handleDelete(s)}>
                      {deleting === s.sponsor_id ? "…" : "✕"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Add / Edit form */}
      {showForm && (
        <div style={{
          marginTop: 16, background: "var(--bg)", border: "2px solid var(--primary)",
          borderRadius: 12, padding: 20,
        }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: 1, color: "var(--primary)", marginBottom: 16 }}>
            {editing ? "Edit Sponsor" : "New Sponsor"}
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {/* Name */}
            <div className="field">
              <label>Sponsor Name *</label>
              <input className="input" placeholder="e.g. Acme Corp"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Tier */}
            <div className="field">
              <label>Tier</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TIERS.map(t => (
                  <button key={t.value}
                    onClick={() => setForm(f => ({ ...f, tier: t.value }))}
                    style={{
                      padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", transition: "all .15s",
                      border: `1.5px solid ${form.tier === t.value ? t.color : "var(--border)"}`,
                      background: form.tier === t.value ? t.color : "var(--surface)",
                      color: form.tier === t.value ? "#fff" : "var(--muted)",
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logo upload */}
            <div className="field">
              <label>Logo</label>
              <MediaUpload
                label=""
                hint="JPEG / PNG / WebP · max 5 MB · auto-cropped to 1:1"
                bucket="logos"
                resourceType="sponsors"
                resourceId={tournamentId}
                filename={`sponsor-${Date.now()}`}
                enforceAspect="1:1"
                maxWidth={600}
                previewUrl={form.logo_url}
                previewStyle={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                onUploaded={(url) => setForm(f => ({ ...f, logo_url: url }))}
              />
            </div>

            {/* Website */}
            <div className="field">
              <label>Website</label>
              <input className="input" placeholder="https://example.com"
                value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </div>

            {/* Contact phone + email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label>Contact Number</label>
                <input className="input" placeholder="+91 98765 43210"
                  value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
              </div>
              <div className="field">
                <label>Contact Email</label>
                <input className="input" type="email" placeholder="contact@sponsor.com"
                  value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
              </div>
            </div>

            {/* Description */}
            <div className="field">
              <label>About the Sponsor</label>
              <textarea className="input" rows={3}
                placeholder="Brief description shown on the tournament page…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ resize: "vertical" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" onClick={closeForm}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Sponsor"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
