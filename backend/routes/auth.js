const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const User       = require('../models/User');
const AdminLog   = require('../models/AdminLog');
const sendEmail  = require('../utils/sendEmail');
const { protect, adminOnly } = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

const signAdminToken = () =>
  jwt.sign({ isAdmin: true }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

const logAction = (req, action, details, meta = {}) =>
  AdminLog.create({
    adminId:    req.user._id?.toString() || 'admin',
    adminName:  req.user.name,
    adminEmail: req.user.email,
    action,
    details,
    meta,
  });

// ── Password strength validator ───────────────────────────────────
const validatePassword = (password) => {
  if (!password || password.length < 8)
    return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password))
    return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password))
    return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password))
    return 'Password must contain at least one number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return 'Password must contain at least one special character (!@#$%^&* etc).';
  return null;
};

// ── Rate limiter for OTP requests ─────────────────────────────────
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { message: 'Too many reset requests. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Helper: send admin approval request email ─────────────────────
const sendAdminRequestEmail = async (applicant, approvalToken) => {
  const approveUrl = `${process.env.BACKEND_URL}/api/auth/admin/approve/${approvalToken}`;
  const rejectUrl  = `${process.env.BACKEND_URL}/api/auth/admin/reject/${approvalToken}`;
  await sendEmail({
    email:   process.env.GMAIL_USER,
    subject: `🔐 Admin Access Request — ${applicant.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;overflow:hidden;border:1px solid #2d2d3a">
        <div style="background:linear-gradient(135deg,#6c63ff,#ec4899);padding:28px 32px">
          <h1 style="margin:0;font-size:22px;color:#fff">⬡ ExamVision</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px">Admin Access Request</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:15px;margin:0 0 8px">A new user has requested admin access:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
            <tr><td style="padding:8px 0;color:#94a3b8;width:90px">Name</td><td style="color:#e2e8f0;font-weight:600">${applicant.name}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Email</td><td style="color:#e2e8f0">${applicant.email}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Requested</td><td style="color:#e2e8f0">${new Date().toLocaleString()}</td></tr>
          </table>
          <p style="font-size:13px;color:#94a3b8;margin:0 0 24px">Click one of the buttons below to approve or reject this request. These links are single-use and expire in <strong style="color:#e2e8f0">48 hours</strong>.</p>
          <div style="display:flex;gap:12px">
            <a href="${approveUrl}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">✅ Approve</a>
            <a href="${rejectUrl}"  style="display:inline-block;padding:12px 28px;background:#ef4444;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-left:12px">❌ Reject</a>
          </div>
          <p style="margin-top:28px;font-size:12px;color:#64748b">If you did not expect this request, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
};

// ── Register ──────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ message: pwError });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    if (role === 'admin') {
      const approvalToken = crypto.randomBytes(32).toString('hex');
      const user = await User.create({
        name, email, password,
        role: 'admin',
        adminStatus: 'pending',
        adminApprovalToken: approvalToken,
      });
      await sendAdminRequestEmail(user, approvalToken);
      return res.status(201).json({
        adminPending: true,
        message: 'Your admin request has been sent. You will be notified once approved.',
        user: { _id: user._id, name: user.name, email: user.email, role: 'admin', adminStatus: 'pending' },
      });
    }

    const user = await User.create({ name, email, password, role });
    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = signAdminToken();
      return res.json({
        token,
        user: { _id: 'admin', name: 'Super Admin', email: process.env.ADMIN_EMAIL, role: 'admin', isSuperAdmin: true, avatar: '' },
      });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    if (user.role === 'admin' && user.adminStatus === 'pending') {
      const token = signToken(user._id);
      return res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: 'admin', adminStatus: 'pending', avatar: user.avatar },
      });
    }

    if (user.role === 'admin' && user.adminStatus === 'rejected')
      return res.status(403).json({ message: 'Your admin request was rejected. Contact the super admin.' });

    const token = signToken(user._id);
    res.json({
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── One-click Approve (from email link) ───────────────────────────
router.get('/admin/approve/:token', async (req, res) => {
  try {
    const user = await User.findOne({ adminApprovalToken: req.params.token, adminStatus: 'pending' });
    if (!user) {
      return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f11;color:#e2e8f0"><h2>⚠️ Link Invalid or Already Used</h2><p style="color:#94a3b8">This approval link has expired or was already actioned.</p></body></html>`);
    }
    user.adminStatus        = 'approved';
    user.adminApprovalToken = null;
    await user.save();
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f11;color:#e2e8f0"><h2 style="color:#22c55e">✅ Admin Approved!</h2><p style="color:#94a3b8"><strong>${user.name}</strong> (${user.email}) now has admin access.</p></body></html>`);
    sendEmail({
      email: user.email,
      subject: '✅ Your ExamVision Admin Access Has Been Approved',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;padding:32px;border:1px solid #2d2d3a"><h1 style="color:#22c55e;margin:0 0 16px">✅ Access Approved!</h1><p>Hi <strong>${user.name}</strong>,</p><p>Your admin access on <strong>ExamVision</strong> has been approved.</p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Go to Login →</a></div>`,
    }).catch(err => console.error('Approve email failed:', err.message));
  } catch (err) {
    res.status(500).send(`<html><body><h2>Error: ${err.message}</h2></body></html>`);
  }
});

// ── One-click Reject (from email link) ────────────────────────────
router.get('/admin/reject/:token', async (req, res) => {
  try {
    const user = await User.findOne({ adminApprovalToken: req.params.token, adminStatus: 'pending' });
    if (!user) {
      return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f11;color:#e2e8f0"><h2>⚠️ Link Invalid or Already Used</h2><p style="color:#94a3b8">This link has already been actioned.</p></body></html>`);
    }
    user.adminStatus        = 'rejected';
    user.adminApprovalToken = null;
    await user.save();
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f11;color:#e2e8f0"><h2 style="color:#ef4444">❌ Request Rejected</h2><p style="color:#94a3b8"><strong>${user.name}</strong>'s admin request has been rejected.</p></body></html>`);
    sendEmail({
      email: user.email,
      subject: '❌ ExamVision Admin Request Rejected',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;padding:32px;border:1px solid #2d2d3a"><h1 style="color:#ef4444;margin:0 0 16px">❌ Request Rejected</h1><p>Hi <strong>${user.name}</strong>,</p><p>Your admin access request on <strong>ExamVision</strong> was not approved.</p></div>`,
    }).catch(err => console.error('Reject email failed:', err.message));
  } catch (err) {
    res.status(500).send(`<html><body><h2>Error: ${err.message}</h2></body></html>`);
  }
});

// ── Super Admin: list pending admin requests ──────────────────────
router.get('/admin/pending-admins', protect, adminOnly, async (req, res) => {
  if (!req.user.isSuperAdmin)
    return res.status(403).json({ message: 'Only the super admin can view this' });
  try {
    const admins = await User.find({ role: 'admin', adminStatus: { $in: ['pending', 'approved'] } })
      .select('-password -adminApprovalToken').sort({ createdAt: -1 });
    res.json(admins);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Super Admin: approve from dashboard ──────────────────────────
router.put('/admin/approve-admin/:id', protect, adminOnly, async (req, res) => {
  if (!req.user.isSuperAdmin)
    return res.status(403).json({ message: 'Only the super admin can approve admins' });
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'admin') return res.status(404).json({ message: 'Admin user not found' });
    user.adminStatus        = 'approved';
    user.adminApprovalToken = null;
    await user.save();
    await logAction(req, 'approve_admin', `Approved admin access for ${user.name} (${user.email})`, { targetUserId: user._id });
    res.json({ message: `${user.name} approved as admin` });
    sendEmail({
      email: user.email,
      subject: '✅ Your ExamVision Admin Access Has Been Approved',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;padding:32px;border:1px solid #2d2d3a"><h1 style="color:#22c55e;margin:0 0 16px">✅ Access Approved!</h1><p>Hi <strong>${user.name}</strong>, your admin access on <strong>ExamVision</strong> has been approved.</p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Go to Login →</a></div>`,
    }).catch(err => console.error('Approve email failed:', err.message));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Super Admin: reject from dashboard ───────────────────────────
router.put('/admin/reject-admin/:id', protect, adminOnly, async (req, res) => {
  if (!req.user.isSuperAdmin)
    return res.status(403).json({ message: 'Only the super admin can reject admins' });
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'admin') return res.status(404).json({ message: 'Admin user not found' });
    user.adminStatus        = 'rejected';
    user.adminApprovalToken = null;
    await user.save();
    await logAction(req, 'reject_admin', `Rejected admin request from ${user.name} (${user.email})`, { targetUserId: user._id });
    res.json({ message: `${user.name}'s admin request rejected` });
    sendEmail({
      email: user.email,
      subject: '❌ ExamVision Admin Request Rejected',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;padding:32px;border:1px solid #2d2d3a"><h1 style="color:#ef4444;margin:0 0 16px">❌ Request Rejected</h1><p>Hi <strong>${user.name}</strong>, your admin access request was not approved.</p></div>`,
    }).catch(err => console.error('Reject email failed:', err.message));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Super Admin: revoke approved admin ───────────────────────────
router.put('/admin/revoke-admin/:id', protect, adminOnly, async (req, res) => {
  if (!req.user.isSuperAdmin)
    return res.status(403).json({ message: 'Only the super admin can revoke admin access' });
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'admin') return res.status(404).json({ message: 'Admin user not found' });
    user.role        = 'teacher';
    user.adminStatus = null;
    await user.save();
    await logAction(req, 'revoke_admin', `Revoked admin access from ${user.name} (${user.email})`, { targetUserId: user._id });
    res.json({ message: `${user.name}'s admin access has been revoked` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Super Admin: promote teacher to admin ─────────────────────────
router.put('/admin/promote-teacher/:id', protect, adminOnly, async (req, res) => {
  if (!req.user.isSuperAdmin)
    return res.status(403).json({ message: 'Only the super admin can promote teachers' });
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'teacher') return res.status(404).json({ message: 'Teacher not found' });
    user.role        = 'admin';
    user.adminStatus = 'approved';
    await user.save();
    await logAction(req, 'promote_teacher', `Promoted ${user.name} (${user.email}) from teacher to admin`, { targetUserId: user._id });
    res.json({ message: `${user.name} has been promoted to admin` });
    sendEmail({
      email: user.email,
      subject: '✅ You have been promoted to Admin on ExamVision',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;padding:32px;border:1px solid #2d2d3a"><h1 style="color:#22c55e;margin:0 0 16px">🎉 You're now an Admin!</h1><p>Hi <strong>${user.name}</strong>,</p><p>The super admin has promoted you to <strong>Admin</strong> on ExamVision. Please log out and log back in.</p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Go to Login →</a></div>`,
    }).catch(err => console.error('Promote email failed:', err.message));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Me ────────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  if (req.user.isAdmin) return res.json(req.user);
  const user = await User.findById(req.user._id).select('-password -adminApprovalToken');
  res.json(user);
});

// ── Update profile ────────────────────────────────────────────────
router.put('/profile', protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    const user = await User.findByIdAndUpdate(req.user._id, { name: name.trim() }, { new: true }).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Forgot Password: send OTP ─────────────────────────────────────
router.post('/forgot-password', otpRequestLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found with this email' });

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 15 * 60 * 1000;

    user.resetOtp         = otp;
    user.resetOtpExpiry   = expiry;
    user.resetOtpAttempts = 0;
    await user.save();

    sendEmail({
      email: user.email,
      subject: '🔐 Your ExamVision Password Reset Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0f0f11;color:#e2e8f0;border-radius:12px;padding:32px;border:1px solid #2d2d3a">
          <h1 style="color:#6c63ff;margin:0 0 16px">🔐 Password Reset</h1>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Your password reset code is:</p>
          <div style="background:#1a1a2e;border:2px solid #6c63ff;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
            <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#6c63ff;font-family:monospace">${otp}</span>
          </div>
          <p style="color:#94a3b8;font-size:13px">This code expires in <strong style="color:#e2e8f0">15 minutes</strong>. If you didn't request this, ignore this email.</p>
        </div>
      `,
    }).catch(err => console.error('OTP email failed:', err.message));

    res.json({ message: 'Reset code sent to your email' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Forgot Password: verify OTP only ─────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and code are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.resetOtp || !user.resetOtpExpiry)
      return res.status(400).json({ message: 'No reset request found. Please request a new code.' });

    if (Date.now() > user.resetOtpExpiry) {
      user.resetOtp = null; user.resetOtpExpiry = null; user.resetOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
    }

    if (user.resetOtpAttempts >= 5) {
      user.resetOtp = null; user.resetOtpExpiry = null; user.resetOtpAttempts = 0;
      await user.save();
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (user.resetOtp !== otp.trim()) {
      user.resetOtpAttempts += 1;
      await user.save();
      const remaining = 5 - user.resetOtpAttempts;
      return res.status(400).json({
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      });
    }

    user.resetOtpAttempts = 0;
    await user.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Forgot Password: reset password ──────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ message: pwError });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found with this email' });
    if (!user.resetOtp || user.resetOtp !== otp)
      return res.status(400).json({ message: 'Invalid reset code' });
    if (Date.now() > user.resetOtpExpiry)
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });

    user.password         = newPassword;
    user.resetOtp         = null;
    user.resetOtpExpiry   = null;
    user.resetOtpAttempts = 0;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Change password ───────────────────────────────────────────────
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Both current and new password are required' });
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ message: pwError });
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(currentPassword)))
      return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Avatar ────────────────────────────────────────────────────────
router.put('/avatar', protect, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ message: 'No avatar provided' });
    if (avatar.length > 700000) return res.status(400).json({ message: 'Image too large.' });
    const user = await User.findByIdAndUpdate(req.user._id, { avatar }, { new: true }).select('-password');
    res.json({ avatar: user.avatar, message: 'Avatar updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Students list ─────────────────────────────────────────────────
router.get('/students', protect, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('name email avatar');
    res.json(students);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Get any user's public info ────────────────────────────────────
router.get('/user/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email role avatar');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Google OAuth ──────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const { email, name, picture, sub: googleId } = ticket.getPayload();
    let user = await User.findOne({ email });
    if (user) {
      if (!user.googleId) { user.googleId = googleId; await user.save(); }
      const token = signToken(user._id);
      return res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, adminStatus: user.adminStatus, avatar: user.avatar },
      });
    }
    return res.json({ needsOnboarding: true, googleId, email, name, avatar: picture || '' });
  } catch (err) { res.status(401).json({ message: 'Google authentication failed' }); }
});

// ── Google complete registration ──────────────────────────────────
router.post('/google/complete', async (req, res) => {
  try {
    const { googleId, email, name, avatar, role, password } = req.body;
    if (!role || !password) return res.status(400).json({ message: 'Role and password are required' });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ message: pwError });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    if (role === 'admin') {
      const approvalToken = crypto.randomBytes(32).toString('hex');
      const user = await User.create({ name, email, password, role: 'admin', googleId, avatar, adminStatus: 'pending', adminApprovalToken: approvalToken });
      await sendAdminRequestEmail(user, approvalToken);
      return res.status(201).json({
        adminPending: true,
        user: { _id: user._id, name: user.name, email: user.email, role: 'admin', adminStatus: 'pending' },
      });
    }

    const user = await User.create({ name, email, password, role, googleId, avatar });
    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: list users ─────────────────────────────────────────────
router.get('/admin/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/admin/users/:id/password', protect, adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const pwError = validatePassword(newPassword);
    if (pwError) return res.status(400).json({ message: pwError });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = newPassword;
    await user.save();
    await logAction(req, 'reset_password', `Reset password for ${user.name} (${user.email})`, { targetUserId: user._id });
    res.json({ message: `Password reset for ${user.name}` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await logAction(req, 'delete_user', `Deleted user ${user.name} (${user.email})`, { targetUserId: user._id });
    res.json({ message: `User ${user.name} deleted` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/admin/impersonate/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const token = signToken(user._id);
    await logAction(req, 'impersonate', `Logged in as ${user.name}`, { targetUserId: user._id });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/courses', protect, adminOnly, async (req, res) => {
  try {
    const Course = require('../models/Course');
    const courses = await Course.find().populate('teacher', 'name email').sort({ createdAt: -1 });
    res.json(courses);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/admin/courses/:id', protect, adminOnly, async (req, res) => {
  try {
    const Course       = require('../models/Course');
    const Test         = require('../models/Test');
    const Question     = require('../models/Question');
    const Attempt      = require('../models/Attempt');
    const Announcement = require('../models/Announcement');
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const tests   = await Test.find({ course: course._id }).select('_id');
    const testIds = tests.map(t => t._id);
    await Question.deleteMany({ test: { $in: testIds } });
    await Attempt.deleteMany({ test: { $in: testIds } });
    await Test.deleteMany({ course: course._id });
    await Announcement.deleteMany({ course: course._id });
    await Course.findByIdAndDelete(course._id);
    await logAction(req, 'delete_course', `Deleted course "${course.name}"`, { courseId: course._id });
    res.json({ message: `Course "${course.name}" and all its data deleted` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/tests', protect, adminOnly, async (req, res) => {
  try {
    const Test = require('../models/Test');
    const tests = await Test.find().populate('course', 'name').populate('teacher', 'name email').sort({ createdAt: -1 });
    res.json(tests);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/announcements', protect, adminOnly, async (req, res) => {
  try {
    const Announcement = require('../models/Announcement');
    const announcements = await Announcement.find().populate('course', 'name').populate('teacher', 'name email').sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/admin/announcements/global', protect, adminOnly, async (req, res) => {
  try {
    const Announcement = require('../models/Announcement');
    const Notification = require('../models/Notification');
    const { title, content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ message: 'Content is required' });
    const announcement = await Announcement.create({ title: title?.trim() || '', content: content.trim(), isGlobal: true, postedBy: req.user.name });
    const io = req.app.get('io');
    const recipients = await User.find({ role: { $in: ['student', 'teacher'] } }, '_id');
    if (recipients.length > 0) {
      const notifDocs = recipients.map(u => ({ user: u._id, type: 'announcement', title: `📢 ${title || 'Admin Announcement'}`, body: content.substring(0, 120), link: '/?tab=announcements' }));
      const saved = await Notification.insertMany(notifDocs);
      saved.forEach(n => io.to(`user_${n.user.toString()}`).emit('new_notification', n));
    }
    io.emit('new_global_announcement', { _id: announcement._id, title: announcement.title, content: announcement.content, isGlobal: true, postedBy: req.user.name, createdAt: announcement.createdAt });
    await logAction(req, 'global_announcement', `Posted global announcement: "${(title || content).substring(0, 80)}"`, { announcementId: announcement._id });
    res.status(201).json(announcement);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/admin/announcements/:id', protect, adminOnly, async (req, res) => {
  try {
    const Announcement = require('../models/Announcement');
    const a = await Announcement.findByIdAndDelete(req.params.id);
    if (!a) return res.status(404).json({ message: 'Announcement not found' });
    await logAction(req, 'delete_announcement', `Deleted announcement "${(a.title || a.content).substring(0, 60)}"`, { announcementId: a._id });
    res.json({ message: 'Announcement deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/admin/audit-logs', protect, adminOnly, async (req, res) => {
  try {
    const logs = await AdminLog.find().sort({ createdAt: -1 }).limit(500);
    res.json(logs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;