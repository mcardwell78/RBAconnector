import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import LogoutButton from './LogoutButton';
import { buttonOutlineStyle } from '../utils/sharedStyles';

export default function Navbar({ logo }) {
  // If needed, use user from localStorage or pass as prop
  const user = JSON.parse(localStorage.getItem('user'));
  const location = useLocation();  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/contacts', label: 'Contacts' },
    { to: '/campaigns', label: 'Campaigns' },
    { to: '/email-templates', label: 'Email Templates' },
    { to: '/tasks', label: 'Tasks' },
    { to: '/settings', label: 'Settings' },
  ];
  return (
    <nav style={{
      padding: 12,
      background: '#fff',
      borderBottom: `4px solid #5BA150`,
      marginBottom: 24,
      display: 'flex',
      alignItems: 'center',
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      zIndex: 1000,
      fontFamily: 'Arial, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
      minHeight: 64,
      justifyContent: 'space-between',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, minWidth: 0 }}>
        <img src={logo} alt="DC Power Connector" style={{ height: 56, marginRight: 22, flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', minWidth: 0, maxWidth: '60vw', overflow: 'hidden' }}>
          {user && navLinks.map(link => {
            const isActive = location.pathname.startsWith(link.to);
            return (
              <span key={link.to} style={{ position: 'relative', marginRight: 14, display: 'inline-block', whiteSpace: 'nowrap' }}>
                {isActive && (
                  <span style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    zIndex: 0,
                    pointerEvents: 'none',
                    background: 'radial-gradient(circle, rgba(91,161,80,0.35) 0%, rgba(91,161,80,0.18) 60%, rgba(91,161,80,0.08) 100%)',
                    filter: 'blur(0.5px)',
                  }} />
                )}
                <Link to={link.to} style={{ color: '#222', fontWeight: 600, fontFamily: 'Arial, sans-serif', textDecoration: 'none', padding: '0 4px', position: 'relative', zIndex: 1 }}>{link.label}</Link>
              </span>
            );
          })}
        </div>
      </div>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 12, flexShrink: 0, marginRight: 48, borderRight: 'none', borderLeft: '1px solid #e0e0e0', paddingLeft: 16, maxWidth: 140 }}>
          <LogoutButton buttonStyle={{ ...buttonOutlineStyle, fontSize: 15, padding: '8px 18px', height: 38, minWidth: 90, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} />
        </div>
      )}
    </nav>
  );
}
