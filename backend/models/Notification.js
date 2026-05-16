const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, enum: ['message', 'announcement', 'test_published', 'violation', 'submission', 'test_paused', 'student_paused'], required: true },
  title:     { type: String, required: true },
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt' },
  body:      { type: String, default: '' },
  link:      { type: String, default: '' },            // frontend route to navigate to
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for fast "unread for user" queries
notificationSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
