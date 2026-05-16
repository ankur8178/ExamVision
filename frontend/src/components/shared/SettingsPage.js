import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── Section wrapper ───────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }) {
  return (
    <div style={S.section}>
      <div style={S.sectionHeader}>
        <span style={S.sectionIcon}>{icon}</span>
        <div>
          <div style={S.sectionTitle}>{title}</div>
          {subtitle && <div style={S.sectionSub}>{subtitle}</div>}
        </div>
      </div>
      <div style={S.sectionBody}>{children}</div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label, sub }) {
  const reducedMotion = document.documentElement.classList.contains('reduced-motion');
  const transition = reducedMotion ? 'none' : undefined;

  return (
    <div style={S.toggleRow}>
      <div style={{ flex: 1 }}>
        <div style={S.toggleLabel}>{label}</div>
        {sub && <div style={S.toggleSub}>{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          ...S.toggleBtn,
          background: value ? '#3b82f6' : '#9ca3af',
          transition: transition ?? 'background 0.25s',
        }}
      >
        <span style={{
          ...S.toggleThumb,
          transform: value ? 'translateX(22px)' : 'translateX(2px)',
          transition: transition ?? 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </button>
    </div>
  );
}

// ── Live Proctoring Card ──────────────────────────────────────────────
function LiveProctoringCard({ test, onView }) {
  return (
    <div style={S.proctoringCard}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
          {test.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {test.courseName || 'No course'}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginTop: 6, flexWrap: 'wrap',
        }}>
          <span style={S.liveBadge}>● LIVE</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {test.activeStudents ?? 0} student{test.activeStudents !== 1 ? 's' : ''} active
          </span>
          {test.violations > 0 && (
            <span style={S.violationBadge}>
              ⚠ {test.violations} violation{test.violations !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => onView(test._id)}
        style={{ flexShrink: 0 }}
      >
        Monitor
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const isTeacher = user?.role === 'teacher';

  // ── Profile ──────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Password ─────────────────────────────────────────────────────
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // ── Theme ────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') || 'dark'
  );
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    applyTheme(theme);
  }, [theme]);

  // ── Notifications ─────────────────────────────────────────────────
  const [notifs, setNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notif_prefs') || '{}'); }
    catch { return {}; }
  });
  const defaultNotifs = {
    emailOnMessage: true, emailOnResult: true,
    inAppMessage: true, inAppViolation: true,
  };
  const notifState = { ...defaultNotifs, ...notifs };

  // ── Timezone ─────────────────────────────────────────────────────
  const [tz, setTz] = useState(
    () => localStorage.getItem('timezone') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  const timezones = [
    'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Shanghai',
    'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok',
    'Australia/Sydney', 'Australia/Melbourne', 'Europe/London',
    'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'UTC',
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Sao_Paulo', 'America/Toronto',
    'America/Mexico_City',
  ];

  const tzLabels = {
    'Asia/Kolkata':        'India — IST',
    'Asia/Tokyo':          'Tokyo — JST',
    'Asia/Singapore':      'Singapore — SGT',
    'Asia/Shanghai':       'China — CST',
    'Asia/Dubai':          'Dubai — GST',
    'Asia/Karachi':        'Karachi — PKT',
    'Asia/Dhaka':          'Dhaka — BST',
    'Asia/Bangkok':        'Bangkok — ICT',
    'Australia/Sydney':    'Sydney — AEDT',
    'Australia/Melbourne': 'Melbourne — AEDT',
    'Europe/London':       'London — GMT/BST',
    'Europe/Paris':        'Paris — CET/CEST',
    'Europe/Berlin':       'Berlin — CET/CEST',
    'Europe/Moscow':       'Moscow — MSK',
    'UTC':                 'UTC',
    'America/New_York':    'New York — EST/EDT',
    'America/Chicago':     'Chicago — CST/CDT',
    'America/Denver':      'Denver — MST/MDT',
    'America/Los_Angeles': 'Los Angeles — PST/PDT',
    'America/Sao_Paulo':   'São Paulo — BRT',
    'America/Toronto':     'Toronto — EST/EDT',
    'America/Mexico_City': 'Mexico City — CST',
  };

  // ── Accessibility ─────────────────────────────────────────────────
  const [a11y, setA11y] = useState(() => {
    try { return JSON.parse(localStorage.getItem('a11y_prefs') || '{}'); }
    catch { return {}; }
  });
  const defaultA11y = { largeFont: false, highContrast: false, reducedMotion: false };
  const a11yState = { ...defaultA11y, ...a11y };

  useEffect(() => {
    applyAccessibility(a11yState);
    // eslint-disable-next-line
  }, []);

  // ── Teacher: Security preset ──────────────────────────────────────
  const [secPreset, setSecPreset] = useState(() => {
    try { return JSON.parse(localStorage.getItem('default_security') || '{}'); }
    catch { return {}; }
  });
  const defaultSec = {
    tabSwitchDetection: true, fullscreenEnforcement: false,
    copyPasteBlocking: true, rightClickBlocking: true,
    questionRandomization: false, oneWayNavigation: false,
    perQuestionTimeTracking: true, autoSubmitOnMaxViolations: true,
    maxTabSwitches: 3,
  };
  const secState = { ...defaultSec, ...secPreset };

  // ── Teacher: Grading prefs ────────────────────────────────────────
  const [grading, setGrading] = useState(() => {
    try { return JSON.parse(localStorage.getItem('grading_prefs') || '{}'); }
    catch { return {}; }
  });
  const defaultGrading = {
    passPercent: 40, autoShowResults: false, showCorrectAnswers: true,
  };
  const gradingState = { ...defaultGrading, ...grading };

  // ── Teacher: Live proctoring ──────────────────────────────────────
  const [liveTests, setLiveTests] = useState([]);
  const [loadingLive, setLoadingLive] = useState(false);

  const fetchLive = () => {
    api.get('/tests/live')
      .then(res => setLiveTests(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setLiveTests([]));
  };

  useEffect(() => {
    if (!isTeacher) return;
    setLoadingLive(true);
    api.get('/tests/live')
      .then(res => setLiveTests(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setLiveTests([]))
      .finally(() => setLoadingLive(false));

    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, [isTeacher]);

  // ── Student: Exam history ─────────────────────────────────────────
  const [attempts, setAttempts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isTeacher) return;
    setLoadingHistory(true);
    api.get('/attempts/my-history')
      .catch(() => ({ data: [] }))
      .then(res => {
        setAttempts(Array.isArray(res?.data) ? res.data : []);
        setLoadingHistory(false);
      });
  }, [isTeacher]);

  // ── Sessions ─────────────────────────────────────────────────────
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/sessions');
      const raw = Array.isArray(res.data) ? res.data : [];
      const seen = new Map();
      const sorted = [...raw].sort((a, b) => {
        if (a.current) return -1;
        if (b.current) return 1;
        return new Date(b.lastActive) - new Date(a.lastActive);
      });
      sorted.forEach(s => {
        const key = `${s.browser}|${s.os}|${s.device}`;
        if (!seen.has(key)) seen.set(key, s);
      });
      setSessions([...seen.values()]);
    } catch {
      setSessions([{
        _id: 'current', device: 'Desktop', browser: getBrowser(),
        os: getOS(), ip: '', current: true, lastActive: new Date().toISOString(),
      }]);
    } finally { setLoadingSessions(false); }
  }, []);

  useEffect(() => {
    api.post('/sessions/track').catch(() => {});
    fetchSessions();
  }, [fetchSessions]);

  // ── Handlers ─────────────────────────────────────────────────────
  const applyTheme = (t) => {
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.remove('dark', 'light', 'dim');
    document.documentElement.classList.add(t);
    document.body.classList.remove('dark', 'light', 'dim');
    document.body.classList.add(t);
    document.documentElement.style.setProperty('--current-theme', t);
  };

  const saveProfile = async () => {
    if (!profile.name.trim()) return toast.error('Name cannot be empty');
    setSavingProfile(true);
    try {
      const res = await api.put('/auth/profile', { name: profile.name });
      updateUser({ ...user, name: res.data.name || profile.name });
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally { setSavingProfile(false); }
  };

  const savePassword = async () => {
    if (!pwd.current || !pwd.next || !pwd.confirm)
      return toast.error('Fill all fields');
    if (pwd.next.length < 6)
      return toast.error('Password must be at least 6 characters');
    if (pwd.next !== pwd.confirm)
      return toast.error('Passwords do not match');
    setSavingPwd(true);
    try {
      await api.put('/auth/password', {
        currentPassword: pwd.current, newPassword: pwd.next,
      });
      setPwd({ current: '', next: '', confirm: '' });
      toast.success('Password changed!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setSavingPwd(false); }
  };

  const saveNotifs = (key, val) => {
    const updated = { ...notifState, [key]: val };
    setNotifs(updated);
    localStorage.setItem('notif_prefs', JSON.stringify(updated));
    toast.success('Preference saved');
  };

  const saveTz = (val) => {
    setTz(val);
    localStorage.setItem('timezone', val);
    toast.success('Timezone saved');
  };

  const saveA11y = (key, val) => {
    const updated = { ...a11yState, [key]: val };
    setA11y(updated);
    localStorage.setItem('a11y_prefs', JSON.stringify(updated));
    applyAccessibility(updated);
    toast.success('Accessibility preference saved');
  };

  const applyAccessibility = (prefs) => {
    const root = document.documentElement;
    if (prefs.largeFont) { root.classList.add('large-text'); }
    else { root.classList.remove('large-text'); }
    if (prefs.highContrast) { root.classList.add('high-contrast'); }
    else { root.classList.remove('high-contrast'); }
    if (prefs.reducedMotion) { root.classList.add('reduced-motion'); }
    else { root.classList.remove('reduced-motion'); }
  };

  const saveSecPreset = (key, val) => {
    const updated = { ...secState, [key]: val };
    setSecPreset(updated);
    localStorage.setItem('default_security', JSON.stringify(updated));
    toast.success('Default security updated');
  };

  const saveGrading = (key, val) => {
    const updated = { ...gradingState, [key]: val };
    setGrading(updated);
    localStorage.setItem('grading_prefs', JSON.stringify(updated));
    toast.success('Grading preference saved');
  };

  const handleLogoutOtherSessions = async () => {
    try {
      await api.delete('/sessions/others');
      toast.success('All other sessions logged out');
      fetchSessions();
    } catch {
      toast.error('Failed to logout other sessions');
    }
  };

  const handleLogoutSession = async (sessionId) => {
    try {
      await api.delete(`/sessions/${sessionId}`);
      toast.success('Session removed');
      fetchSessions();
    } catch {
      toast.error('Failed to remove session');
    }
  };

  const handleViewLive = (testId) => {
    navigate(`/teacher/test/${testId}?tab=monitor`);
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.pageTitle}>Settings</h1>
          <p style={S.pageSub}>Manage your account, preferences, and platform defaults</p>
        </div>
        <div style={S.rolePill}>
          <span style={{ fontSize: 14 }}>{isTeacher ? '👨‍🏫' : '👨‍🎓'}</span>
          <span style={{ textTransform: 'capitalize', fontSize: 13, fontWeight: 600 }}>
            {user?.role}
          </span>
        </div>
      </div>

      {/* Two-column grid */}
      <div style={S.grid}>

        {/* ── LEFT COLUMN ── */}
        <div style={S.col}>

          {/* Profile */}
          <Section icon="👤" title="Profile" subtitle="Update your display name">
            <div style={S.fieldGroup}>
              <label style={S.label}>Display Name</label>
              <input
                className="input"
                value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                placeholder="Your name"
              />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Email</label>
              <input
                className="input"
                value={profile.email}
                disabled
                style={{ opacity: 0.5, cursor: 'not-allowed' }}
              />
              <span style={S.hint}>Email cannot be changed</span>
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Role</label>
              <input
                className="input"
                value={user?.role || ''}
                disabled
                style={{ opacity: 0.5, cursor: 'not-allowed', textTransform: 'capitalize' }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={saveProfile}
              disabled={savingProfile}
              style={{ marginTop: 4 }}
            >
              {savingProfile ? <><span className="spinner" /> Saving...</> : '💾 Save Profile'}
            </button>
          </Section>

          {/* Password */}
          <Section icon="🔐" title="Change Password" subtitle="Use a strong password with 6+ characters">
            <div style={S.fieldGroup}>
              <label style={S.label}>Current Password</label>
              <div style={S.pwdRow}>
                <input
                  className="input"
                  type={showPwd ? 'text' : 'password'}
                  value={pwd.current}
                  onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
                  placeholder="Current password"
                  style={{ flex: 1 }}
                />
                <button style={S.eyeBtn} onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>New Password</label>
              <input
                className="input"
                type={showPwd ? 'text' : 'password'}
                value={pwd.next}
                onChange={e => setPwd(p => ({ ...p, next: e.target.value }))}
                placeholder="New password (min 6 chars)"
              />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Confirm New Password</label>
              <input
                className="input"
                type={showPwd ? 'text' : 'password'}
                value={pwd.confirm}
                onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat new password"
              />
              {pwd.confirm && pwd.next !== pwd.confirm && (
                <span style={{ ...S.hint, color: 'var(--red)' }}>
                  ⚠ Passwords do not match
                </span>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={savePassword}
              disabled={savingPwd}
              style={{ marginTop: 4 }}
            >
              {savingPwd ? <><span className="spinner" /> Saving...</> : '🔑 Update Password'}
            </button>
          </Section>

          {/* Notifications */}
          <Section icon="🔔" title="Notifications" subtitle="Control what alerts you receive">
            <Toggle
              label="Email on new message"
              sub="Get emailed when someone messages you"
              value={notifState.emailOnMessage}
              onChange={v => saveNotifs('emailOnMessage', v)}
            />
            <Toggle
              label={isTeacher ? 'Email on exam submission' : 'Email when result is published'}
              sub={isTeacher
                ? 'Get notified when a student submits'
                : 'Know instantly when your score is ready'}
              value={notifState.emailOnResult}
              onChange={v => saveNotifs('emailOnResult', v)}
            />
            <Toggle
              label="In-app message alerts"
              sub="Show badge and toast for new messages"
              value={notifState.inAppMessage}
              onChange={v => saveNotifs('inAppMessage', v)}
            />
            {isTeacher && (
              <Toggle
                label="In-app violation alerts"
                sub="Get notified when a student triggers a violation"
                value={notifState.inAppViolation}
                onChange={v => saveNotifs('inAppViolation', v)}
              />
            )}
          </Section>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={S.col}>

          {/* Theme */}
          <Section icon="🎨" title="Appearance" subtitle="Choose your preferred look">
            <div style={S.themeGrid}>
              {[
                { key: 'dark',  label: 'Dark',  icon: '🌙', desc: 'Easy on the eyes' },
                { key: 'light', label: 'Light', icon: '☀️', desc: 'Clean and bright' },
                { key: 'dim',   label: 'Dim',   icon: '🌆', desc: 'Soft contrast' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setTheme(opt.key);
                    applyTheme(opt.key);
                    toast.success(`${opt.label} theme applied`);
                  }}
                  style={{
                    ...S.themeCard,
                    ...(theme === opt.key ? S.themeCardActive : {}),
                  }}
                >
                  <span style={{ fontSize: 26 }}>{opt.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{opt.desc}</span>
                  {theme === opt.key && <span style={S.themeCheck}>✓</span>}
                </button>
              ))}
            </div>
          </Section>

          {/* Timezone */}
          <Section icon="🌍" title="Timezone & Language" subtitle="Affects how exam times are displayed">
            <div style={S.fieldGroup}>
              <label style={S.label}>Timezone</label>
              <select
                className="input"
                value={tz}
                onChange={e => saveTz(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                {timezones.map(t => (
                  <option key={t} value={t}>
                    {tzLabels[t] || t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <span style={S.hint}>
                Current time: {new Date().toLocaleTimeString('en-US', { timeZone: tz })}
              </span>
            </div>
          </Section>

          {/* Accessibility */}
          <Section icon="♿" title="Accessibility" subtitle="Make ExamVision work better for you">
            <Toggle
              label="Large text"
              sub="Increases base font size across the platform"
              value={a11yState.largeFont}
              onChange={v => saveA11y('largeFont', v)}
            />
            <Toggle
              label="High contrast"
              sub="Sharper borders and stronger color contrast"
              value={a11yState.highContrast}
              onChange={v => saveA11y('highContrast', v)}
            />
            <Toggle
              label="Reduced motion"
              sub="Disables animations and transitions"
              value={a11yState.reducedMotion}
              onChange={v => saveA11y('reducedMotion', v)}
            />
          </Section>

          {/* Sessions */}
          <Section icon="🖥️" title="Connected Devices" subtitle="Sessions logged into your account">
            {loadingSessions ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="spinner" />
              </div>
            ) : sessions.length === 0 ? (
              <div style={S.emptyHistory}>
                <span style={{ fontSize: 36 }}>📭</span>
                <span style={{ color: 'var(--text3)', fontSize: 14 }}>No sessions found</span>
              </div>
            ) : (
              sessions.map(s => (
                <div key={s._id} style={S.sessionRow}>
                  <div style={S.sessionIcon}>{s.device === 'Mobile' ? '📱' : '💻'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {s.browser} on {s.os}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {s.device}{s.ip ? ` · ${s.ip}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {s.current ? 'Active now' : `Last active: ${new Date(s.lastActive).toLocaleString()}`}
                    </div>
                  </div>
                  {s.current
                    ? <span style={S.currentBadge}>Current</span>
                    : <button className="btn btn-danger btn-sm" onClick={() => handleLogoutSession(s._id)}>
                        Logout
                      </button>
                  }
                </div>
              ))
            )}
            {sessions.length > 1 && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 8 }}
                onClick={handleLogoutOtherSessions}
              >
                ⏻ Logout all other sessions
              </button>
            )}
          </Section>

        </div>
      </div>

      {/* ── ROLE-SPECIFIC FULL-WIDTH SECTIONS ── */}
      {isTeacher ? (
        <div style={S.fullWidth}>

          {/* Live Proctoring */}
          <Section
            icon="📡"
            title="Live Proctoring"
            subtitle="Exams currently in progress — monitor students in real time"
          >
            {loadingLive ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="spinner" />
              </div>
            ) : liveTests.length === 0 ? (
              <div style={S.emptyHistory}>
                <span style={{ fontSize: 36 }}>📭</span>
                <span style={{ color: 'var(--text3)', fontSize: 14 }}>
                  No exams are currently live
                </span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                  Active exams will appear here automatically
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {liveTests.map(test => (
                  <LiveProctoringCard
                    key={test._id}
                    test={test}
                    onView={handleViewLive}
                  />
                ))}
              </div>
            )}
            <div style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                Auto-refreshes every 30 seconds
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setLoadingLive(true);
                  api.get('/tests/live')
                    .then(res => setLiveTests(Array.isArray(res?.data) ? res.data : []))
                    .catch(() => setLiveTests([]))
                    .finally(() => setLoadingLive(false));
                }}
              >
                ↻ Refresh now
              </button>
            </div>
          </Section>

          {/* Default Security Preset */}
          <Section
            icon="🛡️"
            title="Default Security Preset"
            subtitle="These settings pre-fill every new test you create"
          >
            <div style={S.secGrid}>
              {[
                { key: 'tabSwitchDetection',       label: 'Tab switch detection',          sub: 'Detect when student switches tab' },
                { key: 'fullscreenEnforcement',     label: 'Fullscreen enforcement',        sub: 'Force exam into fullscreen mode' },
                { key: 'copyPasteBlocking',         label: 'Copy/Paste blocking',           sub: 'Block clipboard events' },
                { key: 'rightClickBlocking',        label: 'Right-click blocking',          sub: 'Disable context menu' },
                { key: 'questionRandomization',     label: 'Question randomization',        sub: 'Shuffle per student server-side' },
                { key: 'oneWayNavigation',          label: 'One-way navigation',            sub: 'Prevent going back to prev questions' },
                { key: 'perQuestionTimeTracking',   label: 'Per-question time tracking',    sub: 'Record time spent on each question' },
                { key: 'autoSubmitOnMaxViolations', label: 'Auto-submit on max violations', sub: 'Submit automatically when limit hit' },
              ].map(item => (
                <div key={item.key} style={S.secItem}>
                  <Toggle
                    label={item.label}
                    sub={item.sub}
                    value={secState[item.key]}
                    onChange={v => saveSecPreset(item.key, v)}
                  />
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 16, display: 'flex',
              alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <label style={{ ...S.label, margin: 0 }}>
                Default max violations before auto-submit:
              </label>
              <input
                type="number"
                className="input"
                min={1} max={20}
                value={secState.maxTabSwitches}
                onChange={e => saveSecPreset('maxTabSwitches', Number(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
          </Section>

          {/* Grading Preferences */}
          <Section
            icon="📊"
            title="Grading Preferences"
            subtitle="Defaults applied when publishing test results"
          >
            <div style={S.secGrid}>
              <div style={S.secItem}>
                <Toggle
                  label="Auto-show results after submission"
                  sub="Students see their score immediately after submitting"
                  value={gradingState.autoShowResults}
                  onChange={v => saveGrading('autoShowResults', v)}
                />
              </div>
              <div style={S.secItem}>
                <Toggle
                  label="Show correct answers in result"
                  sub="Students can see which answers were correct"
                  value={gradingState.showCorrectAnswers}
                  onChange={v => saveGrading('showCorrectAnswers', v)}
                />
              </div>
            </div>
            <div style={{
              marginTop: 16, display: 'flex',
              alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <label style={{ ...S.label, margin: 0 }}>Default pass percentage:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  className="input"
                  min={0} max={100}
                  value={gradingState.passPercent}
                  onChange={e => saveGrading('passPercent', Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>%</span>
              </div>
            </div>
          </Section>

        </div>
      ) : (

        /* ── STUDENT SECTIONS ── */
        <div style={S.fullWidth}>

          {/* Exam History */}
          <Section icon="📜" title="Exam History" subtitle="All your past attempts at a glance">
            {loadingHistory ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="spinner" />
              </div>
            ) : attempts.length === 0 ? (
              <div style={S.emptyHistory}>
                <span style={{ fontSize: 36 }}>📭</span>
                <span style={{ color: 'var(--text3)', fontSize: 14 }}>No exam attempts yet</span>
              </div>
            ) : (
              <div style={S.historyTable}>
                <div style={S.historyHead}>
                  <span>Test</span>
                  <span>Course</span>
                  <span>Score</span>
                  <span>Status</span>
                  <span>Date</span>
                </div>
                {attempts.map((a, i) => (
                  <div key={i} style={S.historyRow}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {a.test?.title || 'Unknown'}
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {a.test?.courseName || '—'}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--accent2)', fontSize: 13 }}>
                      {a.score != null ? `${a.score}/${a.test?.totalMarks || '?'}` : '—'}
                    </span>
                    <span>
                      <span style={{
                        ...S.statusDot,
                        background: a.submitted ? 'var(--green-dim)' : 'var(--yellow-dim)',
                        color: a.submitted ? 'var(--green)' : 'var(--yellow)',
                        border: `1px solid ${a.submitted ? 'var(--green)' : 'var(--yellow)'}`,
                      }}>
                        {a.submitted ? '✓ Submitted' : '⏳ In progress'}
                      </span>
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {a.submittedAt
                        ? new Date(a.submittedAt).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Study Preferences */}
          <Section
            icon="📚"
            title="Study Preferences"
            subtitle="Personalise your exam-taking experience"
          >
            <Toggle
              label="Show question number in exam"
              sub="Display Q1, Q2… labels while taking a test"
              value={notifState.showQuestionNumbers ?? true}
              onChange={v => saveNotifs('showQuestionNumbers', v)}
            />
            <Toggle
              label="Confirm before submitting exam"
              sub="Show a confirmation dialog before final submit"
              value={notifState.confirmBeforeSubmit ?? true}
              onChange={v => saveNotifs('confirmBeforeSubmit', v)}
            />
            <Toggle
              label="Auto-save answers"
              sub="Periodically save your answers in the background"
              value={notifState.autoSave ?? true}
              onChange={v => saveNotifs('autoSave', v)}
            />
          </Section>

        </div>
      )}

    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────
function getBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/'))      return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome'))    return 'Chrome';
  if (ua.includes('Firefox'))   return 'Firefox';
  if (ua.includes('Safari'))    return 'Safari';
  return 'Browser';
}

function getOS() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows'))   return 'Windows';
  if (ua.includes('Mac OS'))    return 'macOS';
  if (ua.includes('Linux'))     return 'Linux';
  if (ua.includes('Android'))   return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

// ── Styles ────────────────────────────────────────────────────────────
const S = {
  root:      { maxWidth: 1100, margin: '0 auto' },
  header:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 },
  pageTitle: { fontFamily: 'Syne,sans-serif', fontSize: 28, fontWeight: 800, margin: 0 },
  pageSub:   { fontSize: 13, color: 'var(--text3)', marginTop: 4 },
  rolePill:  { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 20, color: 'var(--accent2)' },

  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 },
  col:       { display: 'flex', flexDirection: 'column', gap: 20 },
  fullWidth: { display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 },

  section:       { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' },
  sectionIcon:   { fontSize: 20, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 },
  sectionTitle:  { fontWeight: 700, fontSize: 15, fontFamily: 'Syne,sans-serif' },
  sectionSub:    { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  sectionBody:   { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 },

  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 },
  hint:       { fontSize: 11, color: 'var(--text3)', marginTop: 2 },

  pwdRow: { display: 'flex', gap: 8, alignItems: 'center' },
  eyeBtn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 38, cursor: 'pointer', fontSize: 16, flexShrink: 0 },

  toggleRow:   { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  toggleLabel: { fontSize: 13, fontWeight: 600 },
  toggleSub:   { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
  toggleBtn: {
    width: 48, height: 28, borderRadius: 14,
    border: 'none', cursor: 'pointer', position: 'relative',
    flexShrink: 0, padding: 0, outline: 'none',
  },
  toggleThumb: {
    position: 'absolute', top: 3, left: 0,
    width: 22, height: 22, borderRadius: '50%',
    background: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
  },

  themeGrid:       { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 },
  themeCard:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 8px', background: 'var(--bg3)', border: '2px solid var(--border)', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s', position: 'relative' },
  themeCardActive: { borderColor: 'var(--accent)', background: 'var(--accent-dim)' },
  themeCheck:      { position: 'absolute', top: 6, right: 8, color: 'var(--accent2)', fontSize: 12, fontWeight: 800 },

  sessionRow:   { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  sessionIcon:  { fontSize: 22, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)', borderRadius: 8, flexShrink: 0 },
  currentBadge: { background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 },

  proctoringCard: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 },
  liveBadge:      { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' },
  violationBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--yellow-dim)', color: 'var(--yellow)', border: '1px solid var(--yellow)' },

  secGrid: { display: 'flex', flexDirection: 'column', gap: 0 },
  secItem: { borderRadius: 0 },

  emptyHistory: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 0', color: 'var(--text3)' },
  historyTable: { display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' },
  historyHead:  { display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1.2fr 1fr', gap: 0, padding: '8px 16px', background: 'var(--bg3)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 },
  historyRow:   { display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1.2fr 1fr', gap: 0, padding: '12px 16px', borderTop: '1px solid var(--border)', alignItems: 'center', background: 'var(--bg2)' },
  statusDot:    { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
};