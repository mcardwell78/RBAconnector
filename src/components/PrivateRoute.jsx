import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export default function PrivateRoute({ user, loading }) {
  if (loading) return null; // Or a spinner
  return user ? <Outlet /> : <Navigate to="/login" />;
}
