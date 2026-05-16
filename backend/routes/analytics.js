const express = require('express');
const router = express.Router();
const Attempt = require('../models/Attempt');
const Test = require('../models/Test');
const { protect } = require('../middleware/auth');

// Full analytics for teacher
router.get('/test/:testId', protect, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId).populate('questions');
    const attempts = await Attempt.find({
      test: req.params.testId,
      status: { $in: ['submitted', 'evaluated'] }
    }).populate('student', 'name email avatar');

    if (!attempts.length) return res.json({ message: 'No attempts yet', attempts: [] });

    const scores = attempts.map(a => a.totalScore);
    const percentages = attempts.map(a => a.percentage);

    const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    percentages.forEach(p => {
      if (p <= 20) distribution['0-20']++;
      else if (p <= 40) distribution['21-40']++;
      else if (p <= 60) distribution['41-60']++;
      else if (p <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    });

    const violationTypes = {};
    attempts.forEach(a => a.violations.forEach(v => {
      violationTypes[v.type] = (violationTypes[v.type] || 0) + 1;
    }));

    const analytics = {
      totalAttempts: attempts.length,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      averagePercentage: percentages.reduce((a, b) => a + b, 0) / percentages.length,
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      passCount: attempts.filter(a => a.percentage >= 50).length,
      scoreDistribution: distribution,
      violationStats: violationTypes,
      totalViolations: attempts.reduce((sum, a) => sum + a.violationCount, 0),
      autoSubmitted: attempts.filter(a => a.autoSubmitted).length,
      leaderboard: attempts
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 10)
        .map((a, i) => ({
          rank: i + 1,
          student: a.student,
          score: a.totalScore,
          percentage: a.percentage,
          timeTaken: a.submittedAt ? Math.round((new Date(a.submittedAt) - new Date(a.startTime)) / 60000) : null,
          violations: a.violationCount
        }))
    };
    res.json(analytics);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Student result — FIX: prefer 'evaluated' status over 'submitted'
router.get('/student/test/:testId', protect, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    if (test.resultHidden) return res.json({ hidden: true });

    // Get ALL non-in_progress attempts for this student
    const allStudentAttempts = await Attempt.find({
      test: req.params.testId,
      student: req.user._id,
      status: { $in: ['submitted', 'evaluated'] }
    }).sort('-createdAt');

    if (!allStudentAttempts.length) {
      return res.status(404).json({ message: 'No attempt found' });
    }

    // Prefer 'evaluated' (teacher-graded) over 'submitted', then newest
    const best = allStudentAttempts.find(a => a.status === 'evaluated') || allStudentAttempts[0];

    // Populate answers.question for the chosen attempt
    const attempt = await Attempt.findById(best._id).populate({
      path: 'answers.question',
      model: 'Question'
    });

    const allAttempts = await Attempt.find({
      test: req.params.testId,
      status: { $in: ['submitted', 'evaluated'] }
    }).sort('-totalScore');

    const rank = allAttempts.findIndex(a => a.student.toString() === req.user._id.toString()) + 1;

    res.json({ attempt, rank, totalStudents: allAttempts.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
