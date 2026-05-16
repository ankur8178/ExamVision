import React from 'react';

export default function Avatar({ user, size = 36, style = {} }) {
  const s = {
    width: size, height: size, borderRadius: '50%',
    overflow: 'hidden', flexShrink: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent-dim)', color: 'var(--accent2)',
    fontWeight: 800, fontSize: size * 0.4, border: '2px solid var(--border)',
    ...style
  };
  if (user?.avatar) {
    return <img src={user.avatar} alt={user.name} style={{ ...s, objectFit: 'cover' }} />;
  }
  return <div style={s}>{user?.name?.[0]?.toUpperCase() || '?'}</div>;
}
