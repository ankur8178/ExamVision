const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Course = require('../models/Course');
const Attempt = require('../models/Attempt');
const Notification = require('../models/Notification');
const { protect, teacherOnly } = require('../middleware/auth');

// Create test — default visibleToAll true so students see it once published
router.post('/', protect, teacherOnly, async (req, res) => {
  try {
    const test = await Test.create({ visibleToAll: true, ...req.body, teacher: req.user._id });
    res.status(201).json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get LIVE / Published tests for the teacher — includes real activeStudents count
router.get('/live', protect, teacherOnly, async (req, res) => {
  try {
    const liveTests = await Test.find({ teacher: req.user._id, status: 'published' })
      .populate('course', 'name code')
      .sort('-createdAt');

    // For each live test, count students who are actively in the exam
    // (includes in_progress, paused by system, and voluntarily paused)
    const testsWithCounts = await Promise.all(
      liveTests.map(async (test) => {
        const activeStudents = await Attempt.countDocuments({
          test: test._id,
          status: { $in: ['in_progress', 'paused', 'student_paused'] },
        });

        const violations = await Attempt.aggregate([
          { $match: { test: test._id, status: { $in: ['in_progress', 'paused', 'student_paused'] } } },
          { $group: { _id: null, total: { $sum: '$violationCount' } } },
        ]);

        return {
          ...test.toObject(),
          activeStudents,
          violations: violations[0]?.total || 0,
          courseName: test.course?.name || 'No course',
        };
      })
    );

    res.json(testsWithCounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get tests for a course
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    let tests;
    if (req.user.role === 'teacher') {
      tests = await Test.find({ course: req.params.courseId, teacher: req.user._id })
        .populate('questions')
        .sort('-createdAt');
    } else {
      // Student: must be published AND (visibleToAll OR in visibleToStudents list)
      tests = await Test.find({
        course: req.params.courseId,
        status: 'published',
        $or: [
          { visibleToAll: true },
          { visibleToStudents: req.user._id }
        ]
      }).sort('-createdAt');
    }
    res.json(tests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single test
router.get('/:id', protect, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('questions')
      .populate('visibleToStudents', 'name email')
      .populate('course', 'name code')
      .populate('teacher', 'name email avatar');
    if (!test) return res.status(404).json({ message: 'Test not found' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update test
router.put('/:id', protect, teacherOnly, async (req, res) => {
  try {
    const test = await Test.findOneAndUpdate(
      { _id: req.params.id, teacher: req.user._id },
      req.body,
      { new: true, runValidators: true }
    ).populate('questions').populate('visibleToStudents', 'name email');
    if (!test) return res.status(404).json({ message: 'Test not found or not authorized' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update security settings
router.put('/:id/security', protect, teacherOnly, async (req, res) => {
  try {
    const test = await Test.findOneAndUpdate(
      { _id: req.params.id, teacher: req.user._id },
      { security: req.body },
      { new: true }
    );
    if (!test) return res.status(404).json({ message: 'Not found' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update visibility
router.put('/:id/visibility', protect, teacherOnly, async (req, res) => {
  try {
    const { visibleToStudents, visibleToAll, resultHidden } = req.body;
    const test = await Test.findOneAndUpdate(
      { _id: req.params.id, teacher: req.user._id },
      { visibleToStudents, visibleToAll, resultHidden },
      { new: true }
    ).populate('visibleToStudents', 'name email');
    if (!test) return res.status(404).json({ message: 'Not found' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Publish / close — when publishing, ensure visibleToAll is true if no specific students set
router.put('/:id/status', protect, teacherOnly, async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, teacher: req.user._id });
    if (!test) return res.status(404).json({ message: 'Not found' });

    const wasDraft = test.status !== 'published';
    test.status = req.body.status;
    // If publishing and no visibility is set at all, default to visible to all
    if (req.body.status === 'published' && !test.visibleToAll && (!test.visibleToStudents || test.visibleToStudents.length === 0)) {
      test.visibleToAll = true;
    }
    await test.save();

    // ── Notify students when test is published ─────────────────────
    if (wasDraft && req.body.status === 'published') {
      try {
        const course = await Course.findById(test.course);
        if (course && course.students && course.students.length > 0) {
          // Determine which students should be notified
          let targetStudents;
          if (test.visibleToAll) {
            targetStudents = course.students;
          } else {
            targetStudents = test.visibleToStudents || [];
          }

          if (targetStudents.length > 0) {
            const io = req.app.get('io');
            const notifications = targetStudents.map(studentId => ({
              user: studentId,
              type: 'test_published',
              title: '📝 New test available',
              body: `"${test.title}" is now live in ${course.name}`,
              link: `/student/course/${course._id}`
            }));
            const saved = await Notification.insertMany(notifications);
            saved.forEach(n => {
              io.to(`user_${n.user.toString()}`).emit('new_notification', n);
            });
          }
        }
      } catch (_) { /* notification creation failed — non-critical */ }
    }

    res.json(test);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete test
router.delete('/:id', protect, teacherOnly, async (req, res) => {
  try {
    await Test.findOneAndDelete({ _id: req.params.id, teacher: req.user._id });
    res.json({ message: 'Test deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;