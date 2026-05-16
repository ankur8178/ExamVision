/**
 * Cloudinary Upload Utility
 * =========================
 * Replaces Google Drive. Uploads recordings to Cloudinary.
 */
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a local file to Cloudinary.
 * @returns {{ fileId, webViewLink, webContentLink } | null}
 */
async function uploadToGoogleDrive(filePath, fileName, mimeType = 'video/webm') {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn('[Cloudinary] Credentials not set — falling back to local.');
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      public_id:     fileName.replace('.webm', ''),
      folder:        'examvision-recordings',
      overwrite:     true,
    });

    // Delete local temp file after successful upload
    try { fs.unlinkSync(filePath); } catch (_) {}

    console.log(`[Cloudinary] ✅ Uploaded: ${fileName} → ${result.secure_url}`);
    return {
      fileId:       result.public_id,
      webViewLink:  result.secure_url,
      webContentLink: result.secure_url,
    };
  }catch (err) {
    console.error('[Cloudinary] Upload failed — full error:', JSON.stringify(err, null, 2));
    return null;
  }
}

async function deleteFromGoogleDrive(fileId) {
  if (!fileId) return false;
  try {
    await cloudinary.uploader.destroy(fileId, { resource_type: 'video' });
    console.log(`[Cloudinary] 🗑 Deleted: ${fileId}`);
    return true;
  } catch (err) {
    console.error('[Cloudinary] Delete failed:', err.message);
    return false;
  }
}

module.exports = { uploadToGoogleDrive, deleteFromGoogleDrive };