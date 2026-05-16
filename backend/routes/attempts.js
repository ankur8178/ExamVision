const express = require('express');
const router = express.Router();
const Attempt = require('../models/Attempt');
const Test = require('../models/Test');
const Question = require('../models/Question');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, studentOnly } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');

// Start attempt
router.post('/start', protect, studentOnly, async (req, res) => {
  try {
    const { testId } = req.body;
    const test = await Test.findById(testId).populate('questions');
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const inProgress = await Attempt.findOne({
      test: testId,
      student: req.user._id,
      status: { $in: ['in_progress', 'paused', 'student_paused', 'pending'] }
    });
    if (inProgress) return res.json(inProgress);

    const attemptCount = await Attempt.countDocuments({
      test: testId, student: req.user._id,
      status: { $in: ['submitted', 'evaluated'] }
    });

    if (attemptCount > 0) {
      if (!test.allowReattempt)
        return res.status(403).json({ message: 'Reattempts are not allowed for this test.' });
      if (test.maxAttempts > 0 && attemptCount >= test.maxAttempts)
        return res.status(403).json({ message: `Maximum attempts (${test.maxAttempts}) reached.` });
    }

    let questionOrder = test.questions.map(q => q._id);
    if (test.security.questionRandomization) questionOrder = questionOrder.sort(() => Math.random() - 0.5);

    const attempt = await Attempt.create({
      test: testId, student: req.user._id, course: test.course,
      questionOrder
    });
    res.status(201).json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Begin attempt (starts timer)
router.put('/:id/begin', protect, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });
    if (attempt.status === 'pending') {
      attempt.status = 'in_progress';
      attempt.startTime = new Date();
      await attempt.save();
    }
    res.json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Save answer
router.post('/:id/answer', protect, async (req, res) => {
  try {
    const { questionId, answer, timeSpent } = req.body;
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });

    const idx = attempt.answers.findIndex(a => a.question.toString() === questionId);
    if (idx >= 0) {
      attempt.answers[idx].answer = answer;
      if ((timeSpent || 0) > attempt.answers[idx].timeSpent) attempt.answers[idx].timeSpent = timeSpent;
    } else {
      attempt.answers.push({ question: questionId, answer, timeSpent: timeSpent || 0 });
    }
    await attempt.save();
    res.json({ message: 'Saved' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Record violation
router.post('/:id/violation', protect, async (req, res) => {
  try {
    const { type, details } = req.body;
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });
    attempt.violations.push({ type, details, timestamp: new Date() });
    attempt.violationCount += 1;
    await attempt.save();

    const test = await Test.findById(attempt.test);

    // Notify teacher of violation
    try {
      const io = req.app.get('io');
      if (io) {
        const student = await User.findById(attempt.student);
        const notif = await Notification.create({
          user: test.teacher,
          type: 'violation',
          title: '⚠️ Student Violation',
          body: `${student.name} triggered a violation (${type}) on test "${test.title}"`,
          link: `/teacher/tests/${test._id}/attempts`
        });
        io.to(`user_${test.teacher.toString()}`).emit('new_notification', notif);
      }
    } catch (e) { /* ignore */ }

    let autoSubmit = false;
    let isPaused = false;
    const maxViol = test.security.maxTabSwitches || 3;

    if (attempt.violationCount >= maxViol) {
      if (test.security.autoSubmitOnMaxViolations) {
        autoSubmit = true;
      } else {
        // Lock student out — only teacher can resume
        attempt.status = 'paused';
        attempt.teacherMustResume = true;
        isPaused = true;
        attempt.usedTimeSeconds = Math.floor(
          (Date.now() - new Date(attempt.startTime).getTime()) / 1000
        );
        await attempt.save();

        try {
          const io = req.app.get('io');
          if (io) {
            const student = await User.findById(attempt.student);
            const notif = await Notification.create({
              user: test.teacher,
              type: 'test_paused',
              attemptId: attempt._id,
              title: '⏸ Test Paused Automatically',
              body: `${student.name} reached max violations and was locked out of "${test.title}"`,
              link: `/teacher/tests/${test._id}/attempts`
            });
            io.to(`user_${test.teacher.toString()}`).emit('new_notification', notif);
          }
        } catch (e) {}
      }
    }

    res.json({ violationCount: attempt.violationCount, autoSubmit, isPaused });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Resume paused attempt — TEACHER ONLY
router.put('/:id/resume', protect, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id).populate('test');
    if (!attempt) return res.status(404).json({ message: 'Not found' });

    // Only the teacher of this test can resume
    const test = attempt.test;
    if (test.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the teacher can resume this attempt' });
    }

    attempt.status = 'in_progress';
    attempt.violationCount = 0;
    attempt.teacherMustResume = false;
    // Restore remaining time correctly based on how much time was used
    attempt.startTime = new Date(Date.now() - (attempt.usedTimeSeconds * 1000));
    await attempt.save();

    try {
      const io = req.app.get('io');
      if (io) {
        // Emit to student's personal notification room
        io.to(`user_${attempt.student.toString()}`).emit('test_resumed', {
          attemptId: attempt._id,
        });
      }
    } catch {}

    res.json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Student polls this to check if teacher has unlocked their attempt
router.get('/:id/resume-status', protect, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id)
      .select('status teacherMustResume usedTimeSeconds startTime test');
    if (!attempt) return res.status(404).json({ message: 'Not found' });
    res.json({
      status:            attempt.status,
      teacherMustResume: attempt.teacherMustResume || false,
      canResume:         attempt.status === 'paused' && !attempt.teacherMustResume,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Student voluntarily pauses the exam
router.post('/:id/student-pause', protect, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });
    const test = await Test.findById(attempt.test);
    if (!test.security.studentPauseAllowed) {
      return res.status(403).json({ message: 'Student pausing is not allowed for this test' });
    }
    attempt.status = 'student_paused';
    attempt.usedTimeSeconds = Math.floor(
      (Date.now() - new Date(attempt.startTime).getTime()) / 1000
    );
    await attempt.save();

    try {
      const io = req.app.get('io');
      if (io) {
        const student = await User.findById(attempt.student);
        const notif = await Notification.create({
          user: test.teacher,
          type: 'student_paused',
          attemptId: attempt._id,
          title: '⏸ Student Paused Test',
          body: `${student.name} has voluntarily paused their test "${test.title}"`,
          link: `/teacher/tests/${test._id}/attempts`
        });
        io.to(`user_${test.teacher.toString()}`).emit('new_notification', notif);
      }
    } catch (e) {}

    res.json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Teacher forcefully submits paused exam
router.post('/:id/teacher-submit', protect, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });
    attempt.status = 'submitted';
    attempt.autoSubmitted = true;
    attempt.submittedAt = new Date();
    await attempt.save();
    res.json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Submit attempt
router.post('/:id/submit', protect, async (req, res) => {
  try {
    const { autoSubmitted } = req.body;
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });
    if (!['in_progress', 'student_paused', 'paused'].includes(attempt.status)) return res.json(attempt);

    const questions = await Question.find({ test: attempt.test });
    let totalScore = 0, hasUngradedTheory = false;

    const latestAnswers = new Map();
    for (let i = attempt.answers.length - 1; i >= 0; i--) {
      const qId = attempt.answers[i].question.toString();
      if (!latestAnswers.has(qId)) latestAnswers.set(qId, i);
    }
    const indicesToGrade = new Set(latestAnswers.values());

    attempt.answers.forEach((ans, idx) => {
      const question = questions.find(q => q._id.toString() === ans.question.toString());
      if (!question) return;
      if (question.type === 'theory') { hasUngradedTheory = true; return; }
      if (!indicesToGrade.has(idx)) return;

      let correct = false;
      if (question.type === 'mcq') {
        const correctOpt = question.options.find(o => o.isCorrect);
        correct = correctOpt && correctOpt.text === ans.answer;
      } else if (question.type === 'true_false' || question.type === 'one_word') {
        correct = question.correctAnswer?.toLowerCase().trim() === ans.answer?.toLowerCase().trim();
      }
      ans.isCorrect = correct;
      if (correct) { ans.marksAwarded = question.marks; totalScore += question.marks; }
      else if (!correct && ans.answer && question.negativeMarks > 0) { ans.marksAwarded = -question.negativeMarks; totalScore -= question.negativeMarks; }
      else { ans.marksAwarded = 0; }
    });

    const test = await Test.findById(attempt.test);
    attempt.status = hasUngradedTheory ? 'submitted' : 'evaluated';
    attempt.submittedAt = new Date();
    attempt.autoSubmitted = autoSubmitted || false;
    attempt.totalScore = Math.max(0, totalScore);
    attempt.percentage = test.totalMarks > 0 ? Math.round((attempt.totalScore / test.totalMarks) * 100) : 0;
    await attempt.save();

    try {
      const io = req.app.get('io');
      const student = await User.findById(attempt.student);
      const teacher = await User.findById(test.teacher);

      if (student && teacher) {
        const notif = await Notification.create({
          user: test.teacher,
          type: 'submission',
          title: '✅ Exam Submitted',
          body: `${student.name} has submitted "${test.title}"`,
          link: `/teacher/tests/${test._id}/attempts`
        });
        if (io) io.to(`user_${test.teacher.toString()}`).emit('new_notification', notif);

        await sendEmail({
          email: teacher.email,
          subject: `Exam Submitted: ${test.title}`,
          message: `Student ${student.name} has just submitted their attempt for the exam "${test.title}".\nScore: ${attempt.totalScore || 0}/${test.totalMarks || 0} (${attempt.percentage || 0}%)`
        });
      }
    } catch (e) { /* ignore */ }

    res.json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Get ALL attempts by this student for a test (for multi-attempt result view)
// IMPORTANT: This route must be defined BEFORE /my/:testId to avoid
// Express matching the string "all" as a testId parameter.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my/:testId/all', protect, async (req, res) => {
  try {
    const attempts = await Attempt.find({
      test: req.params.testId,
      student: req.user._id,
      status: { $in: ['submitted', 'evaluated'] }
    })
      .sort({ createdAt: 1 }) // oldest first → UI labels "Attempt 1, 2, 3…"
      .populate('answers.question')
      .populate('test', 'title totalMarks');

    res.json(attempts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get latest/active attempt for student
router.get('/my/:testId', protect, async (req, res) => {
  try {
    const attempts = await Attempt.find({ test: req.params.testId, student: req.user._id })
      .sort('-createdAt');
    if (!attempts.length) return res.json(null);
    const best = attempts.find(a => ['in_progress', 'pending', 'student_paused', 'paused'].includes(a.status))
      || attempts.find(a => a.status === 'evaluated')
      || attempts.find(a => a.status === 'submitted')
      || attempts[0];
    const populated = await Attempt.findById(best._id).populate('answers.question');
    res.json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Attempt count for student
router.get('/my/:testId/count', protect, async (req, res) => {
  try {
    const count = await Attempt.countDocuments({
      test: req.params.testId, student: req.user._id,
      status: { $in: ['submitted', 'evaluated'] }
    });
    res.json({ count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// All attempts for a test (teacher)
router.get('/test/:testId', protect, async (req, res) => {
  try {
    const attempts = await Attempt.find({ test: req.params.testId })
      .populate('student', 'name email avatar')
      .populate('answers.question')
      .sort('-totalScore');
    let rank = 1;
    attempts.forEach((a, i) => {
      if (i > 0 && a.totalScore < attempts[i - 1].totalScore) rank = i + 1;
      a.rank = rank;
    });
    res.json(attempts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Single attempt
router.get('/:id', protect, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id)
      .populate('student', 'name email avatar')
      .populate('answers.question')
      .populate('test');
    res.json(attempt);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Grade theory answer
router.put('/:id/grade', protect, async (req, res) => {
  try {
    const { questionId, marksAwarded, teacherComment } = req.body;
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ message: 'Not found' });

    let ansIdx = -1;
    for (let i = attempt.answers.length - 1; i >= 0; i--) {
      if (attempt.answers[i].question.toString() === questionId.toString()) {
        ansIdx = i; break;
      }
    }

    if (ansIdx >= 0) {
      attempt.answers[ansIdx].marksAwarded = Number(marksAwarded);
      attempt.answers[ansIdx].isCorrect = Number(marksAwarded) > 0;
      if (teacherComment !== undefined) attempt.answers[ansIdx].teacherComment = teacherComment;
    }

    const seenQ = new Map();
    for (let i = attempt.answers.length - 1; i >= 0; i--) {
      const qId = attempt.answers[i].question.toString();
      if (!seenQ.has(qId)) seenQ.set(qId, attempt.answers[i]);
    }
    attempt.totalScore = Math.max(0, [...seenQ.values()].reduce((sum, a) => sum + (a.marksAwarded || 0), 0));

    const test = await Test.findById(attempt.test);
    attempt.percentage = test.totalMarks > 0
      ? Math.round((attempt.totalScore / test.totalMarks) * 100) : 0;
    attempt.status = 'evaluated';
    await attempt.save();

    const fresh = await Attempt.findById(attempt._id)
      .populate('answers.question')
      .populate('student', 'name email avatar');
    res.json(fresh);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ONE-TIME CLEANUP route
router.get('/admin/recalculate-scores', protect, async (req, res) => {
  try {
    const attempts = await Attempt.find({ status: { $in: ['submitted', 'evaluated'] } });
    const results = [];
    for (const attempt of attempts) {
      const seenQ = new Map();
      for (let i = attempt.answers.length - 1; i >= 0; i--) {
        const qId = attempt.answers[i].question.toString();
        if (!seenQ.has(qId)) seenQ.set(qId, attempt.answers[i]);
      }
      const dedupedAnswers = [...seenQ.values()];
      let totalScore = 0;
      for (const ans of dedupedAnswers) totalScore += (ans.marksAwarded || 0);
      const test = await Test.findById(attempt.test);
      const oldScore = attempt.totalScore;
      attempt.totalScore = Math.max(0, totalScore);
      attempt.percentage = test?.totalMarks > 0
        ? Math.round((attempt.totalScore / test.totalMarks) * 100) : 0;
      await attempt.save();
      results.push({ attemptId: attempt._id, oldScore, newScore: attempt.totalScore });
    }
    res.json({ message: `✅ Recalculated ${results.length} attempts`, results });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Release results
router.put('/test/:testId/release-results', protect, async (req, res) => {
  try {
    await Test.findByIdAndUpdate(req.params.testId, { resultHidden: false, resultReleasedAt: new Date() });
    res.json({ message: 'Results released' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;