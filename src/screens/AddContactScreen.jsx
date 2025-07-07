import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import Logo from './assets/Logo.png';

export default function AddContactScreen() {  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobilePhone: '',
    homePhone: '',
    zip: '',
    appointmentDate: '',
    quoteAmount: '',
    numWindows: '',
    numDoors: '',
    allOwnersPresent: false,
    willPurchaseFuture: '',
    emailOptOut: false,
    phoneOptOut: false
  });
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setStatus('');
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      await addDoc(collection(db, 'contacts'), {
        ...form,
        userId: user?.uid || null,
        createdAt: new Date(),
        status: 'prospect',
        unsubscribed: form.emailOptOut,
        doNotCall: form.phoneOptOut
      });
      setStatus('Contact added!');
      setTimeout(() => navigate('/contacts'), 1000);
    } catch (e) {
      setStatus('Error adding contact.');
    }
  };
  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>      <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '32px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
          <img src={Logo} alt="DC Power Connector Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginRight: 16 }} />
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#222' }}>Add Contact</h2>
        </div>        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>First Name</label>
              <input name="firstName" value={form.firstName} onChange={handleChange} required style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Last Name</label>
              <input name="lastName" value={form.lastName} onChange={handleChange} required style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Email</label>
            <input name="email" value={form.email} onChange={handleChange} type="email" style={inputStyle} />
          </div>          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Mobile Phone</label>
              <input name="mobilePhone" value={form.mobilePhone} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Home Phone</label>
              <input name="homePhone" value={form.homePhone} onChange={handleChange} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Zip</label>
              <input name="zip" value={form.zip} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Appointment Date</label>
              <input name="appointmentDate" value={form.appointmentDate} onChange={handleChange} type="date" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Quote Amount</label>
              <input name="quoteAmount" value={form.quoteAmount} onChange={handleChange} placeholder="$0.00" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}># of Windows</label>
              <input name="numWindows" value={form.numWindows} onChange={handleChange} type="number" min="0" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}># of Doors</label>
              <input name="numDoors" value={form.numDoors} onChange={handleChange} type="number" min="0" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: 'block' }}>Will Purchase Future (1-5)</label>
              <input name="willPurchaseFuture" value={form.willPurchaseFuture} onChange={handleChange} type="number" min="1" max="5" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <input name="allOwnersPresent" type="checkbox" checked={form.allOwnersPresent} onChange={handleChange} style={{ marginRight: 8 }} />
              <label style={{ fontSize: 14, fontWeight: 600 }}>All Owners Present</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <input name="emailOptOut" type="checkbox" checked={form.emailOptOut} onChange={handleChange} style={{ marginRight: 8 }} />
              <label style={{ fontSize: 14, fontWeight: 600 }}>Email Opt Out</label>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <input name="phoneOptOut" type="checkbox" checked={form.phoneOptOut} onChange={handleChange} style={{ marginRight: 8 }} />
              <label style={{ fontSize: 14, fontWeight: 600 }}>Phone Opt Out</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => navigate('/contacts')} style={{ ...buttonOutlineStyle, background: '#f5f5f5', color: '#666' }}>Cancel</button>
            <button type="submit" style={{ ...buttonOutlineStyle, background: RBA_GREEN, color: '#fff' }}>Save</button>
          </div>
        </form>
        {status && <div style={{ color: status.includes('error') ? 'red' : RBA_GREEN, marginTop: 16, textAlign: 'center' }}>{status}</div>}
      </div>
    </div>
  );
}
