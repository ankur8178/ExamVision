const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: false, default: '' },
  googleId: { type: String, default: null },
  role:     { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
  avatar:   { type: String, default: '' },
  resetOtp:       { type: String,  default: null },
  resetOtpExpiry: { type: Number,  default: null },
  // ── Admin approval fields ──────────────────────────────────────
  // NEW
  adminStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
  adminApprovalToken: { type: String, default: null }, // one-click email token

  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (p) {
  return bcrypt.compare(p, this.password);
};

module.exports = mongoose.model('User', userSchema);