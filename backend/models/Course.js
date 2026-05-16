const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  code: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});

courseSchema.pre('save', function(next) {
  if (!this.code) {
    this.code = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Course', courseSchema);
