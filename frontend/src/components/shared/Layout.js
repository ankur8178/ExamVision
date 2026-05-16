import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
import AvatarUpload from './AvatarUpload';
import NotificationBell from './NotificationBell';
import api from '../../utils/api';

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);
  const [showProfile, setShowProfile] = useState(false);

  // Re-apply saved theme + accessibility on every mount / navigation
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.classList.remove('dark', 'light', 'dim');
    document.documentElement.classList.add(savedTheme);

    // Re-apply accessibility preferences
    try {
      const a11y = JSON.parse(localStorage.getItem('a11y_prefs') || '{}');
      document.documentElement.style.fontSize = a11y.largeFont ? '18px' : '';
      if (a11y.highContrast) document.documentElement.classList.add('high-contrast');
      else document.documentElement.classList.remove('high-contrast');
      if (a11y.reducedMotion) document.documentElement.classList.add('reduced-motion');
      else document.documentElement.classList.remove('reduced-motion');
    } catch {}
  }, []);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await api.get('/messages/unread');
        setUnread(res.data.count);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, []);

  const teacherNav = [
    { icon: '⊞', label: 'Dashboard', path: '/teacher' },
    { icon: '📢', label: 'Announcements', path: '/teacher?tab=announcements' },
    { icon: '📅', label: 'Calendar',  path: '/teacher?tab=calendar' },
    { icon: '💬', label: 'Messages',  path: '/teacher?tab=messages', badge: unread },
    { icon: '⚙️', label: 'Settings',  path: '/teacher?tab=settings' },
  ];
  const studentNav = [
    { icon: '⊞', label: 'Dashboard', path: '/student' },
    { icon: '📢', label: 'Announcements', path: '/student?tab=announcements' },
    { icon: '📅', label: 'Calendar',  path: '/student?tab=calendar' },
    { icon: '💬', label: 'Messages',  path: '/student?tab=messages', badge: unread },
    { icon: '⚙️', label: 'Settings',  path: '/student?tab=settings' },
  ];
  const navItems = user?.role === 'teacher' ? teacherNav : studentNav;

  const isActive = (path) => {
    const base = path.split('?')[0];
    const tab  = path.includes('?tab=') ? path.split('?tab=')[1] : null;
    const searchTab = new URLSearchParams(location.search).get('tab');
    if (tab) return location.pathname === base && searchTab === tab;
    return location.pathname === base && !searchTab;
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const mailHref = "mailto:ankur14881@gmail.com?subject=ExamVision%20Support%20Request&body=Hi%20Ankur%2C%0A%0AI%20have%20an%20issue%3A%0A%0A";

  return (
    <div style={S.shell}>

      {/* ── Sidebar ── */}
      <aside style={{ ...S.sidebar, width: collapsed ? 64 : 230 }}>
        <div style={S.sideTop}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, color: 'var(--accent2)', flexShrink: 0 }}>⬡</span>
            {!collapsed && <span style={S.logoText}>ExamVision</span>}
          </div>
          <button style={S.collapseBtn} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav style={S.nav}>
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              style={{ ...S.navItem, ...(isActive(item.path) ? S.navActive : {}) }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {item.badge > 0 && (
                <span style={S.badge}>{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Notification Bell */}
        <div style={{ padding: '4px 8px' }}>
          <NotificationBell collapsed={collapsed} />
        </div>

        <div style={S.sideBottom}>
          <div style={{ ...S.profileRow, cursor: 'pointer' }} onClick={() => setShowProfile(!showProfile)}>
            <Avatar user={user} size={32} />
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>
                  {user?.role}
                </div>
              </div>
            )}
            {!collapsed && <span style={{ fontSize: 11, color: 'var(--text3)' }}>✎</span>}
          </div>

          {showProfile && !collapsed && (
            <div style={S.profilePopup}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 12px' }}>
                <AvatarUpload size={72} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>{user?.email}</div>
                  <div style={{ color: 'var(--accent2)', fontSize: 11, textTransform: 'capitalize', marginTop: 2 }}>
                    {user?.role}
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>Click photo to change</p>
              </div>
            </div>
          )}

          <button style={S.logoutBtn} onClick={handleLogout} title="Logout">
            <span>⏻</span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main + Footer ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <main style={S.main}>
          {title && (
            <div style={S.pageHeader}>
              <h1 style={S.pageTitle}>{title}</h1>
            </div>
          )}
          <div style={S.content}>{children}</div>
        </main>

        {/* ── Footer ── */}
        <footer style={S.footer}>
          <div style={S.footerInner}>

            {/* Col 1 — Branding */}
            <div style={S.footerCol}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20, color: 'var(--accent2)' }}>⬡</span>
                <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16 }}>ExamVision</span>
              </div>
              <p style={S.footerText}>A secure, AI-assisted exam proctoring platform built for modern education.</p>
              <p style={{ ...S.footerText, marginTop: 8, color: 'var(--text3)' }}>
                {'\u00A9'} {new Date().getFullYear()} ExamVision. All rights reserved.
              </p>
            </div>

            {/* Col 2 — Platform */}
            <div style={S.footerCol}>
              <div style={S.footerHeading}>Platform</div>
              <div style={S.footerLinks}>
                {user?.role === 'teacher' ? (
                  <>
                    <Link to="/teacher" style={S.footerLink}>Dashboard</Link>
                    <Link to="/teacher?tab=calendar" style={S.footerLink}>Calendar</Link>
                    <Link to="/teacher?tab=messages" style={S.footerLink}>Messages</Link>
                    <Link to="/teacher?tab=settings" style={S.footerLink}>Settings</Link>
                  </>
                ) : (
                  <>
                    <Link to="/student" style={S.footerLink}>Dashboard</Link>
                    <Link to="/student?tab=calendar" style={S.footerLink}>Calendar</Link>
                    <Link to="/student?tab=messages" style={S.footerLink}>Messages</Link>
                    <Link to="/student?tab=settings" style={S.footerLink}>Settings</Link>
                  </>
                )}
              </div>
            </div>

            {/* Col 3 — Account */}
            <div style={S.footerCol}>
              <div style={S.footerHeading}>Account</div>
              <div style={S.footerLinks}>
                <span style={{ ...S.footerLink, cursor: 'default' }}>
                  Signed in as <strong>{user?.name}</strong>
                </span>
                <span style={{ ...S.footerLink, cursor: 'default', textTransform: 'capitalize' }}>
                  Role: {user?.role}
                </span>
                <span
                  style={{ ...S.footerLink, cursor: 'pointer', color: 'var(--red)' }}
                  onClick={handleLogout}
                >
                  Sign out
                </span>
              </div>
            </div>

            {/* Col 4 — Contact */}
            <div style={S.footerCol}>
              <div style={S.footerHeading}>Contact Us</div>
              <div style={S.footerLinks}>
                <p style={{ ...S.footerText, marginBottom: 10 }}>
                  Have an issue or feedback? Reach out and we will get back to you.
                </p>
                <a href={mailHref} style={S.contactBtn}>
                  <span style={{ fontSize: 15 }}>&#9993;</span>
                  <span>ankur14881@gmail.com</span>
                </a>
                <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  We typically respond within 24-48 hours.
                </span>
              </div>
            </div>

          </div>
        </footer>
      </div>

    </div>
  );
}

const S = {
  shell: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  sidebar: { background: 'var(--bg2)', zIndex: 100, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transition: 'width 0.25s ease', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' },
  sideTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 14px', borderBottom: '1px solid var(--border)' },
  logoText: { fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, whiteSpace: 'nowrap' },
  collapseBtn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, width: 26, height: 26, color: 'var(--text2)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nav: { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 8, color: 'var(--text2)', fontSize: 14, fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap', textDecoration: 'none' },
  navActive: { background: 'var(--accent-dim)', color: 'var(--accent2)' },
  badge: { background: 'var(--red)', color: 'white', borderRadius: '50%', minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: '0 3px' },
  sideBottom: { padding: '10px 10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' },
  profileRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, transition: 'background 0.15s' },
  profilePopup: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 4 },
  logoutBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  pageHeader: { padding: '22px 28px 0', borderBottom: '1px solid var(--border)', paddingBottom: 18 },
  pageTitle: { fontSize: 26, fontFamily: 'Syne,sans-serif' },
  content: { padding: '24px 28px', flex: 1 },
  footer: { borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '28px 28px 20px' },
  footerInner: { display: 'flex', gap: 40, flexWrap: 'wrap' },
  footerCol: { flex: 1, minWidth: 160 },
  footerHeading: { fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  footerLinks: { display: 'flex', flexDirection: 'column', gap: 8 },
  footerLink: { fontSize: 13, color: 'var(--text2)', textDecoration: 'none', transition: 'color 0.15s' },
  footerText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 220 },
  contactBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, color: 'var(--accent2)', fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'all 0.15s', width: 'fit-content' },
};