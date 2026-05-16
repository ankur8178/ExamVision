import React, { useState } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const securityOptions = [
  { key: 'tabSwitchDetection', label: 'Tab Switch Detection', desc: 'Detect and log when student switches browser tabs or minimizes window', icon: '🔍' },
  { key: 'fullscreenEnforcement', label: 'Fullscreen Enforcement', desc: 'Force exam to run in fullscreen mode; violations recorded on exit', icon: '⛶' },
  { key: 'copyPasteBlocking', label: 'Copy / Paste Blocking', desc: 'Prevent copying or pasting any text during the exam', icon: '🚫' },
  { key: 'rightClickBlocking', label: 'Right-Click Blocking', desc: 'Disable right-click context menu throughout the exam', icon: '🖱️' },
  { key: 'autoSubmitOnMaxViolations', label: 'Auto-Submit vs Pausing', desc: 'If enabled, exam auto-submits at max limit. If disabled, it PAUSES instead.', icon: '⚡' },
  { key: 'oneWayNavigation', label: 'One-Way Navigation', desc: 'Students cannot go back to previously answered questions', icon: '→' },
  { key: 'questionRandomization', label: 'Question Randomization', desc: 'Shuffle question order uniquely for each student', icon: '🔀' },
  { key: 'perQuestionTimeTracking', label: 'Per-Question Time Tracking', desc: 'Track and display time spent on each individual question', icon: '⏱️' },
  { key: 'screenRecording', label: 'Screen Recording', desc: 'Record entire student screen during the exam (requires browser permission)', icon: '🖥️' },
  { key: 'cameraRecording', label: 'Camera Recording', desc: 'Record student via webcam during the exam (requires camera permission)', icon: '📷' },
  { key: 'studentPauseAllowed', label: 'Student Pause Allowed', desc: 'Allow students to manually pause their exam. Timer pauses.', icon: '⏸' },
];

export default function SecuritySettings({ test, setTest }) {
  const [security, setSecurity] = useState({ ...test.security } || {});
  const [maxSwitches, setMaxSwitches] = useState(test.security?.maxTabSwitches || 3);
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setSecurity(s => ({ ...s, [key]: !s[key] }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/tests/${test._id}/security`, { ...security, maxTabSwitches: parseInt(maxSwitches) });
      setTest(prev => ({ ...prev, security: res.data.security }));
      toast.success('Security settings saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const resetDefaults = () => {
    setSecurity({
      tabSwitchDetection: true, fullscreenEnforcement: true, copyPasteBlocking: true,
      rightClickBlocking: true, autoSubmitOnMaxViolations: true, oneWayNavigation: false,
      questionRandomization: true, perQuestionTimeTracking: true, screenRecording: false, cameraRecording: false, studentPauseAllowed: false
    });
    setMaxSwitches(3);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ borderLeft: '3px solid var(--accent)', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <h3 style={{ fontSize: 16 }}>Exam Security Configuration</h3>
        </div>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>
          Configure proctoring measures. Changes apply immediately to future exam sessions.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {securityOptions.map(opt => (
          <div key={opt.key} style={styles.optRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{opt.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>{opt.desc}</div>
              </div>
            </div>
            <label className="toggle" style={{ flexShrink: 0 }}>
              <input type="checkbox" checked={!!security[opt.key]} onChange={() => toggle(opt.key)} />
              <span className="toggle-slider" />
            </label>
          </div>
        ))}
      </div>

      {(security.tabSwitchDetection || security.autoSubmitOnMaxViolations) && (
        <div className="card">
          <h4 style={{ fontSize: 14, marginBottom: 12 }}>Violation Threshold</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="input-group" style={{ maxWidth: 160 }}>
              <label className="input-label">Max Violations Before Auto-Submit</label>
              <input className="input" type="number" min="1" max="20" value={maxSwitches}
                onChange={e => setMaxSwitches(e.target.value)} />
            </div>
            <p style={{ color: 'var(--text3)', fontSize: 13, paddingTop: 20 }}>
              {security.autoSubmitOnMaxViolations
                ? `Exam auto-submits after ${maxSwitches} violation(s)`
                : `Violations recorded but exam won't auto-submit`}
            </p>
          </div>
        </div>
      )}

      {(security.screenRecording || security.cameraRecording) && (
        <div style={{ padding: '12px 16px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10 }}>
          <p style={{ color: 'var(--red)', fontSize: 13, lineHeight: 1.6 }}>
            ⚠️ <strong>Recording enabled:</strong> Students will be prompted for {security.screenRecording ? 'screen' : ''}{security.screenRecording && security.cameraRecording ? ' and ' : ''}{security.cameraRecording ? 'camera' : ''} permission when starting the exam.
            Recordings are session-based. Integrate cloud storage (AWS S3, Cloudinary) to persist across sessions.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner" /> Saving...</> : '💾 Save Security Settings'}
        </button>
        <button className="btn btn-secondary" onClick={resetDefaults}>↺ Reset Defaults</button>
      </div>
    </div>
  );
}

const styles = {
  optRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, gap: 16 }
};
