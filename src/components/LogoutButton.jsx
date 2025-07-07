import React from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/auth';
import { buttonOutlineStyle } from '../utils/sharedStyles';

export default function LogoutButton({ buttonStyle }) {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  return <button onClick={handleLogout} style={buttonStyle || buttonOutlineStyle}>Logout</button>;
}
