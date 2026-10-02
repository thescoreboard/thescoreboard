/**
 * Direct file upload through backend → Supabase Storage.
 * The backend receives the file and uploads it using the service key.
 */
const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getToken() { return localStorage.getItem("tsb_token"); }

const MAX_DIMENSION = 2048;
const JPEG_QUALITY  = 0.85;

/** Compress an image File to a Blob if it exceeds MAX_DIMENSION. */
async function compressImage(file) {
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        resolve(file);
        return;
      }

      const scale  = MAX_DIMENSION / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(width  * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => resolve(blob || file),
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * Upload a file to Supabase Storage via the backend.
 *
 * @param {Object} opts
 * @param {File}   opts.file          - The File object to upload
 * @param {string} opts.bucket        - Storage bucket name (e.g. "tournament-posters")
 * @param {string} [opts.path]        - Object path inside the bucket (auto-generated if omitted)
 * @param {function} [opts.onProgress] - Called with (0–100) as upload progresses
 * @returns {Promise<string>}         - Public CDN URL of the uploaded file
 */
export async function uploadFile({ file, bucket, path, onProgress }) {
  const blob = await compressImage(file);

  const form = new FormData();
  form.append("file", blob, file.name || "upload.jpg");
  form.append("bucket", bucket);
  if (path) form.append("path", path);

  const token = getToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/media/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { public_url } = JSON.parse(xhr.responseText);
          onProgress?.(100);
          resolve(public_url);
        } catch {
          reject(new Error("Invalid response from server"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

/**
 * Generate a storage path for an asset.
 */
export function storagePath(resourceType, resourceId, file) {
  const ext = (file.name || "upload").split(".").pop().toLowerCase() || "jpg";
  return `${resourceType}/${resourceId}/${Date.now()}.${ext}`;
}
