const mongoose = require('mongoose');

const securitySettingsSchema = new mongoose.Schema({
  tabSwitchDetection: { type: Boolean, default: true },
  maxTabSwitches: { type: Number, default: 3 },
  fullscreenEnforcement: { type: Boolean, default: true },
  copyPasteBlocking: { type: Boolean, default: true },
  rightClickBlocking: { type: Boolean, default: true },
  autoSubmitOnMaxViolations: { type: Boolean, default: true },
  oneWayNavigation: { type: Boolean, default: false },
  questionRandomization: { type: Boolean, default: true },
  perQuestionTimeTracking: { type: Boolean, default: true },
  screenRecording: { type: Boolean, default: false },
  cameraRecording: { type: Boolean, default: false },
  studentPauseAllowed: { type: Boolean, default: false }
}, { _id: false });

const testSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  duration: { type: Number, required: true },
  totalMarks: { type: Number, default: 0 },
  passingMarks: { type: Number, default: 0 },
  startTime: { type: Date },
  endTime: { type: Date },
  security: { type: securitySettingsSchema, default: () => ({}) },
  visibleToStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  visibleToAll: { type: Boolean, default: true },
  resultHidden: { type: Boolean, default: false },
  resultReleasedAt: { type: Date },
  // Reattempt settings
  allowReattempt: { type: Boolean, default: false },
  maxAttempts: { type: Number, default: 1 },   // 1 = no reattempt, 0 = unlimited
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Test', testSchema);
