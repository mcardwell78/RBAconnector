import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import Logo from './assets/Logo.png';

export default function EditContactScreen() {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchContact() {
      const ref = doc(db, 'contacts', id);
      const snap = await getDoc(ref);
      if (snap.exists()) setContact(snap.data());
      setLoading(false);
    }
    fetchContact();
  }, [id]);

  const handleChange = e => {
    setContact({ ...contact, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    await updateDoc(doc(db, 'contacts', id), contact);
    setStatus('Contact updated!');
    setTimeout(() => navigate(`/contacts/${id}`), 800);
  };

  if (loading || !contact) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 500, padding: 32, position: 'relative', minWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Logo in upper left, matching other screens */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 0, alignSelf: 'flex-start' }}>
          <img src={Logo} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 16, marginLeft: 4, marginBottom: 16 }} />
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ width: '100%' }}>
            <label>First Name</label><br />
            <input name="firstName" value={contact.firstName || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: '100%' }}>
            <label>Last Name</label><br />
            <input name="lastName" value={contact.lastName || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: '100%' }}>
            <label>Email</label><br />
            <input name="email" value={contact.email || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: '100%' }}>
            <label>Mobile Phone</label><br />
            <input name="mobilePhone" value={contact.mobilePhone || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: '100%' }}>
            <label>Home Phone</label><br />
            <input name="homePhone" value={contact.homePhone || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: '100%' }}>
            <label>Zip</label><br />
            <input name="zip" value={contact.zip || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: '100%' }}>
            <label>Status</label><br />
            <select name="status" value={contact.status || 'prospect'} onChange={handleChange} style={{ ...inputStyle, width: '100%' }}>
              <option value="prospect">Prospect</option>
              <option value="client">Client</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div style={{ width: '100%' }}>
            <label>Quote Amount</label><br />
            <input name="quoteAmount" value={contact.quoteAmount || ''} onChange={handleChange} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 18, justifyContent: 'center', width: '100%' }}>
            <button
              type="button"
              onClick={() => navigate(`/contacts/${id}`)}
              style={{ ...buttonOutlineStyle, background: '#ccc', color: '#222', minWidth: 90 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('Are you sure you want to delete this contact? This cannot be undone.')) {
                  await import('../services/contacts').then(mod => mod.deleteContact(id));
                  navigate('/contacts');
                }
              }}
              style={{ ...buttonOutlineStyle, background: '#c0392b', color: '#fff', minWidth: 90 }}
            >
              Delete
            </button>
            <button
              type="submit"
              style={{ ...buttonOutlineStyle, background: RBA_GREEN, color: '#fff', minWidth: 120 }}
            >
              Save Changes
            </button>
          </div>
          {status && <div style={{ color: RBA_GREEN, marginTop: 12 }}>{status}</div>}
        </form>
      </div>
    </div>
  );
}
