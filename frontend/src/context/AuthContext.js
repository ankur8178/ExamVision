import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  // ── Sync user role with backend on every page load ────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Skip for super admin (hardcoded, no DB record)
    const stored = JSON.parse(localStorage.getItem('user') || 'null');
    if (stored?.isSuperAdmin) return;

    api.get('/auth/me')
      .then(res => {
        const fresh = res.data;
        // Update stored user if role has changed (e.g. promoted to admin)
        const current = JSON.parse(localStorage.getItem('user') || 'null');
        if (current && fresh.role !== current.role) {
          const updated = { ...current, role: fresh.role, adminStatus: fresh.adminStatus };
          localStorage.setItem('user', JSON.stringify(updated));
          setUser(updated);
        }
      })
      .catch(() => {
        // Token invalid/expired — log out
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      });
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (name, email, password, role) => {
    const res = await api.post('/auth/register', { name, email, password, role });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const loginWithToken = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const updateAvatar = (avatar) => {
    const updated = { ...user, avatar };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  const updateUser = (updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateAvatar, updateUser, loginWithToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);