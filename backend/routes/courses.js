const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const User = require('../models/User');
const { protect, teacherOnly } = require('../middleware/auth');

// Create course
router.post('/', protect, teacherOnly, async (req, res) => {
  try {
    const course = await Course.create({ ...req.body, teacher: req.user._id });
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get teacher's courses
router.get('/my', protect, async (req, res) => {
  try {
    let courses;
    if (req.user.role === 'teacher') {
      courses = await Course.find({ teacher: req.user._id }).populate('students', 'name email avatar');
    } else {
      courses = await Course.find({ students: req.user._id }).populate('teacher', 'name email avatar');
    }
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single course
router.get('/:id', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('teacher', 'name email avatar')
      .populate('students', 'name email avatar');
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admit student to course
router.post('/:id/admit', protect, teacherOnly, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (course.teacher.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your course' });

    const { studentId } = req.body;
    if (!course.students.includes(studentId)) {
      course.students.push(studentId);
      await course.save();
    }
    await course.populate('students', 'name email avatar');
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Remove student from course
router.delete('/:id/students/:studentId', protect, teacherOnly, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    course.students = course.students.filter(s => s.toString() !== req.params.studentId);
    await course.save();
    res.json({ message: 'Student removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Join course by code
router.post('/join', protect, async (req, res) => {
  try {
    const { code } = req.body;
    const course = await Course.findOne({ code });
    if (!course) return res.status(404).json({ message: 'Invalid course code' });
    if (!course.students.includes(req.user._id)) {
      course.students.push(req.user._id);
      await course.save();
    }
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update course
router.put('/:id', protect, teacherOnly, async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
