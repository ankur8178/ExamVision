const mongoose = require('mongoose');
const adminLogSchema = new mongoose.Schema(
  {
    adminId:    { type: String, required: true },
    adminName:  { type: String, required: true },
    adminEmail: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'delete_user',
        'reset_password',
        'impersonate',
        'global_announcement',
        'delete_course',
        'delete_announcement',
        'approve_admin',      
        'reject_admin',       
        'revoke_admin',       
        'promote_teacher',   
      ],
    },
    details: { type: String, default: '' },
    meta:    { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);
module.exports = mongoose.model('AdminLog', adminLogSchema);