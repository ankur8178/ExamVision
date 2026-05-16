const express      = require('express');
const router       = express.Router();
const Announcement = require('../models/Announcement');
const Course       = require('../models/Course');
const Notification = require('../models/Notification');
const { protect, teacherOnly } = require('../middleware/auth');

// ── Create announcement (teacher) ────────────────────────────────
router.post('/', protect, teacherOnly, async (req, res) => {
  try {
    const { course: courseId, title, content } = req.body;

    const course = await Course.findOne({ _id: courseId, teacher: req.user._id });
    if (!course) return res.status(403).json({ message: 'Not your course' });

    const announcement = await Announcement.create({
      course:   courseId,
      teacher:  req.user._id,
      title:    title?.trim() || '',
      content:  content.trim(),
      isGlobal: false,
    });

    await announcement.populate('teacher', 'name avatar');
    await announcement.populate('course',  'name code');

    // Notify every enrolled student
    const io = req.app.get('io');
    if (course.students && course.students.length > 0) {
      const notifications = course.students.map(studentId => ({
        user:  studentId,
        type:  'announcement',
        title: `📢 ${title}`,
        body:  `${req.user.name} posted in ${course.name}`,
        link:  `/student/course/${courseId}?tab=announcements`,
      }));
      const saved = await Notification.insertMany(notifications);
      saved.forEach(n => {
        io.to(`user_${n.user.toString()}`).emit('new_notification', n);
      });
    }

    res.status(201).json(announcement);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Get announcements for a course ───────────────────────────────
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const announcements = await Announcement.find({
      course:   req.params.courseId,
      isGlobal: false,              // course-level only; global ones fetched separately
    })
      .populate('teacher', 'name avatar')
      .populate('course',  'name code')
      .sort('-createdAt');
    res.json(announcements);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Get global announcements (all logged-in users) ────────────────
//    Called by both StudentDashboard and TeacherDashboard on mount
router.get('/global', protect, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isGlobal: true })
      .sort('-createdAt')
      .limit(20);
    res.json(announcements);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Delete announcement (teacher — own announcements only) ────────
router.delete('/:id', protect, teacherOnly, async (req, res) => {
  try {
    const announcement = await Announcement.findOneAndDelete({
      _id:     req.params.id,
      teacher: req.user._id,
    });
    if (!announcement)
      return res.status(404).json({ message: 'Not found or not authorized' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;