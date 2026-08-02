import React from 'react';

const checks = [
  { label: '8+ characters',           test: v => v.length >= 8 },
  { label: 'Uppercase letter (A-Z)',  test: v => /[A-Z]/.test(v) },
  { label: 'Lowercase letter (a-z)',  test: v => /[a-z]/.test(v) },
  { label: 'Number (0-9)',            test: v => /[0-9]/.test(v) },
  { label: 'Special character (!@#$%^&*...)', test: v => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(v) },
];

const getStrength = (passed) => {
  if (passed === 5) return { label: 'Strong',  color: '#22c55e', width: '100%' };
  if (passed >= 3)  return { label: 'Medium',  color: '#f59e0b', width: '60%'  };
  if (passed >= 1)  return { label: 'Weak',    color: '#ef4444', width: '25%'  };
  return                   { label: '',        color: '#2d2d3a', width: '0%'   };
};

export default function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const results  = checks.map(c => ({ ...c, passed: c.test(password) }));
  const passed   = results.filter(r => r.passed).length;
  const strength = getStrength(passed);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 5, background: '#2d2d3a', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: strength.width,
            background: strength.color, borderRadius: 99,
            transition: 'width 0.3s ease, background 0.3s ease',
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: strength.color, minWidth: 44 }}>
          {strength.label}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {results.map(r => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12, color: r.passed ? '#22c55e' : '#64748b' }}>
              {r.passed ? '✓' : '○'}
            </span>
            <span style={{ fontSize: 12, color: r.passed ? '#94a3b8' : '#64748b' }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}