const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    course:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    teacher:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null },
    title:     { type: String, trim: true, default: '' },
    content:   { type: String, required: true, trim: true },
    isGlobal:  { type: Boolean, default: false },       // true = admin posted, visible to everyone
    postedBy:  { type: String, default: '' },           // admin name for global announcements
  },
  { timestamps: true }   // replaces manual createdAt — gives createdAt + updatedAt automatically
);

module.exports = mongoose.model('Announcement', announcementSchema);