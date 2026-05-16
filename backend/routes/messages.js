const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');

// Send message
// Rule: teachers can only reply (a student message must already exist in that conversation)
router.post('/', protect, async (req, res) => {
  try {
    const { course, receiver, content } = req.body;

    // If teacher is sending, verify a student message exists first (reply only)
    if (req.user.role === 'teacher') {
      const prior = await Message.findOne({
        course,
        sender: receiver,      // student previously sent something
        receiver: req.user._id
      });
      if (!prior) {
        return res.status(403).json({ message: 'Teachers can only reply to student messages. Wait for a student to message you first.' });
      }
    }

    const message = await Message.create({ course, receiver, content, sender: req.user._id });
    await message.populate('sender', 'name role');
    await message.populate('receiver', 'name role');

    const io = req.app.get('io');
    const roomId = `${course}_${[req.user._id.toString(), receiver].sort().join('_')}`;
    io.to(roomId).emit('receive_message', message);

    // ── Create notification for the receiver ──────────────────────
    try {
      const recipientUser = await User.findById(receiver);
      const notification = await Notification.create({
        user: receiver,
        type: 'message',
        title: '💬 New message',
        body: `${req.user.name}: ${content.substring(0, 80)}${content.length > 80 ? '…' : ''}`,
        link: req.user.role === 'teacher'
          ? `/student?tab=messages`
          : `/teacher?tab=messages`
      });
      io.to(`user_${receiver}`).emit('new_notification', notification);

      // Send Email
      if (recipientUser && recipientUser.email) {
        await sendEmail({
          email: recipientUser.email,
          subject: `New Message from ${req.user.name} - ExamVision Pro`,
          message: `You have received a new message from ${req.user.name}:\n\n"${content}"\n\nLog in to reply.`
        });
      }
    } catch (_) { /* notification/email creation failed — non-critical */ }

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get conversation between two users in a course
router.get('/conversation/:courseId/:userId', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      course: req.params.courseId,
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id }
      ]
    })
      .populate('sender', 'name role')
      .populate('receiver', 'name role')
      .sort('createdAt');

    // Mark as read
    await Message.updateMany(
      { course: req.params.courseId, sender: req.params.userId, receiver: req.user._id, read: false },
      { read: true }
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all student conversations for teacher in a course
router.get('/students/:courseId', protect, async (req, res) => {
  try {
    const messages = await Message.find({ course: req.params.courseId })
      .populate('sender', 'name role email')
      .populate('receiver', 'name role email')
      .sort('-createdAt');

    const conversations = {};
    messages.forEach(msg => {
      const student = msg.sender.role === 'student' ? msg.sender : msg.receiver;
      if (!student || !student._id) return;
      const key = student._id.toString();
      if (!conversations[key]) {
        conversations[key] = { student, lastMessage: msg, unreadCount: 0 };
      }
      if (!msg.read && msg.receiver._id && msg.receiver._id.toString() === req.user._id.toString()) {
        conversations[key].unreadCount++;
      }
    });

    res.json(Object.values(conversations));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get unread count
router.get('/unread', protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
