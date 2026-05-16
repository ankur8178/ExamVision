import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/shared/Layout';
import Avatar from '../components/shared/Avatar';
import api from '../utils/api';
import toast from 'react-hot-toast';
import StudentMessaging from '../components/student/StudentMessaging';

export default function CourseDetailStudent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse]               = useState(null);
  const [tests, setTests]                 = useState([]);
  const [attempts, setAttempts]           = useState({});
  const [attemptCounts, setAttemptCounts] = useState({});
  const [activeTab, setActiveTab]         = useState('tests');
  const [lockedAttempts, setLockedAttempts] = useState({});

  useEffect(() => { fetchCourse(); fetchTests(); }, [id]);

  const fetchCourse = async () => {
    try { const res = await api.get(`/courses/${id}`); setCourse(res.data); }
    catch { toast.error('Course not found'); navigate('/student'); }
  };

  const fetchTests = async () => {
    try {
      const res = await api.get(`/tests/course/${id}`);
      setTests(res.data);
      const attMap = {}, countMap = {};
      await Promise.all(res.data.map(async t => {
        try {
          const [aRes, cRes] = await Promise.all([
            api.get(`/attempts/my/${t._id}`),
            api.get(`/attempts/my/${t._id}/count`)
          ]);
          if (aRes.data) attMap[t._id] = aRes.data;
          countMap[t._id] = cRes.data.count || 0;
        } catch { }
      }));
      setAttempts(attMap);
      setAttemptCounts(countMap);
    } catch { }
  };

  const checkLockedStatuses = useCallback(async (attMap) => {
    const pausedEntries = Object.entries(attMap).filter(
      ([, att]) => att?.status === 'paused'
    );
    if (!pausedEntries.length) return;

    const results = await Promise.all(
      pausedEntries.map(async ([testId, att]) => {
        try {
          const res = await api.get(`/attempts/${att._id}/resume-status`);
          return { testId, teacherMustResume: res.data.teacherMustResume };
        } catch {
          return { testId, teacherMustResume: true };
        }
      })
    );

    setLockedAttempts(prev => {
      const next = { ...prev };
      results.forEach(({ testId, teacherMustResume }) => {
        next[testId] = teacherMustResume;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!Object.keys(attempts).length) return;
    checkLockedStatuses(attempts);
    const interval = setInterval(() => checkLockedStatuses(attempts), 5000);
    return () => clearInterval(interval);
  }, [attempts, checkLockedStatuses]);

  // ── FIXED: use attemptCounts as source of truth instead of attempt.status ──
  const getTestStatus = (test) => {
    const attempt = attempts[test._id];
    const count = attemptCounts[test._id] || 0;

    if (attempt?.status === 'in_progress')    return { label: 'In Progress', color: 'badge-yellow', canStart: true, resume: true };
    if (attempt?.status === 'paused')         return { label: 'Locked', color: 'badge-red', canStart: false, locked: true };
    if (attempt?.status === 'student_paused') return { label: 'Paused', color: 'badge-blue', canStart: true, resume: true };

    if (count > 0) {
      if (test.allowReattempt) {
        const unlimited = test.maxAttempts === 0;
        if (unlimited || count < test.maxAttempts)
          return {
            label: `Completed (${count}/${unlimited ? '∞' : test.maxAttempts})`,
            color: 'badge-green', canStart: true, reattempt: true,
          };
      }
      return { label: 'Completed', color: 'badge-green', canStart: false };
    }

    return { label: 'Not Started', color: 'badge-blue', canStart: true };
  };

  const isTestAvailable = (test) => {
    const now = new Date();
    if (test.startTime && new Date(test.startTime) > now) return false;
    if (test.endTime   && new Date(test.endTime)   < now) return false;
    return test.status === 'published';
  };

  if (!course) return (
    <Layout title="Loading...">
      <div className="empty-state"><div className="spinner" /></div>
    </Layout>
  );

  return (
    <Layout>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/student')}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontFamily: 'Syne,sans-serif' }}>{course.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Avatar user={course.teacher} size={22} />
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>
              {course.teacher?.name} · {tests.length} test{tests.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${activeTab === 'tests'   ? ' active' : ''}`} onClick={() => setActiveTab('tests')}>📝 Tests</button>
        <button className={`tab${activeTab === 'teacher' ? ' active' : ''}`} onClick={() => setActiveTab('teacher')}>👨‍🏫 About Teacher</button>
        <button className={`tab${activeTab === 'messages'? ' active' : ''}`} onClick={() => setActiveTab('messages')}>💬 Message Teacher</button>
      </div>

      {activeTab === 'tests' && (
        tests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <h3>No tests available yet</h3>
            <p>Your teacher hasn't published any tests</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tests.map(test => {
              const status    = getTestStatus(test);
              const available = isTestAvailable(test);
              const attempt   = attempts[test._id];
              const isLocked  = status.locked && lockedAttempts[test._id] !== false;

              return (
                <div key={test._id} style={S.testCard}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16 }}>{test.title}</h3>
                      <span className={`badge ${status.color}`}>{status.label}</span>
                      {!available && test.status === 'published' && (
                        <span className="badge badge-yellow">Scheduled</span>
                      )}
                    </div>
                    {test.description && (
                      <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 8 }}>{test.description}</p>
                    )}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span style={S.meta}>⏱ {test.duration} min</span>
                      {test.totalMarks > 0 && <span style={S.meta}>🎯 {test.totalMarks} marks</span>}
                      {test.startTime && <span style={S.meta}>📅 From: {new Date(test.startTime).toLocaleString()}</span>}
                      {test.endTime   && <span style={S.meta}>📅 Until: {new Date(test.endTime).toLocaleString()}</span>}
                      {test.allowReattempt && (
                        <span style={{ ...S.meta, color: 'var(--blue)' }}>
                          🔄 {test.maxAttempts === 0 ? 'Unlimited attempts' : `${test.maxAttempts} attempt${test.maxAttempts > 1 ? 's' : ''}`}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {test.security?.fullscreenEnforcement && <span style={S.secTag}>⛶ Fullscreen</span>}
                      {test.security?.tabSwitchDetection    && <span style={S.secTag}>🔍 Monitored</span>}
                      {test.security?.questionRandomization && <span style={S.secTag}>🔀 Randomized</span>}
                      {test.security?.screenRecording       && <span style={{ ...S.secTag, color: 'var(--red)' }}>🖥️ Screen Rec</span>}
                      {test.security?.cameraRecording       && <span style={{ ...S.secTag, color: 'var(--red)' }}>📷 Camera</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                    {status.locked && isLocked && (
                      <div style={S.lockedBox}>
                        <span style={{ fontSize: 18 }}>🔒</span>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>
                            Locked by System
                          </div>
                          <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>
                            Waiting for teacher to unlock...
                          </div>
                        </div>
                        <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--red)' }} />
                      </div>
                    )}

                    {status.canStart && available && !isLocked && (
                      <Link to={`/exam/${test._id}`} className="btn btn-primary">
                        {status.resume ? '↩ Resume' : status.reattempt ? '🔄 Reattempt' : '▶ Start'}
                      </Link>
                    )}

                    {attempt && !['pending','in_progress','paused','student_paused'].includes(attempt.status) && (
                      <Link to={`/result/${test._id}`} className="btn btn-secondary btn-sm">
                        View Result →
                      </Link>
                    )}

                    {!available && test.status === 'published' && (
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>Not yet available</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {activeTab === 'teacher' && course.teacher && (
        <TeacherCard teacher={course.teacher} course={course} testsCount={tests.length} />
      )}

      {activeTab === 'messages' && (
        <StudentMessaging courses={[course]} defaultCourseId={course._id} defaultTeacher={course.teacher} />
      )}
    </Layout>
  );
}

function TeacherCard({ teacher, course, testsCount }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <div style={S.teacherCard}>
        <div style={S.teacherBanner} />
        <div style={S.teacherBody}>
          <div style={S.teacherAvatarWrap}><Avatar user={teacher} size={88} style={{ border: '4px solid var(--bg2)' }} /></div>
          <div>
            <h2 style={{ fontSize: 22, fontFamily: 'Syne,sans-serif' }}>{teacher.name}</h2>
            <p style={{ color: 'var(--accent2)', fontSize: 14, fontWeight: 600, marginTop: 2 }}>Teacher · Educator</p>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>{teacher.email}</p>
          </div>
        </div>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 16, fontFamily: 'Syne,sans-serif' }}>📚 Course Information</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={S.infoRow}><span style={S.infoLabel}>Subject / Course</span><span style={S.infoVal}>{course.name}</span></div>
          {course.description && <div style={S.infoRow}><span style={S.infoLabel}>Description</span><span style={S.infoVal}>{course.description}</span></div>}
          <div style={S.infoRow}><span style={S.infoLabel}>Course Code</span><span style={{ ...S.infoVal, fontFamily: 'monospace', letterSpacing: 2, color: 'var(--accent2)', fontWeight: 700 }}>{course.code}</span></div>
          <div style={S.infoRow}><span style={S.infoLabel}>Tests Published</span><span style={S.infoVal}>{testsCount}</span></div>
          <div style={S.infoRow}><span style={S.infoLabel}>Students Enrolled</span><span style={S.infoVal}>{course.students?.length || 0}</span></div>
        </div>
      </div>
      {course.students?.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14, fontFamily: 'Syne,sans-serif' }}>👥 Your Classmates</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {course.students.map(s => (
              <div key={s._id} style={S.classmatePill}>
                <Avatar user={s} size={26} />
                <span style={{ fontSize: 13 }}>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  testCard:        { display: 'flex', alignItems: 'flex-start', gap: 16, padding: '18px 20px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap' },
  meta:            { color: 'var(--text3)', fontSize: 12 },
  secTag:          { fontSize: 11, padding: '2px 8px', background: 'var(--bg4)', borderRadius: 20, color: 'var(--text3)' },
  lockedBox:       { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, maxWidth: 220 },
  teacherCard:     { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  teacherBanner:   { height: 80, background: 'linear-gradient(135deg, var(--accent) 0%, #8b5cf6 50%, var(--pink) 100%)', opacity: 0.7 },
  teacherBody:     { padding: '16px 24px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  teacherAvatarWrap: { flexShrink: 0 },
  infoRow:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 16 },
  infoLabel:       { color: 'var(--text3)', fontSize: 13, flexShrink: 0 },
  infoVal:         { color: 'var(--text)', fontSize: 14, fontWeight: 500, textAlign: 'right' },
  classmatePill:   { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20 },
};