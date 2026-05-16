const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// ── Get my notifications (newest first, last 50) ─────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id, read: false })
      .sort('-createdAt')
      .limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get unread count ─────────────────────────────────────────────────
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Mark single notification as read ─────────────────────────────────
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Not found' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Mark all as read ─────────────────────────────────────────────────
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
