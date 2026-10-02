import { useState, useCallback } from "react";
import { uploadFile } from "../services/uploadService";

/**
 * React hook for signed-URL file uploads.
 *
 * Usage:
 *   const { upload, uploading, progress, url, error, reset } = useUpload();
 *   const publicUrl = await upload({ file, bucket: "logos", path: "teams/1/logo.jpg" });
 */
export function useUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [url, setUrl]             = useState(null);
  const [error, setError]         = useState(null);

  const reset = useCallback(() => {
    setUploading(false);
    setProgress(0);
    setUrl(null);
    setError(null);
  }, []);

  const upload = useCallback(async ({ file, bucket, path }) => {
    setUploading(true);
    setProgress(0);
    setError(null);
    setUrl(null);

    try {
      const publicUrl = await uploadFile({
        file,
        bucket,
        path,
        onProgress: setProgress,
      });
      setUrl(publicUrl);
      return publicUrl;
    } catch (err) {
      setError(err.message || "Upload failed");
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, progress, url, error, reset };
}
