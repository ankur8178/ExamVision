import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';



const ACTION_LABELS = {
  delete_user:          { label: 'Delete User',          color: '#ef4444' },
  reset_password:       { label: 'Reset Password',       color: '#f59e0b' },
  impersonate:          { label: 'Impersonate',          color: '#6c63ff' },
  global_announcement:  { label: 'Global Announcement',  color: '#10b981' },
  delete_course:        { label: 'Delete Course',        color: '#ef4444' },
  delete_announcement:  { label: 'Delete Announcement',  color: '#f59e0b' },
  approve_admin:        { label: 'Approve Admin',        color: '#10b981' },
  reject_admin:         { label: 'Reject Admin',         color: '#ef4444' },
  revoke_admin:         { label: 'Revoke Admin',         color: '#f59e0b' },
  promote_teacher:      { label: 'Promote Teacher',      color: '#10b981' },
};

export default function AdminDashboard() {
  const { user, logout, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Users');

  const [users,           setUsers]           = useState([]);
  const [courses,         setCourses]         = useState([]);
  const [tests,           setTests]           = useState([]);
  const [announcements,   setAnnouncements]   = useState([]);
  const [auditLogs,       setAuditLogs]       = useState([]);
  const [pendingAdmins,   setPendingAdmins]   = useState([]);
  const [approvedAdmins,  setApprovedAdmins]  = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [notifLoading,    setNotifLoading]    = useState(false);

  // reset-password modal
  const [resetModal, setResetModal] = useState(null);
  const [newPass,    setNewPass]    = useState('');

  // search
  const [search, setSearch] = useState('');

  // global announcement compose
  const [globalTitle,   setGlobalTitle]   = useState('');
  const [globalContent, setGlobalContent] = useState('');
  const [posting,       setPosting]       = useState(false);

  // ── Fetchers ────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try { setUsers((await api.get('/auth/admin/users')).data); }
    catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try { setCourses((await api.get('/auth/admin/courses')).data); }
    catch { toast.error('Failed to load courses'); }
    finally { setLoading(false); }
  }, []);

  const fetchTests = useCallback(async () => {
    setLoading(true);
    try { setTests((await api.get('/auth/admin/tests')).data); }
    catch { toast.error('Failed to load tests'); }
    finally { setLoading(false); }
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try { setAnnouncements((await api.get('/auth/admin/announcements')).data); }
    catch { toast.error('Failed to load announcements'); }
    finally { setLoading(false); }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try { setAuditLogs((await api.get('/auth/admin/audit-logs')).data); }
    catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await api.get('/auth/admin/pending-admins');
      const all = res.data;
      setPendingAdmins(all.filter(u => u.adminStatus === 'pending'));
      setApprovedAdmins(all.filter(u => u.adminStatus === 'approved'));
    } catch { toast.error('Failed to load notifications'); }
    finally { setNotifLoading(false); }
  }, []);

  // Also fetch pending count on mount for the badge
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
  if (!user?.isSuperAdmin) return;          // ← ADD this guard
  api.get('/auth/admin/pending-admins')
    .then(res => setPendingCount(res.data.filter(u => u.adminStatus === 'pending').length))
    .catch(() => {});
}, [user]);                                 

  useEffect(() => {
    if      (tab === 'Users')         fetchUsers();
    else if (tab === 'Courses')       fetchCourses();
    else if (tab === 'Tests')         fetchTests();
    else if (tab === 'Announcements') fetchAnnouncements();
    else if (tab === 'Notifications') fetchNotifications();
    else if (tab === 'Audit Log')     fetchAuditLogs();
    setSearch('');
  }, [tab, fetchUsers, fetchCourses, fetchTests, fetchAnnouncements, fetchNotifications, fetchAuditLogs]);

  // ── Notification Handlers ────────────────────────────────────────
  const handleApproveAdmin = async (u) => {
    try {
      await api.put(`/auth/admin/approve-admin/${u._id}`);
      toast.success(`✅ ${u.name} approved as admin`);
      setPendingAdmins(prev => prev.filter(x => x._id !== u._id));
      setPendingCount(c => Math.max(0, c - 1));
      // Refresh approved list
      fetchNotifications();
    } catch { toast.error('Failed to approve admin'); }
  };

  const handleRejectAdmin = async (u) => {
    if (!window.confirm(`Reject admin request from "${u.name}"? They will be notified by email.`)) return;
    try {
      await api.put(`/auth/admin/reject-admin/${u._id}`);
      toast.success(`❌ ${u.name}'s request rejected`);
      setPendingAdmins(prev => prev.filter(x => x._id !== u._id));
      setPendingCount(c => Math.max(0, c - 1));
    } catch { toast.error('Failed to reject admin'); }
  };

  const handleRevokeAdmin = async (u) => {
    if (!window.confirm(`Revoke admin access from "${u.name}"? They will be demoted to teacher.`)) return;
    try {
      await api.put(`/auth/admin/revoke-admin/${u._id}`);
      toast.success(`🔒 ${u.name}'s admin access revoked`);
      setApprovedAdmins(prev => prev.filter(x => x._id !== u._id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to revoke admin');
    }
  };

  // ── Other Handlers ───────────────────────────────────────────────
  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/auth/admin/users/${u._id}`);
      toast.success(`${u.name} deleted`);
      setUsers(prev => prev.filter(x => x._id !== u._id));
    } catch { toast.error('Failed to delete user'); }
  };

  const handleResetPassword = async () => {
    if (!newPass || newPass.length < 6) return toast.error('Min 6 characters');
    try {
      await api.put(`/auth/admin/users/${resetModal._id}/password`, { newPassword: newPass });
      toast.success(`Password reset for ${resetModal.name}`);
      setResetModal(null);
      setNewPass('');
    } catch { toast.error('Failed to reset password'); }
  };

  const handleImpersonate = async (u) => {
    if (!window.confirm(`Login as "${u.name}"? Your admin session will be saved.`)) return;
    try {
      const adminToken = localStorage.getItem('token');
      const adminUser  = localStorage.getItem('user');
      sessionStorage.setItem('adminToken', adminToken);
      sessionStorage.setItem('adminUser',  adminUser);
      const res = await api.post(`/auth/admin/impersonate/${u._id}`);
      loginWithToken(res.data.token, res.data.user);
      toast.success(`Now logged in as ${u.name}`);
      navigate(u.role === 'teacher' ? '/teacher' : '/student');
    } catch { toast.error('Impersonation failed'); }
  };

  const handleDeleteCourse = async (c) => {
    if (!window.confirm(
      `Delete course "${c.name}"?\n\nThis will permanently remove ALL tests, questions, attempts, and announcements inside it. This cannot be undone.`
    )) return;
    try {
      await api.delete(`/auth/admin/courses/${c._id}`);
      toast.success(`Course "${c.name}" deleted`);
      setCourses(prev => prev.filter(x => x._id !== c._id));
    } catch { toast.error('Failed to delete course'); }
  };

  const handlePostGlobalAnnouncement = async () => {
    if (!globalContent.trim()) return toast.error('Message content cannot be empty');
    setPosting(true);
    try {
      const res = await api.post('/auth/admin/announcements/global', {
        title:   globalTitle.trim(),
        content: globalContent.trim(),
      });
      toast.success('Global announcement posted');
      setGlobalTitle('');
      setGlobalContent('');
      setAnnouncements(prev => [res.data, ...prev]);
    } catch { toast.error('Failed to post announcement'); }
    finally { setPosting(false); }
  };
  const handlePromoteTeacher = async (u) => {
  if (!window.confirm(`Promote "${u.name}" from teacher to admin? They will get full admin access.`)) return;
  try {
    await api.put(`/auth/admin/promote-teacher/${u._id}`);
    toast.success(`⬆️ ${u.name} promoted to admin`);
    setUsers(prev => prev.map(x => x._id === u._id ? { ...x, role: 'admin' } : x));
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to promote teacher');
  }
};
  const handleDeleteAnnouncement = async (a) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/auth/admin/announcements/${a._id}`);
      toast.success('Announcement deleted');
      setAnnouncements(prev => prev.filter(x => x._id !== a._id));
    } catch { toast.error('Failed to delete announcement'); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Filtering ────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredUsers         = users.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q));
  const filteredCourses       = courses.filter(c =>
    c.name?.toLowerCase().includes(q) || c.teacher?.name?.toLowerCase().includes(q));
  const filteredTests         = tests.filter(t =>
    t.title?.toLowerCase().includes(q) || t.course?.name?.toLowerCase().includes(q) || t.teacher?.name?.toLowerCase().includes(q));
  const filteredAnnouncements = announcements.filter(a =>
    a.content?.toLowerCase().includes(q) || a.teacher?.name?.toLowerCase().includes(q) || a.postedBy?.toLowerCase().includes(q));
  const filteredLogs          = auditLogs.filter(l =>
    l.action?.includes(q) || l.details?.toLowerCase().includes(q) || l.adminName?.toLowerCase().includes(q));

  // ── Helpers ──────────────────────────────────────────────────────
  const roleBadge = (role) => {
    const colors = { student: '#6c63ff', teacher: '#10b981', admin: '#f59e0b' };
    return (
      <span style={{ background: colors[role] + '22', color: colors[role], padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
        {role}
      </span>
    );
  };

  const tabIcon = (t) => ({
    Users: '👥', Courses: '📚', Tests: '📝',
    Announcements: '📢', Notifications: '🔔', 'Audit Log': '📋',
  }[t]);

  const isSuperAdmin = user?.isSuperAdmin;
  const TABS = [
  'Users', 'Courses', 'Tests', 'Announcements',
  ...(isSuperAdmin ? ['Notifications'] : []),
  'Audit Log'
];

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ── Reset Password Modal ── */}
      {resetModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <h3 style={{ marginBottom: 6 }}>Reset Password</h3>
            <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 20 }}>
              Setting new password for <strong>{resetModal.name}</strong>
            </p>
            <input className="input" type="password" placeholder="New password (min 6 chars)"
              value={newPass} onChange={e => setNewPass(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleResetPassword}
                style={{ flex: 1, justifyContent: 'center' }}>
                Reset Password
              </button>
              <button className="btn" onClick={() => { setResetModal(null); setNewPass(''); }}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside style={S.sidebar}>
        <div style={S.sideTop}>
          <div style={S.logo}>
            <span style={{ fontSize: 22, color: 'var(--accent2)' }}>⬡</span>
            <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18 }}>ExamVision</span>
          </div>
          <div style={S.adminBadge}>
            {isSuperAdmin ? '👑 Super Admin' : '🔐 Admin Panel'}
          </div>
          <nav style={S.nav}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ ...S.navBtn, ...(tab === t ? S.navBtnActive : {}), position: 'relative' }}>
                <span>{tabIcon(t)} {t}</span>
                {/* Pending badge on Notifications tab */}
                {t === 'Notifications' && pendingCount > 0 && (
                  <span style={S.pendingBadge}>{pendingCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div>
          <div style={S.adminInfo}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {isSuperAdmin ? '👑' : '🔐'}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{user?.email}</div>
            </div>
          </div>
          <button className="btn" onClick={handleLogout}
            style={{ width: '100%', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', marginTop: 8 }}>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={S.main}>
        <div style={S.header}>
          <div>
            <h1 style={{ fontSize: 24, fontFamily: 'Syne,sans-serif', fontWeight: 800 }}>{tab}</h1>
            <p style={{ color: 'var(--text3)', fontSize: 14 }}>
              {tab === 'Users'         && `${users.length} total users`}
              {tab === 'Courses'       && `${courses.length} total courses`}
              {tab === 'Tests'         && `${tests.length} total tests`}
              {tab === 'Announcements' && `${announcements.length} total announcements`}
              {tab === 'Notifications' && `${pendingAdmins.length} pending request${pendingAdmins.length !== 1 ? 's' : ''}`}
              {tab === 'Audit Log'     && `${auditLogs.length} logged actions`}
            </p>
          </div>
          {tab !== 'Audit Log' && tab !== 'Notifications' && (
            <input className="input" placeholder={`Search ${tab.toLowerCase()}...`}
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: 260 }}
            />
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Loading...</div>
        ) : (
          <>
            {/* ══ USERS TAB ══ */}
            {tab === 'Users' && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Role', 'Actions'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u._id} style={S.tr}>
                        <td style={S.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {u.avatar
                              ? <img src={u.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                              : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent2)' }}>{u.name[0]}</div>
                            }
                            <span style={{ fontWeight: 500 }}>{u.name}</span>
                          </div>
                        </td>
                        <td style={{ ...S.td, color: 'var(--text3)', fontSize: 13 }}>{u.email}</td>
                        <td style={S.td}>{roleBadge(u.role)}</td>
                        <td style={S.td}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="btn" onClick={() => handleImpersonate(u)} style={S.actionBtn('#6c63ff')}>🎭 Login As</button>
                                <button className="btn" onClick={() => setResetModal(u)}     style={S.actionBtn('#f59e0b')}>🔑 Reset Pass</button>
                                <button className="btn" onClick={() => handleDeleteUser(u)}  style={S.actionBtn('#ef4444')}>🗑 Delete</button>
                                {u.role === 'teacher' && isSuperAdmin && (
                                    <button className="btn" onClick={() => handlePromoteTeacher(u)} style={S.actionBtn('#10b981')}>
                                        ⬆️ Make Admin
                                    </button>
                                )}
                            </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ══ COURSES TAB ══ */}
            {tab === 'Courses' && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Course Name', 'Teacher', 'Code', 'Students', 'Actions'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourses.map(c => (
                      <tr key={c._id} style={S.tr}>
                        <td style={{ ...S.td, fontWeight: 500 }}>{c.name}</td>
                        <td style={{ ...S.td, color: 'var(--text3)', fontSize: 13 }}>
                          {c.teacher?.name}
                          <span style={{ fontSize: 12 }}> ({c.teacher?.email})</span>
                        </td>
                        <td style={S.td}>
                          <code style={{ background: 'var(--bg3)', padding: '2px 8px', borderRadius: 6, fontSize: 13 }}>{c.code}</code>
                        </td>
                        <td style={S.td}>{c.students?.length ?? 0}</td>
                        <td style={S.td}>
                          <button className="btn" onClick={() => handleDeleteCourse(c)} style={S.actionBtn('#ef4444')}>
                            🗑 Delete Course
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCourses.length === 0 && (
                      <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No courses found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ══ TESTS TAB ══ */}
            {tab === 'Tests' && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Test Title', 'Course', 'Created By', 'Status', 'Duration'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTests.map(t => (
                      <tr key={t._id} style={S.tr}>
                        <td style={{ ...S.td, fontWeight: 500 }}>{t.title}</td>
                        <td style={{ ...S.td, color: 'var(--text3)', fontSize: 13 }}>{t.course?.name}</td>
                        <td style={{ ...S.td, color: 'var(--text3)', fontSize: 13 }}>{t.teacher?.name}</td>
                        <td style={S.td}>
                          <span style={{
                            background: t.status === 'published' ? '#10b98122' : t.status === 'closed' ? '#ef444422' : '#f59e0b22',
                            color:      t.status === 'published' ? '#10b981'   : t.status === 'closed' ? '#ef4444'   : '#f59e0b',
                            padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                          }}>{t.status}</span>
                        </td>
                        <td style={{ ...S.td, color: 'var(--text3)', fontSize: 13 }}>{t.duration} min</td>
                      </tr>
                    ))}
                    {filteredTests.length === 0 && (
                      <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No tests found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ══ ANNOUNCEMENTS TAB ══ */}
            {tab === 'Announcements' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={S.composeBox}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ background: '#10b98122', color: '#10b981', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                      🌐 Global
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Post to all users across all courses</span>
                  </div>
                  <input className="input" placeholder="Title (optional)" value={globalTitle}
                    onChange={e => setGlobalTitle(e.target.value)} style={{ marginBottom: 10 }} />
                  <textarea className="input" placeholder="Write your announcement message..."
                    value={globalContent} onChange={e => setGlobalContent(e.target.value)}
                    style={{ resize: 'vertical', minHeight: 90, width: '100%', marginBottom: 12, fontFamily: 'inherit' }} />
                  <button className="btn btn-primary" onClick={handlePostGlobalAnnouncement}
                    disabled={posting} style={{ opacity: posting ? 0.6 : 1 }}>
                    {posting ? 'Posting...' : '📢 Post Global Announcement'}
                  </button>
                </div>
                {filteredAnnouncements.map(a => (
                  <div key={a._id} style={S.annCard}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                        {a.isGlobal ? (
                          <span style={{ background: '#10b98122', color: '#10b981', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>🌐 Global</span>
                        ) : (
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{a.teacher?.name}</span>
                        )}
                        {a.isGlobal && <span style={{ fontWeight: 600, fontSize: 14 }}>{a.postedBy}</span>}
                        {!a.isGlobal && (
                          <>
                            <span style={{ color: 'var(--text3)', fontSize: 12 }}>in</span>
                            <span style={{ color: 'var(--accent2)', fontSize: 13, fontWeight: 500 }}>{a.course?.name}</span>
                          </>
                        )}
                        <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 'auto' }}>
                          {new Date(a.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {a.title && <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{a.title}</div>}
                      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{a.content}</p>
                    </div>
                    <button className="btn" onClick={() => handleDeleteAnnouncement(a)}
                      style={{ ...S.actionBtn('#ef4444'), alignSelf: 'flex-start', marginLeft: 16 }}>
                      🗑 Delete
                    </button>
                  </div>
                ))}
                {filteredAnnouncements.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>No announcements found</div>
                )}
              </div>
            )}

            {/* ══ NOTIFICATIONS TAB ══ */}
            {tab === 'Notifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* ── How one-click email works ── */}
                <div style={S.infoBox}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>📱</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Approve from anywhere — including your phone</div>
                      <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
                        Every admin request sends an email to <strong style={{ color: 'var(--text2)' }}>ankur14881@gmail.com</strong> with
                        one-click <span style={{ color: '#22c55e', fontWeight: 600 }}>Approve</span> and <span style={{ color: '#ef4444', fontWeight: 600 }}>Reject</span> buttons.
                        Open that email on your phone or any device — no login required to take action.
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Pending Requests ── */}
                <div>
                  <div style={S.sectionHeading}>
                    <span>⏳ Pending Requests</span>
                    {pendingAdmins.length > 0 && (
                      <span style={S.countBadge('#f59e0b')}>{pendingAdmins.length} pending</span>
                    )}
                  </div>

                  {notifLoading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading...</div>
                  ) : pendingAdmins.length === 0 ? (
                    <div style={S.emptyState}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>All caught up!</div>
                      <div style={{ color: 'var(--text3)', fontSize: 13 }}>No pending admin requests right now.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {pendingAdmins.map(u => (
                        <div key={u._id} style={S.notifCard('pending')}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                            {/* Avatar */}
                            <div style={S.notifAvatar('#f59e0b')}>
                              {u.avatar
                                ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 18, fontWeight: 700 }}>{u.name[0].toUpperCase()}</span>
                              }
                            </div>
                            {/* Info */}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</div>
                              <div style={{ color: 'var(--text3)', fontSize: 13 }}>{u.email}</div>
                              <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ background: '#f59e0b22', color: '#f59e0b', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                                  ⏳ Pending Approval
                                </span>
                                <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                                  Requested {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                            <button className="btn" onClick={() => handleApproveAdmin(u)}
                              style={S.notifActionBtn('#22c55e')}>
                              ✅ Approve
                            </button>
                            <button className="btn" onClick={() => handleRejectAdmin(u)}
                              style={S.notifActionBtn('#ef4444')}>
                              ❌ Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Approved Admins ── */}
                {isSuperAdmin && (
                  <div>
                    <div style={S.sectionHeading}>
                      <span>✅ Approved Admins</span>
                      {approvedAdmins.length > 0 && (
                        <span style={S.countBadge('#10b981')}>{approvedAdmins.length} active</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>
                      Only you (super admin) can revoke access from approved admins.
                    </div>

                    {notifLoading ? (
                      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading...</div>
                    ) : approvedAdmins.length === 0 ? (
                      <div style={S.emptyState}>
                        <div style={{ fontSize: 13, color: 'var(--text3)' }}>No approved admins yet.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {approvedAdmins.map(u => (
                          <div key={u._id} style={S.notifCard('approved')}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                              <div style={S.notifAvatar('#10b981')}>
                                {u.avatar
                                  ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                  : <span style={{ fontSize: 18, fontWeight: 700 }}>{u.name[0].toUpperCase()}</span>
                                }
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</div>
                                <div style={{ color: 'var(--text3)', fontSize: 13 }}>{u.email}</div>
                                <div style={{ marginTop: 4 }}>
                                  <span style={{ background: '#10b98122', color: '#10b981', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                                    ✅ Active Admin
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button className="btn" onClick={() => handleRevokeAdmin(u)}
                              style={S.notifActionBtn('#f59e0b')}>
                              🔒 Revoke Access
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ AUDIT LOG TAB ══ */}
            {tab === 'Audit Log' && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Timestamp', 'Admin', 'Action', 'Details'].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => {
                      const meta = ACTION_LABELS[log.action] || { label: log.action, color: '#888' };
                      return (
                        <tr key={log._id} style={S.tr}>
                          <td style={{ ...S.td, color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td style={S.td}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{log.adminName}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{log.adminEmail}</div>
                          </td>
                          <td style={S.td}>
                            <span style={{ background: meta.color + '22', color: meta.color, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ ...S.td, color: 'var(--text2)', fontSize: 13 }}>{log.details}</td>
                        </tr>
                      );
                    })}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ ...S.td, textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                          No actions logged yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  page:        { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  sidebar:     { width: 220, background: 'var(--bg2)', borderRight: '1px solid var(--border)', padding: '24px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 },
  sideTop:     { display: 'flex', flexDirection: 'column', gap: 0 },
  logo:        { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 },
  adminBadge:  { background: 'var(--accent-dim)', color: 'var(--accent2)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, marginBottom: 24, textAlign: 'center' },
  nav:         { display: 'flex', flexDirection: 'column', gap: 4 },
  navBtn:      { width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navBtnActive:{ background: 'var(--accent-dim)', color: 'var(--accent2)' },
  pendingBadge:{ background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 7px', minWidth: 20, textAlign: 'center' },
  adminInfo:   { display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 4 },
  main:        { flex: 1, padding: '32px 36px', overflowY: 'auto' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  tableWrap:   { overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text3)', fontWeight: 600, background: 'var(--bg2)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr:          { borderBottom: '1px solid var(--border)' },
  td:          { padding: '14px 16px', fontSize: 14, color: 'var(--text)' },
  annCard:     { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'flex-start' },
  composeBox:  { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 4 },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal:       { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400 },
  actionBtn:   (color) => ({ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: color + '15', color, border: `1px solid ${color}33`, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }),

  // Notification-specific
  infoBox:      { background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, padding: '16px 20px' },
  sectionHeading: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 14 },
  countBadge:   (color) => ({ background: color + '22', color, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }),
  emptyState:   { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' },
  notifCard:    (type) => ({
    background: 'var(--bg2)',
    border: `1px solid ${type === 'pending' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.2)'}`,
    borderRadius: 12,
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  }),
  notifAvatar:  (color) => ({
    width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
    background: color + '22', border: `2px solid ${color}44`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color, fontWeight: 700, overflow: 'hidden',
  }),
  notifActionBtn: (color) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 600,
    background: color + '15', color,
    border: `1px solid ${color}44`,
    borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
  }),
};