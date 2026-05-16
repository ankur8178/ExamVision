const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  text: { type: String, default: '' },   // NOT required — validated via pre-save
  isCorrect: { type: Boolean, default: false }
}, { _id: false });

const questionSchema = new mongoose.Schema({
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  type: {
    type: String,
    enum: ['mcq', 'true_false', 'one_word', 'theory'],
    required: true
  },
  questionText: { type: String, required: true },
  options: [optionSchema],
  correctAnswer: { type: String, default: '' },
  modelAnswer: { type: String, default: '' },
  marks: { type: Number, default: 1 },
  negativeMarks: { type: Number, default: 0 },
  timeLimit: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Pre-save: clear irrelevant fields based on question type
questionSchema.pre('save', function (next) {
  if (this.type !== 'mcq') {
    this.options = [];
  }
  if (this.type === 'mcq') {
    this.correctAnswer = '';
  }
  if (this.type !== 'theory') {
    this.modelAnswer = '';
  }
  next();
});

// Pre-findOneAndUpdate: same cleanup
questionSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update && update.type) {
    if (update.type !== 'mcq') update.options = [];
    if (update.type === 'mcq') update.correctAnswer = '';
    if (update.type !== 'theory') update.modelAnswer = '';
  }
  next();
});

module.exports = mongoose.model('Question', questionSchema);
