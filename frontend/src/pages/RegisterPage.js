import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  v => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(v),
];
const isStrongPassword = (v) => PW_RULES.every(r => r(v));

export default function RegisterPage() {
  const [form, setForm]       = useState({ name: '', email: '', password: '', confirm: '', role: 'student' });
  const [loading, setLoading] = useState(false);
  const [adminPending, setAdminPending] = useState(false);
  const [pendingName, setPendingName]   = useState('');

  const [onboarding, setOnboarding] = useState(false);
  const [googleData, setGoogleData] = useState(null);
  const [obForm, setObForm]         = useState({ role: 'student', password: '', confirm: '' });
  const [obLoading, setObLoading]   = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isStrongPassword(form.password))
      return toast.error('Please meet all password requirements.');
    if (form.password !== form.confirm)
      return toast.error('Passwords do not match');
    setLoading(true);
    try {
      if (form.role === 'admin') {
        const res = await api.post('/auth/register', {
          name: form.name, email: form.email, password: form.password, role: form.role,
        });
        if (res.data.adminPending) { setPendingName(form.name); setAdminPending(true); }
      } else {
        const user = await register(form.name, form.email, form.password, form.role);
        toast.success('Account created!');
        navigate(user.role === 'teacher' ? '/teacher' : '/student');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await api.post('/auth/google', { credential: credentialResponse.credential });
      if (res.data.needsOnboarding) { setGoogleData(res.data); setOnboarding(true); return; }
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      toast.success(`Welcome back, ${res.data.user.name}!`);
      navigate(res.data.user.role === 'teacher' ? '/teacher' : '/student');
    } catch { toast.error('Google sign-in failed'); }
  };

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
      if (res.data.adminPending) { setPendingName(googleData.name); setOnboarding(false); setAdminPending(true); return; }
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      toast.success(`Account created! Welcome, ${res.data.user.name}!`);
      navigate(res.data.user.role === 'teacher' ? '/teacher' : '/student');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create account');
    } finally { setObLoading(false); }
  };

  // ── Admin Pending Screen ──────────────────────────────────────────
  if (adminPending) {
    return (
      <div style={styles.page}>
        <div style={styles.bg} />
        <div style={styles.card}>
          <div style={styles.logo}>
            <span style={{ fontSize: 28, color: 'var(--accent2)' }}>⬡</span>
            <span style={styles.logoText}>ExamVision</span>
          </div>
          <div style={styles.pendingIconWrap}>
            <span style={styles.pendingIcon}>⏳</span>
          </div>
          <h2 style={styles.title}>Request Sent!</h2>
          <p style={styles.sub}>
            Hi <strong>{pendingName}</strong>, your admin access request has been submitted
            and is pending approval from the super admin.
          </p>
          <div style={styles.pendingInfoBox}>
            <div style={styles.pendingInfoRow}>
              <span style={styles.pendingInfoIcon}>📧</span>
              <span>The super admin has been notified by email and will review your request shortly.</span>
            </div>
            <div style={styles.pendingInfoRow}>
              <span style={styles.pendingInfoIcon}>✅</span>
              <span>Once approved, you'll receive a confirmation email and can log in.</span>
            </div>
            <div style={styles.pendingInfoRow}>
              <span style={styles.pendingInfoIcon}>🔒</span>
              <span>Your account exists but has no access until approved.</span>
            </div>
          </div>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button className="btn btn-primary w-full btn-lg" style={{ justifyContent: 'center', marginTop: 8 }}>
              Go to Login
            </button>
          </Link>
          <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--text3)', fontSize: 13 }}>
            Registered with the wrong role?{' '}
            <button onClick={() => setAdminPending(false)}
              style={{ background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontSize: 13 }}>
              Go back
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.bg} />

      {/* ── Onboarding Modal ── */}
      {onboarding && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalLogo}>
              <span style={{ fontSize: 28, color: 'var(--accent2)' }}>⬡</span>
              <span style={styles.logoText}>ExamVision</span>
            </div>
            <h2 style={styles.modalTitle}>Complete your account</h2>
            <p style={styles.modalSub}>Hi <strong>{googleData?.name}</strong>! Choose your role and set a password.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={styles.modalLabel}>I am a</label>
              <div style={styles.roleSelect}>
                {[
                  { value: 'student', label: '🎓 Student' },
                  { value: 'teacher', label: '👨‍🏫 Teacher' },
                  { value: 'admin',   label: '🛡️ Admin' },
                ].map(r => (
                  <button key={r.value} type="button"
                    onClick={() => setObForm({ ...obForm, role: r.value })}
                    style={{ ...styles.roleBtn, ...(obForm.role === r.value ? styles.roleBtnActive : {}) }}>
                    {r.label}
                  </button>
                ))}
              </div>
              {obForm.role === 'admin' && (
                <p style={styles.adminNote}>⚠️ Admin accounts require super admin approval before access is granted.</p>
              )}
            </div>
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={styles.modalLabel}>Set a password</label>
              <input className="input" type="password" placeholder="Min. 8 characters"
                value={obForm.password} onChange={e => setObForm({ ...obForm, password: e.target.value })} />
              <PasswordStrengthMeter password={obForm.password} />
              <input className="input" type="password" placeholder="Confirm password"
                value={obForm.confirm} onChange={e => setObForm({ ...obForm, confirm: e.target.value })}
                style={{ marginTop: 6 }} />
            </div>
            <button className="btn btn-primary w-full btn-lg" onClick={handleOnboardingSubmit}
              disabled={obLoading} style={{ justifyContent: 'center', marginTop: 8 }}>
              {obLoading ? <span className="spinner" /> : obForm.role === 'admin' ? 'Request Admin Access' : 'Create Account'}
            </button>
            <button onClick={() => setOnboarding(false)} style={styles.cancelBtn}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={{ fontSize: 28, color: 'var(--accent2)' }}>⬡</span>
          <span style={styles.logoText}>ExamVision</span>
        </div>
        <h2 style={styles.title}>Create your account</h2>
        <p style={styles.sub}>Join the secure exam platform</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <input className="input" placeholder="John Doe"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input className="input" type="email" placeholder="you@example.com"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input className="input" type="password" placeholder="Min. 8 characters"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            <PasswordStrengthMeter password={form.password} />
          </div>
          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <input className="input" type="password" placeholder="Repeat password"
              value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} required />
            {form.confirm && form.password !== form.confirm && (
              <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>
                ⚠ Passwords do not match
              </span>
            )}
          </div>
          <div className="input-group">
            <label className="input-label">I am a</label>
            <div style={styles.roleSelect}>
              {[
                { value: 'student', label: '🎓 Student' },
                { value: 'teacher', label: '👨‍🏫 Teacher' },
                { value: 'admin',   label: '🛡️ Admin' },
              ].map(r => (
                <button key={r.value} type="button"
                  onClick={() => setForm({ ...form, role: r.value })}
                  style={{ ...styles.roleBtn, ...(form.role === r.value ? styles.roleBtnActive : {}) }}>
                  {r.label}
                </button>
              ))}
            </div>
            {form.role === 'admin' && (
              <p style={styles.adminNote}>⚠️ Admin accounts require super admin approval before access is granted.</p>
            )}
          </div>
          <button className="btn btn-primary w-full btn-lg" type="submit"
            disabled={loading || !isStrongPassword(form.password) || form.password !== form.confirm}
            style={{ justifyContent: 'center', marginTop: 8 }}>
            {loading ? <span className="spinner" /> : form.role === 'admin' ? 'Request Admin Access' : 'Create Account'}
          </button>
        </form>

        <div style={styles.divider}>
          <div style={styles.dividerLine} /><span style={styles.dividerText}>or</span><div style={styles.dividerLine} />
        </div>
        <div style={styles.googleWrapper}>
          <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => toast.error('Google sign-in failed')}
            width="340" text="continue_with_google" shape="rectangular" theme="outline" />
        </div>
        <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text3)', fontSize: 14 }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--accent2)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative' },
  bg: { position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 80% 50%, rgba(108,99,255,0.08) 0%, transparent 60%)', pointerEvents: 'none' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px', width: '100%', maxWidth: 420, position: 'relative' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 },
  logoText: { fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22 },
  title: { fontSize: 26, marginBottom: 6 },
  sub: { color: 'var(--text3)', fontSize: 14, marginBottom: 28 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  roleSelect: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  roleBtn: { padding: '10px 6px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s' },
  roleBtnActive: { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent2)' },
  adminNote: { marginTop: 10, fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '8px 10px' },
  divider: { display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' },
  dividerLine: { flex: 1, height: 1, background: 'var(--border)' },
  dividerText: { fontSize: 12, color: 'var(--text3)' },
  googleWrapper: { display: 'flex', justifyContent: 'center', marginBottom: 8 },
  pendingIconWrap: { textAlign: 'center', margin: '8px 0 16px' },
  pendingIcon: { fontSize: 52 },
  pendingInfoBox: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0 24px' },
  pendingInfoRow: { display: 'flex', gap: 10, fontSize: 13, color: 'var(--text2)', alignItems: 'flex-start', lineHeight: 1.5 },
  pendingInfoIcon: { flexShrink: 0, fontSize: 15 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '40px', width: '100%', maxWidth: 420 },
  modalLogo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  modalTitle: { fontSize: 22, marginBottom: 8 },
  modalSub: { color: 'var(--text3)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 },
  modalLabel: { display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 8, fontWeight: 500 },
  cancelBtn: { width: '100%', marginTop: 12, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 },
};