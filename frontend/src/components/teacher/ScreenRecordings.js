import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Avatar from '../shared/Avatar';

export default function ScreenRecordings({ testId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [recType, setRecType] = useState('screen');

  // ── CHANGED: replaced single fetch with polling until no uploads are pending ──
  useEffect(() => {
    let interval = null;
    let cancelled = false;

    const fetchAttempts = async () => {
      try {
        const res = await api.get(`/recordings/test/${testId}`);
        if (cancelled) return;
        setAttempts(res.data);
        setLoading(false);

        if (res.data.some(a => a.uploadPending)) {
          interval = setInterval(async () => {
            try {
              const r = await api.get(`/recordings/test/${testId}`);
              if (cancelled) return;
              setAttempts(r.data);
              if (!r.data.some(a => a.uploadPending)) {
                clearInterval(interval);
                interval = null;
              }
            } catch {}
          }, 8000);
        }
      } catch {}
    };

    fetchAttempts();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [testId]);

  const getRecordingUrl = (attempt, type) => {
    const rel = type === 'screen' ? attempt.screenUrl : attempt.cameraUrl;
    if (!rel) return null;
    if (rel.startsWith('http://') || rel.startsWith('https://')) return rel;
    const API_BASE = process.env.REACT_APP_API_URL
      ? process.env.REACT_APP_API_URL.replace('/api', '')
      : 'http://localhost:5001';
    return `${API_BASE}${rel}`;
  };

  const isDriveUrl = (url) => {
    return url && (url.includes('drive.google.com') || url.includes('googleapis.com'));
  };

  const getDriveEmbedUrl = (url) => {
    if (!url) return null;
    const match = url.match(/\/d\/([^/]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    const idMatch = url.match(/[?&]id=([^&]+)/);
    if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
    return url;
  };

  const hasScreenRec = attempts.some(a => a.screenUrl);
  const hasCameraRec = attempts.some(a => a.cameraUrl);

  if (loading) return <div className="empty-state"><div className="spinner" /></div>;

  if (attempts.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">📹</div>
      <h3>No submissions yet</h3>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 18, fontFamily: 'Syne,sans-serif' }}>📹 Student Recordings</h3>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
            Recordings are stored on Cloudinary. Accessible from any device.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasScreenRec && (
            <button className={`btn btn-sm ${recType === 'screen' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRecType('screen')}>🖥️ Screen</button>
          )}
          {hasCameraRec && (
            <button className={`btn btn-sm ${recType === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setRecType('camera')}>📷 Camera</button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div style={{ padding: '10px 16px', background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--blue)' }}>
        ☁️ Recordings are automatically uploaded when the student submits. You can watch or download them from any device.
      </div>

      <div style={S.grid}>
        {attempts.map(a => {
          const url = getRecordingUrl(a, recType);
          const hasRec = !!url;
          // ── CHANGED: read isPending from backend flag ──
          const isPending = a.uploadPending;
          const isOnDrive = isDriveUrl(url);
          const isSel = selected?.attemptId === a.attemptId;
          return (
            <div key={a.attemptId}
              // ── CHANGED: added cardPending style for uploading state ──
              style={{ ...S.card, ...(isSel ? S.cardSel : {}), ...(!hasRec && !isPending ? S.cardDim : !hasRec ? S.cardPending : { cursor: 'pointer' }) }}
              onClick={() => hasRec && setSelected(a)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Avatar user={a.student} size={36} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {/* ── CHANGED: added isPending badge ── */}
                  {hasRec
                    ? <span style={S.recBadge}>● REC</span>
                    : isPending
                      ? <span style={S.pendingBadge}>⏳ Uploading...</span>
                      : <span style={S.noBadge}>No rec</span>}
                  {isOnDrive && <span style={S.driveBadge}>☁️ Drive</span>}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.student?.name}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 2 }}>{a.student?.email}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--accent2)', fontWeight: 700, fontSize: 13 }}>{a.score ?? '—'}</span>
                {a.violationCount > 0 && <span style={{ color: 'var(--red)', fontSize: 12 }}>⚠️ {a.violationCount}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (() => {
        const url = getRecordingUrl(selected, recType);
        const isOnDrive = isDriveUrl(url);
        const embedUrl = isOnDrive ? getDriveEmbedUrl(url) : null;
        return (
          <div style={S.player}>
            <div style={S.playerHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar user={selected.student} size={38} />
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.student?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Score: {selected.score ?? '—'} · {selected.violationCount} violation{selected.violationCount !== 1 ? 's' : ''}
                    {isOnDrive && <span style={{ color: 'var(--green)', marginLeft: 8 }}>☁️ Google Drive</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selected.screenUrl && selected.cameraUrl && (
                  <>
                    <button className={`btn btn-sm ${recType === 'screen' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRecType('screen')}>🖥️ Screen</button>
                    <button className={`btn btn-sm ${recType === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRecType('camera')}>📷 Camera</button>
                  </>
                )}
                {url && (
                  isOnDrive ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      ⬇️ Download
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      ⬇️ Download
                    </a>
                  )
                )}
                {isOnDrive && (
                  <a href={url.replace(/&export=download/, '')} target="_blank" rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm" style={{ gap: 4 }}>
                    🔗 Open in Drive
                  </a>
                )}
                <button style={S.closeBtn} onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>

            <div style={{ display: 'flex' }}>
              <div style={{ flex: 1 }}>
                {isOnDrive && embedUrl ? (
                  <iframe
                    key={embedUrl}
                    src={embedUrl}
                    style={{ width: '100%', height: 440, border: 'none', background: '#000', display: 'block' }}
                    allow="autoplay"
                    title="Recording preview"
                  />
                ) : url ? (
                  <video
                    key={url}
                    src={url}
                    controls
                    style={{ width: '100%', maxHeight: 440, background: '#000', display: 'block' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div style={{ ...S.noVideo, display: url ? 'none' : 'flex' }}>
                  <div style={{ fontSize: 48 }}>🎬</div>
                  <p style={{ color: 'var(--text2)', fontWeight: 600, marginTop: 12 }}>Recording Unavailable</p>
                  <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 8, textAlign: 'center', maxWidth: 320 }}>
                    No {recType} recording was uploaded for this student.
                  </p>
                </div>
              </div>

              {selected.violationCount > 0 && (
                <div style={S.violLog}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                    Violations ({selected.violationCount})
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--red)' }}>
                    ⚠️ {selected.violationCount} violation{selected.violationCount !== 1 ? 's' : ''} recorded during this exam.
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const S = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 },
  card: { padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, transition: 'all 0.15s' },
  cardSel: { border: '2px solid var(--accent)', background: 'var(--accent-dim)' },
  cardDim: { opacity: 0.45, cursor: 'not-allowed' },
  // ── CHANGED: added pendingBadge and cardPending styles ──
  pendingBadge: { fontSize: 10, fontWeight: 700, color: 'var(--yellow)', background: 'var(--yellow-dim)', padding: '2px 8px', borderRadius: 20 },
  cardPending:  { opacity: 0.7, cursor: 'not-allowed', border: '1px dashed var(--yellow)' },
  recBadge: { fontSize: 10, fontWeight: 700, color: 'var(--red)', background: 'var(--red-dim)', padding: '2px 8px', borderRadius: 20 },
  noBadge: { fontSize: 10, color: 'var(--text3)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 20 },
  driveBadge: { fontSize: 10, fontWeight: 600, color: 'var(--green)', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 20 },
  player: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  playerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 },
  noVideo: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', minHeight: 260, background: 'var(--bg3)' },
  violLog: { width: 220, flexShrink: 0, padding: 14, borderLeft: '1px solid var(--border)', overflowY: 'auto', maxHeight: 360, display: 'flex', flexDirection: 'column', gap: 8 },
  closeBtn: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, color: 'var(--text2)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }
};