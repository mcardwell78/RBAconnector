import React from 'react';
import logo from '../screens/assets/Small logo.png';
import { RBA_GREEN } from '../utils/rbaColors';

export default function Footer() {
  return (
    <footer style={{ background: '#fff', borderTop: `2px solid ${RBA_GREEN}`, padding: 16, textAlign: 'center', marginTop: 40 }}>
      <img src={logo} alt="DC Power Connector" style={{ height: 32, verticalAlign: 'middle', marginRight: 12 }} />
      <span style={{ color: '#222', fontWeight: 600 }}>DC Power Connector &copy; {new Date().getFullYear()} Renewal by Andersen</span>
    </footer>
  );
}
