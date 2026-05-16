const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token:     { type: String, required: true },   // JWT (hashed or truncated for comparison)
  browser:   { type: String, default: 'Unknown' },
  os:        { type: String, default: 'Unknown' },
  device:    { type: String, default: 'Desktop' },
  ip:        { type: String, default: '' },
  current:   { type: Boolean, default: false },   // set per-request
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Session', sessionSchema);
