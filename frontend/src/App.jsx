import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ReviewerDashboard from './pages/ReviewerDashboard';
import SessionBanner from './components/SessionBanner';

function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'reviewer') return '/reviewer';
  return '/user';
}

function Guard({ role, children }) {
  const token = localStorage.getItem('token');
  const raw = localStorage.getItem('user');
  if (!token || !raw) return <Navigate to="/login" replace />;
  const user = JSON.parse(raw);
  // Reviewers reach the user dashboard only if an admin granted can_do_tasks.
  const allowed = user.role === role || (user.role === 'reviewer' && role === 'user' && user.can_do_tasks);
  if (!allowed) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  // Refresh the cached user (role, can_do_tasks) from the server on every load
  // so admin grants/revokes take effect on refresh without a re-login.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('token')) { setReady(true); return; }
    api.me()
      .then(u => localStorage.setItem('user', JSON.stringify(u)))
      .catch(() => {}) // invalid/expired token handled by the session-expired event
      .finally(() => setReady(true));
  }, []);
  if (!ready) return null;

  return (
    <BrowserRouter>
      <SessionBanner />
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/user"  element={<Guard role="user"><UserDashboard /></Guard>} />
        <Route path="/admin" element={<Guard role="admin"><AdminDashboard /></Guard>} />
        <Route path="/reviewer" element={<Guard role="reviewer"><ReviewerDashboard /></Guard>} />
        <Route path="*"      element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
