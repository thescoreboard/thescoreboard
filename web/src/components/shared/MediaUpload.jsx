import { useRef, useState, useCallback } from "react";
import { useUpload } from "../../hooks/useUpload";
import { storagePath } from "../../services/uploadService";

const ACCEPTED = "image/jpeg,image/png,image/webp";

// Crops to the target aspect ratio (center crop) and resizes to maxPx width.
// Always outputs JPEG. Returns a new File.
function cropAndResize(file, aspectStr, maxPx) {
  return new Promise((resolve) => {
    const img = new Image();
    const tempUrl = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(tempUrl); resolve(file); };
    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      const [aw, ah] = aspectStr.split(":").map(Number);
      const targetRatio = aw / ah;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const imgRatio = iw / ih;

      let sx = 0, sy = 0, sw = iw, sh = ih;
      if (imgRatio > targetRatio) {
        sw = Math.round(ih * targetRatio);
        sx = Math.round((iw - sw) / 2);
      } else {
        sh = Math.round(iw / targetRatio);
        sy = Math.round((ih - sh) / 2);
      }

      let dw = sw, dh = sh;
      if (maxPx && dw > maxPx) {
        dw = maxPx;
        dh = Math.round(maxPx / targetRatio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })),
        "image/jpeg", 0.92
      );
    };
    img.src = tempUrl;
  });
}

/**
 * MediaUpload — drag-and-drop / click-to-browse image uploader.
 *
 * Props:
 *   bucket:         string  — Supabase bucket name
 *   resourceType:   string  — path prefix, e.g. "tournaments"
 *   resourceId:     number  — resource ID used in the storage path
 *   onUploaded:     fn(url) — called with the public CDN URL when done
 *   label?:         string  — label shown above the zone
 *   hint?:          string  — helper text shown below label
 *   filename?:      string  — fixed filename stem (e.g. "poster", "logo")
 *   previewUrl?:    string  — initial preview image URL (existing value)
 *   enforceAspect?: string  — crop to this aspect before upload, e.g. "16:9" | "1:1" | "3:4"
 *   maxWidth?:      number  — max output width in px (default 1920)
 *   previewStyle?:  object  — override img style (e.g. objectFit, aspectRatio)
 */
export function MediaUpload({
  bucket, resourceType, resourceId, onUploaded,
  label, hint, filename, previewUrl,
  enforceAspect, maxWidth = 1920,
  previewStyle,
}) {
  const { upload, uploading, progress, error } = useUpload();
  const [preview, setPreview]   = useState(previewUrl || null);
  const [dragging, setDragging] = useState(false);
  const inputRef                = useRef(null);

  const handleFile = useCallback(async (rawFile) => {
    if (!rawFile || !rawFile.type.startsWith("image/")) return;

    // Immediate raw preview
    const rawUrl = URL.createObjectURL(rawFile);
    setPreview(rawUrl);

    let file = rawFile;
    if (enforceAspect) {
      file = await cropAndResize(rawFile, enforceAspect, maxWidth);
      URL.revokeObjectURL(rawUrl);
      const croppedUrl = URL.createObjectURL(file);
      setPreview(croppedUrl);
    }

    const ext  = enforceAspect ? "jpg" : (rawFile.name || "upload").split(".").pop().toLowerCase() || "jpg";
    const path = filename
      ? `${resourceType}/${resourceId}/${filename}.${ext}`
      : storagePath(resourceType, resourceId, file);

    try {
      const url = await upload({ file, bucket, path });
      setPreview(url);
      onUploaded?.(url);
    } catch {
      setPreview(previewUrl || null);
    }
  }, [bucket, resourceType, resourceId, upload, onUploaded, previewUrl, enforceAspect, maxWidth, filename]);

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const defaultPreviewStyle = enforceAspect === "1:1"
    ? { width: "100%", height: "100%", objectFit: "cover", display: "block" }
    : { width: "100%", maxHeight: 220, objectFit: "cover", display: "block" };

  return (
    <div>
      {label && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
            {label}
          </div>
          {hint && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{hint}</div>
          )}
        </div>
      )}

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          position:       "relative",
          border:         `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
          borderRadius:   12,
          background:     dragging ? "var(--accent-dim)" : "var(--elevated)",
          minHeight:      preview ? "auto" : 110,
          aspectRatio:    !preview && enforceAspect ? enforceAspect.replace(":", "/") : undefined,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          cursor:         uploading ? "not-allowed" : "pointer",
          overflow:       "hidden",
          transition:     "border-color .15s, background .15s",
        }}
      >
        {preview ? (
          <img src={preview} alt="preview" style={previewStyle || defaultPreviewStyle} />
        ) : (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6, opacity: .5 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div style={{ fontSize: 12 }}>Drop or <span style={{ color: "var(--accent)", fontWeight: 600 }}>browse</span></div>
            {enforceAspect && (
              <div style={{ marginTop: 3, fontSize: 11, opacity: .7 }}>Auto-cropped to {enforceAspect}</div>
            )}
          </div>
        )}

        {uploading && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{progress}%</div>
            <div style={{ width: 100, height: 4, background: "rgba(255,255,255,.2)", borderRadius: 4 }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", borderRadius: 4, transition: "width .1s" }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 5, fontSize: 12, color: "var(--red, #ef4444)" }}>{error}</div>
      )}

      {preview && !uploading && (
        <button
          onClick={() => inputRef.current?.click()}
          style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          Replace image
        </button>
      )}

      <input ref={inputRef} type="file" accept={ACCEPTED} style={{ display: "none" }} onChange={onInputChange} />
    </div>
  );
}
