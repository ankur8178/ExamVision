/**
 * VIDEO STORAGE NOTE
 * ==================
 * MongoDB is NOT suitable for storing video files directly.
 * Videos can be 10MB–500MB per recording — MongoDB documents max at 16MB.
 *
 * RECOMMENDED SOLUTIONS (pick one):
 *
 * 1. CLOUDINARY (easiest, free tier available)
 *    npm install cloudinary
 *    - Student's browser captures MediaRecorder blob
 *    - POST blob to this endpoint
 *    - We upload to Cloudinary, store the returned URL in Attempt.screenRecordingUrl
 *
 * 2. AWS S3 (production-grade)
 *    npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *    - Generate presigned URL, upload directly from browser
 *    - Store S3 URL in database
 *
 * 3. Local disk with multer (development only)
 *    npm install multer
 *    - Serve /uploads as static
 *    - Not suitable for production or multi-server deployments
 *
 * The code below shows the Cloudinary approach as a starting point.
 * Uncomment and configure once you have Cloudinary credentials.
 */

/*
const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const { protect } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload recording (base64 or stream)
router.post('/recording', protect, async (req, res) => {
  try {
    const { data, attemptId, type } = req.body; // type: 'screen' | 'camera'
    const result = await cloudinary.uploader.upload(data, {
      resource_type: 'video',
      folder: `examvision/${type}`,
      public_id: `${attemptId}_${type}_${Date.now()}`,
    });

    const Attempt = require('../models/Attempt');
    const field = type === 'camera' ? 'cameraRecordingUrl' : 'screenRecordingUrl';
    await Attempt.findByIdAndUpdate(attemptId, { [field]: result.secure_url });

    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
*/

// Placeholder export so the file can be required without error
const express = require('express');
const router = express.Router();
module.exports = router;
