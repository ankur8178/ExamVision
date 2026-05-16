const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Attempt = require('../models/Attempt');
const { protect, teacherOnly } = require('../middleware/auth');
const { uploadToGoogleDrive } = require('../utils/googleDrive');

// ── Multer: save to temp directory first ───────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/recordings', req.params.attemptId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}_${Date.now()}.webm`);
  }
});

const upload = multer({ storage });

async function uploadFileToDrive(localPath, fileName, attemptId) {
  try {
    const result = await uploadToGoogleDrive(localPath, fileName, 'video/webm');

    if (result && result.webViewLink) {
      try { fs.unlinkSync(localPath); } catch (_) {}
      console.log(`[Recordings] ✅ Drive upload OK: ${fileName}`);
      return {
        url: result.webViewLink,
        fileId: result.fileId,
        storedOn: 'drive',
      };
    }

    console.warn(`[Recordings] ⚠️ Drive returned no link for ${fileName} — falling back to local.`);
  } catch (err) {
    console.error(`[Recordings] ❌ Drive upload failed for ${fileName}:`, err.message);
  }

  const filename = path.basename(localPath);
  console.warn(`[Recordings] 📁 Stored locally (not on Drive): /uploads/recordings/${attemptId}/${filename}`);
  return {
    url: `/uploads/recordings/${attemptId}/${filename}`,
    fileId: '',
    storedOn: 'local',
  };
}

// ── POST /api/recordings/:attemptId  (student uploads after exam) ──────
router.post('/:attemptId', protect, (req, res, next) => {
  upload.fields([
    { name: 'screen', maxCount: 1 },
    { name: 'camera', maxCount: 1 },
  ])(req, res, next);
}, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
    if (attempt.student.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    const attemptId = req.params.attemptId;
    const uploadResults = {};

    if (req.files?.screen?.[0]) {
      const localPath = req.files.screen[0].path;
      const fileName = `screen_${attemptId}_${Date.now()}.webm`;
      const { url, fileId, storedOn } = await uploadFileToDrive(localPath, fileName, attemptId);
      attempt.screenRecordingUrl = url;
      attempt.screenRecordingId = fileId;
      uploadResults.screen = storedOn;
    }

    if (req.files?.camera?.[0]) {
      const localPath = req.files.camera[0].path;
      const fileName = `camera_${attemptId}_${Date.now()}.webm`;
      const { url, fileId, storedOn } = await uploadFileToDrive(localPath, fileName, attemptId);
      attempt.cameraRecordingUrl = url;
      attempt.cameraRecordingId = fileId;
      uploadResults.camera = storedOn;
    }

    await attempt.save();

    const dir = path.join(__dirname, '../uploads/recordings', attemptId);
    try {
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) fs.rmdirSync(dir);
    } catch (_) {}

    console.log(`[Recordings] Student upload complete for attempt ${attemptId}:`, uploadResults);

    res.json({
      screenRecordingUrl: attempt.screenRecordingUrl,
      cameraRecordingUrl: attempt.cameraRecordingUrl,
      storedOn: uploadResults,
    });
  } catch (err) {
    console.error('[Recordings] Student upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// ── POST /api/recordings/:attemptId/teacher  (teacher records live feed) ─
router.post('/:attemptId/teacher', protect, teacherOnly, (req, res, next) => {
  upload.fields([
    { name: 'screen', maxCount: 1 },
    { name: 'camera', maxCount: 1 },
  ])(req, res, next);
}, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    const attemptId = req.params.attemptId;
    const uploadResults = {};

    if (req.files?.screen?.[0]) {
      const localPath = req.files.screen[0].path;
      const fileName = `teacher_screen_${attemptId}_${Date.now()}.webm`;
      const { url, fileId, storedOn } = await uploadFileToDrive(localPath, fileName, attemptId);
      attempt.screenRecordingUrl = url;
      attempt.screenRecordingId = fileId;
      uploadResults.screen = storedOn;
    }

    if (req.files?.camera?.[0]) {
      const localPath = req.files.camera[0].path;
      const fileName = `teacher_camera_${attemptId}_${Date.now()}.webm`;
      const { url, fileId, storedOn } = await uploadFileToDrive(localPath, fileName, attemptId);
      attempt.cameraRecordingUrl = url;
      attempt.cameraRecordingId = fileId;
      uploadResults.camera = storedOn;
    }

    await attempt.save();

    const dir = path.join(__dirname, '../uploads/recordings', attemptId);
    try {
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) fs.rmdirSync(dir);
    } catch (_) {}

    console.log(`[Recordings] Teacher upload complete for attempt ${attemptId}:`, uploadResults);

    res.json({
      screenRecordingUrl: attempt.screenRecordingUrl,
      cameraRecordingUrl: attempt.cameraRecordingUrl,
      storedOn: uploadResults,
    });
  } catch (err) {
    console.error('[Recordings] Teacher upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// ── GET /api/recordings/test/:testId  (teacher only) ───────────────────
router.get('/test/:testId', protect, teacherOnly, async (req, res) => {
  try {
    const attempts = await Attempt.find({ test: req.params.testId })
      .populate('student', 'name email')
      .select('student screenRecordingUrl cameraRecordingUrl screenRecordingId cameraRecordingId score violations submittedAt');

    // ── CHANGED: replaced onDrive flag with uploadPending ──────────────
    const result = attempts.map(a => ({
      attemptId: a._id,
      student: a.student,
      score: a.score,
      violationCount: a.violations?.length || 0,
      submittedAt: a.submittedAt,
      screenUrl: a.screenRecordingUrl || null,
      cameraUrl: a.cameraRecordingUrl || null,
      screenFileId: a.screenRecordingId || null,
      cameraFileId: a.cameraRecordingId || null,
      uploadPending: !a.screenRecordingUrl && !a.cameraRecordingUrl && a.submittedAt
        ? (Date.now() - new Date(a.submittedAt).getTime()) < 5 * 60 * 1000
        : false,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch recordings' });
  }
});

module.exports = router;