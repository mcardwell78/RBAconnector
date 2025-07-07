// Shared UI styles for RBA CRM
import { RBA_GREEN, RBA_ACCENT } from './rbaColors';

export const cardStyle = {
  background: '#fff',
  borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
  padding: 24,
  marginBottom: 24,
  width: 420,
  minWidth: 320,
  maxWidth: 420,
  marginLeft: 'auto',
  marginRight: 'auto',
  fontFamily: 'Arial, sans-serif',
};

export const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: '#333',
  fontWeight: 500,
  marginBottom: 12,
  fontFamily: 'Arial, sans-serif',
};

export const inputStyle = {
  width: '60%',
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid #ccc',
  marginBottom: 16,
  fontSize: 16,
  boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
};

export const buttonOutlineStyle = {
  background: '#fff',
  color: RBA_ACCENT,
  border: `1.5px solid ${RBA_ACCENT}`,
  borderRadius: 4,
  padding: '8px 18px',
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
  marginTop: 0,
  transition: 'background 0.2s, color 0.2s',
  fontFamily: 'Arial, sans-serif',
};

export const sectionTitleStyle = {
  color: RBA_ACCENT,
  fontWeight: 700,
  fontSize: 20,
  marginBottom: 12,
  fontFamily: 'Arial, sans-serif',
};

export const modalStyle = {
  background: '#fff',
  border: '1px solid #ccc',
  padding: 24,
  position: 'fixed',
  top: '30%',
  left: '50%',
  transform: 'translate(-50%, -30%)',
  zIndex: 1000,
  borderRadius: 8,
  boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
  fontFamily: 'Arial, sans-serif',
};

export const tableHeaderStyle = {
  background: '#F6F6F6',
  fontWeight: 600,
  fontFamily: 'Arial, sans-serif',
};

export const tableCellStyle = {
  padding: '8px 4px',
  fontFamily: 'Arial, sans-serif',
};
