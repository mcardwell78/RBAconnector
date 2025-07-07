import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';

const mergeFields = [
  { label: 'First Name', value: '{{firstName}}' },
  { label: 'Last Name', value: '{{lastName}}' },
  { label: 'Quote Amount', value: '{{quoteAmount}}' },
  { label: 'Rep Name', value: '{{repName}}' },
  { label: 'Appointment Date', value: '{{appointmentDate}}' },
  { label: 'Last Contact Date', value: '{{lastContacted}}' },
  { label: 'Signature', value: '{{signature}}' },
];

export default function AddEmailTemplateScreen() {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cursor, setCursor] = useState(0);
  const [isPublic, setIsPublic] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  React.useEffect(() => {
    // Check admin status from localStorage (or your auth logic)
    const user = JSON.parse(localStorage.getItem('user'));
    setIsAdmin(user?.isAdmin || false);
  }, []);

  const insertMergeField = (field) => {
    const before = body.slice(0, cursor);
    const after = body.slice(cursor);
    setBody(before + field + after);
    setCursor(cursor + field.length);
  };

  const handleBodyChange = (e) => {
    setBody(e.target.value);
    setCursor(e.target.selectionStart);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !subject || !body) return;
    const user = JSON.parse(localStorage.getItem('user'));
    await addDoc(collection(db, 'emailTemplates'), {
      name,
      subject,
      body,
      userId: user?.uid || null,
      public: isPublic,
      createdAt: serverTimestamp(),
    });
    navigate('/email-templates');
  };

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 600, padding: 32, position: 'relative' }}>
        <img src={require('./assets/Logo.png')} alt="DC Power Connector" style={{ position: 'absolute', top: 24, left: 24, height: 60 }} />
        <h2 style={{ marginBottom: 24, marginLeft: 80 }}>Add Email Template</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>Template Name</label><br />
            <input value={name} onChange={e => setName(e.target.value)} required style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Subject</label><br />
            <input value={subject} onChange={e => setSubject(e.target.value)} required style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Body</label><br />
            <textarea
              value={body}
              onChange={handleBodyChange}
              onClick={e => setCursor(e.target.selectionStart)}
              onKeyUp={e => setCursor(e.target.selectionStart)}
              rows={10}
              style={{ ...inputStyle, width: '100%', fontFamily: 'inherit' }}
              placeholder="Type your email here. Use mail merge fields for personalization."
              required
            />
            <div style={{ marginTop: 8 }}>
              {mergeFields.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => insertMergeField(f.value)}
                  style={{ background: RBA_GREEN, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', marginRight: 8, marginTop: 4 }}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => insertMergeField('<a href="https://rbaconnector.com/unsubscribe?email={{email}}">Unsubscribe</a>')}
                style={{ background: '#BBA100', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', marginRight: 8, marginTop: 4 }}
              >
                Unsubscribe Link
              </button>
              <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>
                Click a field to insert at cursor
              </span>
              <div style={{ color: '#BBA100', fontSize: 13, marginTop: 8 }}>
                <b>Note:</b> Use <code>{'{{unsubscribeLink}}'}</code> in your email body. It will be replaced with a working unsubscribe link like <code>https://rbaconnector.com/unsubscribe?email=recipient@email.com</code> in sent emails. The <code>?email=</code> parameter is required for the unsubscribe flow to work.
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            {/* Only show public checkbox if user is admin */}
            {isAdmin && (
              <label>
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} style={{ marginRight: 8 }} />
                Make this template public (shared with all users)
              </label>
            )}
            {!isAdmin && (
              <span style={{ color: '#888', fontSize: 14 }}>Only admins can create public templates.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, width: '100%' }}>
            <button type="button" onClick={() => navigate('/email-templates')} style={{ ...buttonOutlineStyle, width: '50%', padding: '8px 0', fontWeight: 600 }}>Cancel</button>
            <button type="submit" style={{ ...buttonOutlineStyle, width: '50%', padding: '8px 0', fontWeight: 600, background: RBA_GREEN, color: '#fff' }}>Save Template</button>
          </div>
        </form>
      </div>
    </div>
  );
}
