const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question:       { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  answer:         { type: String, default: '' },
  timeSpent:      { type: Number, default: 0 },
  isCorrect:      { type: Boolean },
  marksAwarded:   { type: Number, default: 0 },
  teacherComment: { type: String, default: '' }
}, { _id: false });

const violationSchema = new mongoose.Schema({
  type:      { type: String },
  timestamp: { type: Date, default: Date.now },
  details:   { type: String, default: '' }
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  test:               { type: mongoose.Schema.Types.ObjectId, ref: 'Test',   required: true },
  student:            { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  course:             { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  answers:            [answerSchema],
  violations:         [violationSchema],
  violationCount:     { type: Number, default: 0 },
  startTime:          { type: Date, default: Date.now },
  endTime:            { type: Date },
  submittedAt:        { type: Date },
  autoSubmitted:      { type: Boolean, default: false },
  status:             { type: String, enum: ['pending','in_progress','paused','student_paused','submitted','evaluated'], default: 'pending' },
  teacherMustResume:  { type: Boolean, default: false }, // true = student locked out until teacher clicks resume
  usedTimeSeconds:    { type: Number, default: 0 },
  totalScore:         { type: Number, default: 0 },
  percentage:         { type: Number, default: 0 },
  rank:               { type: Number },
  screenRecordingUrl: { type: String, default: '' },
  screenRecordingId:  { type: String, default: '' },
  cameraRecordingUrl: { type: String, default: '' },
  cameraRecordingId:  { type: String, default: '' },
  questionOrder:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  theoryGraded:       { type: Boolean, default: false },
  createdAt:          { type: Date, default: Date.now }
});

module.exports = mongoose.model('Attempt', attemptSchema);