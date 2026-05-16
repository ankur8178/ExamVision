import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminDashboard from './pages/AdminDashboard';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import CourseDetailTeacher from './pages/CourseDetailTeacher';
import CourseDetailStudent from './pages/CourseDetailStudent';
import TestDetailTeacher from './pages/TestDetailTeacher';
import ExamPage from './pages/ExamPage';
import ResultPage from './pages/ResultPage';

const PrivateRoute = ({ children, role }) => {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" />;

  // Promoted teacher: their token says 'admin' but they're on a teacher route
  if (role === 'teacher' && user.role === 'admin') {
    logout();
    return <Navigate to="/login?promoted=1" replace />;
  }

  if (role && user.role !== role) return <Navigate to="/" />;
  return children;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'teacher') return <Navigate to="/teacher" />;
  if (user.role === 'admin') return <Navigate to="/admin" />;
  return <Navigate to="/student" />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--bg2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              fontSize: '14px'
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } }
          }}
        />
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/teacher" element={<PrivateRoute role="teacher"><TeacherDashboard /></PrivateRoute>} />
          <Route path="/teacher/course/:id" element={<PrivateRoute role="teacher"><CourseDetailTeacher /></PrivateRoute>} />
          <Route path="/teacher/test/:id" element={<PrivateRoute role="teacher"><TestDetailTeacher /></PrivateRoute>} />
          <Route path="/student" element={<PrivateRoute role="student"><StudentDashboard /></PrivateRoute>} />
          <Route path="/student/course/:id" element={<PrivateRoute role="student"><CourseDetailStudent /></PrivateRoute>} />
          <Route path="/exam/:testId" element={<PrivateRoute role="student"><ExamPage /></PrivateRoute>} />
          <Route path="/result/:testId" element={<PrivateRoute><ResultPage /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute role="admin"><AdminDashboard /></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}