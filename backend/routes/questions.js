const express = require('express');
const router = express.Router();
const Question = require('../models/Question');
const Test = require('../models/Test');
const { protect, teacherOnly } = require('../middleware/auth');

// Add question to test
router.post('/', protect, teacherOnly, async (req, res) => {
  try {
    const question = await Question.create(req.body);
    // Add to test's questions array and update totalMarks
    const test = await Test.findById(req.body.test);
    test.questions.push(question._id);
    test.totalMarks += question.marks;
    await test.save();
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get questions for a test
router.get('/test/:testId', protect, async (req, res) => {
  try {
    const questions = await Question.find({ test: req.params.testId }).sort('order');
    // For students, don't send isCorrect flags
    if (req.user.role === 'student') {
      const sanitized = questions.map(q => {
        const obj = q.toObject();
        if (obj.options) obj.options = obj.options.map(o => ({ text: o.text }));
        delete obj.correctAnswer;
        delete obj.modelAnswer;
        return obj;
      });
      return res.json(sanitized);
    }
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update question
router.put('/:id', protect, teacherOnly, async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
    // Recalculate total marks
    const allQ = await Question.find({ test: question.test });
    const total = allQ.reduce((sum, q) => sum + q.marks, 0);
    await Test.findByIdAndUpdate(question.test, { totalMarks: total });
    res.json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete question
router.delete('/:id', protect, teacherOnly, async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);
    await Test.findByIdAndUpdate(question.test, { $pull: { questions: question._id } });
    // Recalculate marks
    const allQ = await Question.find({ test: question.test });
    const total = allQ.reduce((sum, q) => sum + q.marks, 0);
    await Test.findByIdAndUpdate(question.test, { totalMarks: total });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
