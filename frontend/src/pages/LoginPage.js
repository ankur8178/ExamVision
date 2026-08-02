import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { GoogleLogin } from '@react-oauth/google';
import api from '../utils/api';
import PasswordStrengthMeter from '../components/shared/PasswordStrengthMeter';

const PW_RULES = [
  v => v.length >= 8,
  v => /[A-Z]/.test(v),
  v => /[a-z]/.test(v),
  v => /[0-9]/.test(v),
  v => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(v),
];
const isStrongPassword = (v) => PW_RULES.every(r => r(v));

export default function LoginPage() {
  const [form, setForm]                 = useState({ email: '', password: '' });
  const [loading, setLoading]           = useState(false);
  const [adminPending, setAdminPending] = useState(false);
  const [pendingUser, setPendingUser]   = useState(null);

  const [onboarding, setOnboarding] = useState(false);
  const [googleData, setGoogleData] = useState(null);
  const [obForm, setObForm]         = useState({ role: 'student', password: '', confirm: '' });
  const [obLoading, setObLoading]   = useState(false);

  // ── Forgot password state ─────────────────────────────────────────
  const [forgotStep, setForgotStep] = useState(null); // null | 'email' | 'otp' | 'reset'
  const [fpEmail, setFpEmail]       = useState('');
  const [fpOtp, setFpOtp]           = useState('');
  const [fpPass, setFpPass]         = useState('');
  const [fpConfirm, setFpConfirm]   = useState('');
  const [fpLoading, setFpLoading]   = useState(false);

  const { login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (new URLSearchParams(location.search).get('promoted') === '1') {
      toast.success('🎉 You have been promoted to Admin! Please log in again to access your new dashboard.', { duration: 6000 });
    }
  }, [location]);

  const roleNav = (role) =>
    role === 'teacher' ? '/teacher' : role === 'admin' ? '/admin' : '/student';

  // ── Normal login ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      if (user.role === 'admin' && user.adminStatus === 'pending') {
        setPendingUser(user); setAdminPending(true); return;
      }
      toast.success(`Welcome back, ${user.name}!`);
      navigate(roleNav(user.role));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  // ── Forgot password handlers ──────────────────────────────────────
  const handleSendOtp = async () => {
    if (!fpEmail.trim()) return toast.error('Please enter your email');
    setFpLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: fpEmail.trim() });
      toast.success('Reset code sent! Check your email.');
      setForgotStep('otp');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reset code');
    } finally { setFpLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (!fpOtp.trim()) return toast.error('Please enter the reset code');
    setFpLoading(true);
    try {
      await api.post('/auth/verify-otp', { email: fpEmail.trim(), otp: fpOtp.trim() });
      setForgotStep('reset');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired code. Please try again.');
      setFpOtp('');
      if (err.response?.status === 429) setForgotStep('email');
    } finally { setFpLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!isStrongPassword(fpPass))
      return toast.error('Please meet all password requirements before continuing.');
    if (fpPass !== fpConfirm) return toast.error('Passwords do not match');
    setFpLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: fpEmail.trim(), otp: fpOtp.trim(), newPassword: fpPass,
      });
      toast.success('Password reset successfully! Please log in.');
      setForgotStep(null);
      setFpEmail(''); setFpOtp(''); setFpPass(''); setFpConfirm('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
      if (err.response?.data?.message?.includes('expired')) setForgotStep('email');
    } finally { setFpLoading(false); }
  };

  // ── Google OAuth ──────────────────────────────────────────────────
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await api.post('/auth/google', { credential: credentialResponse.credential });
      if (res.data.needsOnboarding) { setGoogleData(res.data); setOnboarding(true); return; }
      if (res.data.user?.role === 'admin' && res.data.user?.adminStatus === 'pending') {
        loginWithToken(res.data.token, res.data.user);
        setPendingUser(res.data.user); setAdminPending(true); return;
      }
      loginWithToken(res.data.token, res.data.user);
      toast.success(`Welcome back, ${res.data.user.name}!`);
      navigate(roleNav(res.data.user.role));
    } catch { toast.error('Google sign-in failed'); }
  };

  // ── Google onboarding ─────────────────────────────────────────────
  const handleOnboardingSubmit = async () => {
    if (!isStrongPassword(obForm.password))
      return toast.error('Please meet all password requirements.');
    if (obForm.password !== obForm.confirm) return toast.error('Passwords do not match');
    setObLoading(true);
    try {
      const res = await api.post('/auth/google/complete', {
        googleId: googleData.googleId, email: googleData.email,
        name: googleData.name, avatar: googleData.avatar,
        role: obForm.role, password: obForm.password,
      });
      if (res.data.adminPending) { setOnboarding(false); setPendingUser(res.data.user); setAdminPending(true); return; }
      loginWithToken(res.data.token, res.data.user);
      toast.success(`Account created! Welcome, ${res.data.user.name}!`);
      navigate(roleNav(res.data.user.role));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create account');
    } finally { setObLoading(false); }
  };

  // ── Forgot Password Modal ─────────────────────────────────────────
  if (forgotStep) {
    return (
      <div style={S.page}>
        <div style={S.bg} />
        <div style={S.pendingCard}>
          <div style={S.cardLogo}>
            <span style={S.logoIcon}>⬡</span>
            <span style={S.logoText}>ExamVision</span>
          </div>

          {/* Step 1 — Enter email */}
          {forgotStep === 'email' && <>
            <div style={S.pendingIconWrap}>
              <div style={{ ...S.pendingIconRing, background: 'rgba(108,99,255,0.08)', border: '2px solid rgba(108,99,255,0.25)' }}>
                <span style={S.pendingIconEmoji}>🔐</span>
              </div>
            </div>
            <h2 style={S.pendingTitle}>Forgot Password</h2>
            <p style={S.pendingSub}>Enter your account email and we'll send you a 6-digit reset code.</p>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label className="input-label">Email address</label>
              <input className="input" type="email" placeholder="you@example.com"
                value={fpEmail} onChange={e => setFpEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()} />
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={handleSendOtp}
              disabled={fpLoading} style={{ justifyContent: 'center' }}>
              {fpLoading ? <span className="spinner" /> : '📧 Send Reset Code'}
            </button>
            <button onClick={() => setForgotStep(null)} style={S.cancelBtn}>← Back to Login</button>
          </>}

          {/* Step 2 — Enter OTP */}
          {forgotStep === 'otp' && <>
            <div style={S.pendingIconWrap}>
              <div style={{ ...S.pendingIconRing, background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.25)' }}>
                <span style={S.pendingIconEmoji}>📬</span>
              </div>
            </div>
            <h2 style={S.pendingTitle}>Check Your Email</h2>
            <p style={S.pendingSub}>
              We sent a 6-digit code to <strong style={{ color: 'var(--accent2)' }}>{fpEmail}</strong>. Enter it below.
            </p>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label className="input-label">Reset Code</label>
              <input className="input" type="text" placeholder="Enter 6-digit code"
                value={fpOtp} onChange={e => setFpOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                style={{ letterSpacing: 8, fontSize: 20, textAlign: 'center', fontFamily: 'monospace' }} />
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={handleVerifyOtp}
              disabled={fpLoading || fpOtp.length < 6} style={{ justifyContent: 'center' }}>
              {fpLoading ? <span className="spinner" /> : 'Verify Code →'}
            </button>
            <button onClick={() => { handleSendOtp(); toast.success('New code sent!'); }}
              style={{ ...S.cancelBtn, color: 'var(--accent2)', marginTop: 8 }}>
              Resend code
            </button>
            <button onClick={() => setForgotStep('email')} style={S.cancelBtn}>← Change email</button>
          </>}

          {/* Step 3 — New password */}
          {forgotStep === 'reset' && <>
            <div style={S.pendingIconWrap}>
              <div style={{ ...S.pendingIconRing, background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.25)' }}>
                <span style={S.pendingIconEmoji}>🔑</span>
              </div>
            </div>
            <h2 style={S.pendingTitle}>Set New Password</h2>
            <p style={S.pendingSub}>Choose a strong password for your account.</p>
            <div className="input-group" style={{ marginBottom: 6 }}>
              <label className="input-label">New Password</label>
              <input className="input" type="password" placeholder="Min. 8 characters"
                value={fpPass} onChange={e => setFpPass(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <PasswordStrengthMeter password={fpPass} />
            </div>
            <div className="input-group" style={{ marginBottom: 20 }}>
              <label className="input-label">Confirm Password</label>
              <input className="input" type="password" placeholder="Repeat password"
                value={fpConfirm} onChange={e => setFpConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleResetPassword()} />
              {fpConfirm && fpPass !== fpConfirm && (
                <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>
                  ⚠ Passwords do not match
                </span>
              )}
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={handleResetPassword}
              disabled={fpLoading || !isStrongPassword(fpPass) || fpPass !== fpConfirm}
              style={{ justifyContent: 'center' }}>
              {fpLoading ? <span className="spinner" /> : '✅ Reset Password'}
            </button>
            <button onClick={() => setForgotStep('otp')} style={S.cancelBtn}>← Back</button>
          </>}
        </div>
      </div>
    );
  }

  // ── Pending Admin Screen ──────────────────────────────────────────
  if (adminPending) {
    return (
      <div style={S.page}>
        <div style={S.bg} />
        <div style={S.pendingCard}>
          <div style={S.cardLogo}>
            <span style={S.logoIcon}>⬡</span>
            <span style={S.logoText}>ExamVision</span>
          </div>
          <div style={S.pendingIconWrap}>
            <div style={S.pendingIconRing}>
              <span style={S.pendingIconEmoji}>⏳</span>
            </div>
          </div>
          <h2 style={S.pendingTitle}>Awaiting Approval</h2>
          <p style={S.pendingSub}>
            Hi <strong style={{ color: 'var(--text)' }}>{pendingUser?.name}</strong>, your admin access
            request is under review by the super admin. You'll be notified by email once a decision is made.
          </p>
          <div style={S.pendingBox}>
            {[
              { icon: '📧', text: 'A notification has been sent to the super admin.' },
              { icon: '✅', text: 'You will receive an email when your request is approved.' },
              { icon: '🔒', text: 'Your account exists but has no dashboard access until approval.' },
              { icon: '❌', text: 'If rejected, you will be notified by email with next steps.' },
            ].map(({ icon, text }) => (
              <div key={text} style={S.pendingRow}>
                <span style={S.pendingRowIcon}>{icon}</span>
                <span style={S.pendingRowText}>{text}</span>
              </div>
            ))}
          </div>
          {pendingUser?.email && (
            <div style={S.pendingEmailChip}>
              <span style={{ opacity: 0.6, fontSize: 12 }}>Request submitted for</span>
              <span style={S.pendingEmail}>{pendingUser.email}</span>
            </div>
          )}
          <button className="btn btn-primary w-full btn-lg"
            onClick={() => { setAdminPending(false); setPendingUser(null); }}
            style={{ justifyContent: 'center', marginTop: 4 }}>
            ← Back to Login
          </button>
          <p style={S.pendingFooter}>
            Registered with the wrong role?{' '}
            <Link to="/register" style={{ color: 'var(--accent2)' }}>Create a new account</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Main Login Page ───────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.bg} />

      {onboarding && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <div style={S.modalLogo}>
              <span style={S.logoIcon}>⬡</span>
              <span style={S.logoText}>ExamVision</span>
            </div>
            <h2 style={S.modalTitle}>One last step</h2>
            <p style={S.modalSub}>
              Welcome, <strong>{googleData?.name}</strong>! Choose your role and set a password to complete your account.
            </p>
            <div style={S.modalSection}>
              <label style={S.modalLabel}>I am a</label>
              <div style={S.roleSelectThree}>
                {[
                  { value: 'student', label: '🎓 Student' },
                  { value: 'teacher', label: '👨‍🏫 Teacher' },
                  { value: 'admin',   label: '🛡️ Admin'   },
                ].map(r => (
                  <button key={r.value} type="button"
                    onClick={() => setObForm({ ...obForm, role: r.value })}
                    style={{ ...S.roleBtn, ...(obForm.role === r.value ? S.roleBtnActive : {}) }}>
                    {r.label}
                  </button>
                ))}
              </div>
              {obForm.role === 'admin' && (
                <p style={S.adminNote}>⚠️ Admin accounts require super admin approval before access is granted.</p>
              )}
            </div>
            <div style={S.modalSection}>
              <label style={S.modalLabel}>Set a password</label>
              <input className="input" type="password" placeholder="Min. 8 characters"
                value={obForm.password} onChange={e => setObForm({ ...obForm, password: e.target.value })}
                style={{ marginBottom: 6 }} />
              <PasswordStrengthMeter password={obForm.password} />
              <input className="input" type="password" placeholder="Confirm password"
                value={obForm.confirm} onChange={e => setObForm({ ...obForm, confirm: e.target.value })}
                style={{ marginTop: 10 }} />
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={handleOnboardingSubmit}
              disabled={obLoading} style={{ justifyContent: 'center', marginTop: 8 }}>
              {obLoading ? <span className="spinner" /> : obForm.role === 'admin' ? 'Request Admin Access' : 'Create Account'}
            </button>
            <button onClick={() => setOnboarding(false)} style={S.cancelBtn}>Cancel</button>
          </div>
        </div>
      )}

      <div style={S.container}>
        <div style={S.left}>
          <div style={S.logo}>
            <span style={S.logoIcon}>⬡</span>
            <span style={S.logoText}>ExamVision</span>
          </div>
          <h1 style={S.headline}>The smarter way to ace exams.</h1>
          <p style={S.tagline}>
            A secure, AI-assisted exam platform built for modern education.
            Monitor students in real time, detect violations, and review recordings — all in one place.
          </p>
          <div style={S.features}>
            {[
              { icon: '🛡️', title: 'Violation Detection',       desc: 'Tab switches, fullscreen exits, copy-paste blocking' },
              { icon: '📹', title: 'Screen & Camera Recording', desc: 'Auto-uploaded on submission, reviewable by teacher' },
              { icon: '📊', title: 'Analytics & Leaderboard',   desc: 'Score distribution, per-question time tracking' },
              { icon: '💬', title: 'Live Messaging',             desc: 'Students and teachers communicate during the exam' },
            ].map(f => (
              <div key={f.title} style={S.featureRow}>
                <span style={S.featureIcon}>{f.icon}</span>
                <div>
                  <div style={S.featureTitle}>{f.title}</div>
                  <div style={S.featureDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.right}>
          <div style={S.card}>
            <div style={S.cardLogo}>
              <span style={S.logoIcon}>⬡</span>
              <span style={S.logoText}>ExamVision</span>
            </div>
            <h2 style={S.title}>Sign in to your account</h2>
            <p style={S.sub}>Secure exam proctoring platform</p>
            <form onSubmit={handleSubmit} style={S.form}>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input className="input" type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="input-group">
                <label className="input-label">Password</label>
                <input className="input" type="password" placeholder="••••••••"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              </div>
              <div style={{ textAlign: 'right', marginTop: -8 }}>
                <button type="button" onClick={() => { setFpEmail(form.email); setForgotStep('email'); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent2)', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                  Forgot password?
                </button>
              </div>
              <button className="btn btn-primary w-full btn-lg" type="submit" disabled={loading}
                style={{ justifyContent: 'center', marginTop: 8 }}>
                {loading ? <span className="spinner" /> : 'Sign In'}
              </button>
            </form>
            <div style={S.divider}>
              <div style={S.dividerLine} />
              <span style={S.dividerText}>or</span>
              <div style={S.dividerLine} />
            </div>
            <div style={S.googleWrapper}>
              <GoogleLogin onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google sign-in failed')}
                width="320" text="signin_with_google" shape="rectangular" theme="outline" />
            </div>
            <p style={S.switch}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color: 'var(--accent2)' }}>Create one</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  page:       { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative' },
  bg:         { position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 20% 50%, rgba(108,99,255,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(236,72,153,0.05) 0%, transparent 50%)', pointerEvents: 'none' },
  container:  { display: 'flex', alignItems: 'center', gap: 60, width: '100%', maxWidth: 1000, position: 'relative' },
  left:         { flex: 1, display: 'flex', flexDirection: 'column', gap: 0 },
  logo:         { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon:     { fontSize: 28, color: 'var(--accent2)' },
  logoText:     { fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22 },
  headline:     { fontSize: 36, fontFamily: 'Syne, sans-serif', fontWeight: 800, lineHeight: 1.2, marginBottom: 16, color: 'var(--text)' },
  tagline:      { fontSize: 15, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 36 },
  features:     { display: 'flex', flexDirection: 'column', gap: 20 },
  featureRow:   { display: 'flex', alignItems: 'flex-start', gap: 14 },
  featureIcon:  { fontSize: 22, flexShrink: 0, marginTop: 2 },
  featureTitle: { fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 2 },
  featureDesc:  { fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 },
  right:    { flexShrink: 0, width: 400 },
  card:     { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px', width: '100%' },
  cardLogo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
  title:    { fontSize: 22, marginBottom: 6 },
  sub:      { color: 'var(--text3)', fontSize: 14, marginBottom: 28 },
  form:     { display: 'flex', flexDirection: 'column', gap: 16 },
  divider:      { display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' },
  dividerLine:  { flex: 1, height: 1, background: 'var(--border)' },
  dividerText:  { fontSize: 12, color: 'var(--text3)' },
  googleWrapper: { display: 'flex', justifyContent: 'center', marginBottom: 8 },
  switch:   { textAlign: 'center', marginTop: 24, color: 'var(--text3)', fontSize: 14 },
  pendingCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px', width: '100%', maxWidth: 460, position: 'relative' },
  pendingIconWrap: { display: 'flex', justifyContent: 'center', margin: '12px 0 24px' },
  pendingIconRing: { width: 88, height: 88, borderRadius: '50%', background: 'rgba(245,158,11,0.08)', border: '2px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pendingIconEmoji: { fontSize: 40, lineHeight: 1 },
  pendingTitle: { fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 10 },
  pendingSub:   { color: 'var(--text3)', fontSize: 14, textAlign: 'center', lineHeight: 1.65, marginBottom: 24 },
  pendingBox:   { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13, marginBottom: 20 },
  pendingRow:     { display: 'flex', gap: 11, alignItems: 'flex-start' },
  pendingRowIcon: { fontSize: 15, flexShrink: 0, marginTop: 1 },
  pendingRowText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 },
  pendingEmailChip: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 18 },
  pendingEmail:  { fontSize: 13, fontWeight: 600, color: 'var(--accent2)' },
  pendingFooter: { textAlign: 'center', marginTop: 16, color: 'var(--text3)', fontSize: 13 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal:        { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px', width: '100%', maxWidth: 420 },
  modalLogo:    { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  modalTitle:   { fontSize: 22, marginBottom: 8 },
  modalSub:     { color: 'var(--text3)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 },
  modalSection: { marginBottom: 16 },
  modalLabel:   { display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 8, fontWeight: 500 },
  roleSelectThree: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  roleBtn:      { padding: '10px 4px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s' },
  roleBtnActive: { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent2)' },
  adminNote:    { marginTop: 10, fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.5 },
  cancelBtn:    { width: '100%', marginTop: 12, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 },
};