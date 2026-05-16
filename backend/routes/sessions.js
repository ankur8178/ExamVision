const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const { protect } = require('../middleware/auth');

// ── Get my sessions ──────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    // Get the current token from authorization header
    const currentToken = req.headers.authorization?.split(' ')[1] || '';
    const tokenSuffix = currentToken.slice(-20); // last 20 chars for comparison

    const sessions = await Session.find({ user: req.user._id })
      .sort('-lastActive')
      .limit(10);

    // Mark the current session
    const result = sessions.map(s => ({
      ...s.toObject(),
      current: s.token === tokenSuffix,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Track a session (called on login/app load) ──────────────────────
router.post('/track', protect, async (req, res) => {
  try {
    const currentToken = req.headers.authorization?.split(' ')[1] || '';
    const tokenSuffix = currentToken.slice(-20);
    const ua = req.headers['user-agent'] || '';

    const browser = parseBrowser(ua);
    const os = parseOS(ua);
    const device = /mobile|android|iphone|ipad/i.test(ua) ? 'Mobile' : 'Desktop';
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.connection?.remoteAddress
            || req.socket?.remoteAddress
            || '';

    // Upsert: update if same token suffix exists, else create
    await Session.findOneAndUpdate(
      { user: req.user._id, token: tokenSuffix },
      {
        user: req.user._id,
        token: tokenSuffix,
        browser, os, device, ip,
        lastActive: new Date(),
      },
      { upsert: true, new: true }
    );

    // Cleanup: keep only last 10 sessions per user
    const allSessions = await Session.find({ user: req.user._id })
      .sort('-lastActive');
    if (allSessions.length > 10) {
      const idsToDelete = allSessions.slice(10).map(s => s._id);
      await Session.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({ message: 'Session tracked' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Logout other sessions ────────────────────────────────────────────
router.delete('/others', protect, async (req, res) => {
  try {
    const currentToken = req.headers.authorization?.split(' ')[1] || '';
    const tokenSuffix = currentToken.slice(-20);

    await Session.deleteMany({
      user: req.user._id,
      token: { $ne: tokenSuffix },
    });

    res.json({ message: 'All other sessions logged out' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Logout single session ────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    await Session.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    res.json({ message: 'Session removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────
function parseBrowser(ua) {
  if (ua.includes('Edg/'))    return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome'))  return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari'))  return 'Safari';
  return 'Unknown';
}

function parseOS(ua) {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS'))  return 'macOS';
  if (ua.includes('Linux'))   return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

module.exports = router;
