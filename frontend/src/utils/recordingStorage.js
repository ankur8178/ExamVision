/**
 * Recording Storage Utility
 * =========================
 * Uploads screen/camera recording blobs directly to the backend.
 * The backend saves files temporarily to disk, uploads to Google Drive,
 * then stores the Drive URL in MongoDB.
 */

// ── FIX: Use env variable so this works in all environments, not just localhost.
// REACT_APP_API_URL should be set in frontend/.env as http://localhost:5001/api
// (or your production URL). Falls back to localhost for local dev.
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

/**
 * Upload both screen and camera blobs to the backend in one request.
 * The backend handles Google Drive upload and saves the final URL to MongoDB.
 * Returns { screenRecordingUrl, cameraRecordingUrl } or null on failure.
 *
 * @param {string} attemptId
 * @param {Blob|null} screenBlob
 * @param {Blob|null} cameraBlob
 */
export const uploadRecordingsToServer = async (attemptId, screenBlob, cameraBlob) => {
  if (!screenBlob && !cameraBlob) return null;

  // Don't bother sending empty blobs
  const hasScreen = screenBlob && screenBlob.size > 0;
  const hasCamera = cameraBlob && cameraBlob.size > 0;
  if (!hasScreen && !hasCamera) return null;

  const formData = new FormData();
  if (hasScreen) {
    formData.append('screen', screenBlob, `screen_${attemptId}.webm`);
  }
  if (hasCamera) {
    formData.append('camera', cameraBlob, `camera_${attemptId}.webm`);
  }

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/recordings/${attemptId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.status);
      throw new Error(`Upload failed: ${errText}`);
    }

    const data = await res.json();
    console.log('[RecordingStorage] ✅ Uploaded:', data);
    return data; // { screenRecordingUrl, cameraRecordingUrl }
  } catch (err) {
    console.error('[RecordingStorage] Upload failed:', err);
    return null;
  }
};

// ── Kept for cleanup of any old localStorage data ──────────────────────────
export const deleteOldLocalRecording = (attemptId) => {
  try {
    localStorage.removeItem(`recording_screen_${attemptId}`);
    localStorage.removeItem(`recording_camera_${attemptId}`);
  } catch { }
};