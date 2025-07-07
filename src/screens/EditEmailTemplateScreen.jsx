import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import Logo from './assets/Logo.png';

const mergeFields = [
  { label: 'First Name', value: '{{firstName}}' },
  { label: 'Last Name', value: '{{lastName}}' },
  { label: 'Quote Amount', value: '{{quoteAmount}}' },
  { label: 'Rep Name', value: '{{repName}}' },
  { label: 'Appointment Date', value: '{{appointmentDate}}' },
  { label: 'Last Contact Date', value: '{{lastContacted}}' },
  { label: 'Signature', value: '{{signature}}' },
];

export default function EditEmailTemplateScreen() {
  const { id } = useParams();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [isPublic, setIsPublic] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    async function fetchTemplate() {
      const ref = doc(db, 'emailTemplates', id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setName(data.name || '');
        setSubject(data.subject || '');
        setBody(data.body || '');
        setIsPublic(!!data.public);
        // Check admin status from localStorage (or your auth logic)
        const user = JSON.parse(localStorage.getItem('user'));
        setIsAdmin(user?.isAdmin || false);
      }
      setLoading(false);
    }
    fetchTemplate();
  }, [id]);

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
    await updateDoc(doc(db, 'emailTemplates', id), { name, subject, body, public: isPublic });
    navigate('/email-templates');
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this template? This cannot be undone.')) {
      await updateDoc(doc(db, 'emailTemplates', id), { deleted: true }); // Optional: soft delete
      await import('firebase/firestore').then(({ deleteDoc, doc: docRef }) =>
        deleteDoc(docRef(db, 'emailTemplates', id))
      );
      navigate('/email-templates');
    }
  };

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  // If public and not admin, show read-only view
  if (isPublic && !isAdmin) {
    return (
      <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
        <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 600, position: 'relative', minWidth: 320, paddingTop: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 0 }}>
            <img src={Logo} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 24, marginLeft: 8, marginBottom: 16 }} />
          </div>
          <div style={{ marginLeft: 0, marginTop: 0 }}>
            <div style={{ marginBottom: 16, marginTop: 8 }}>
              <label style={{ fontWeight: 600 }}>Template Name</label><br />
              <div style={{ ...inputStyle, width: '100%', background: '#f6f6f6', color: '#222', border: 'none', padding: '8px 12px' }}>{name}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600 }}>Subject</label><br />
              <div style={{ ...inputStyle, width: '100%', background: '#f6f6f6', color: '#222', border: 'none', padding: '8px 12px' }}>{subject}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600 }}>Body</label><br />
              <div style={{ ...inputStyle, width: '100%', background: '#f6f6f6', color: '#222', border: 'none', padding: '8px 12px', whiteSpace: 'pre-wrap' }}>{body}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ color: '#888', fontSize: 14 }}>This is a public template. You cannot edit or copy its content.</span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
              <button type="button" onClick={() => navigate('/email-templates')} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 600 }}>Back</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 600, position: 'relative', minWidth: 320, paddingTop: 0 }}>
        {/* Bigger logo in top left, with space below */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 0 }}>
          <img src={Logo} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginTop: 24, marginLeft: 8, marginBottom: 16 }} />
        </div>
        <form onSubmit={handleSubmit} style={{ marginLeft: 0, marginTop: 0 }}>
          {/* Move Template Name below logo, add spacing */}
          <div style={{ marginBottom: 16, marginTop: 8 }}>
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
              style={{ ...inputStyle, width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
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
                onClick={() => insertMergeField('<a href=\"https://rbaconnector.com/unsubscribe?email={{email}}\">Unsubscribe</a>')}
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
            {/* Only show public checkbox if not public or user is admin */}
            {(!isPublic || isAdmin) && (
              <label>
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} style={{ marginRight: 8 }} />
                Make this template public (shared with all users)
              </label>
            )}
            {/* If public and not admin, show info */}
            {isPublic && !isAdmin && (
              <span style={{ color: '#888', fontSize: 14 }}>This is a public template and cannot be edited or deleted.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            {/* Hide Save/Delete if public and not admin */}
            {(!isPublic || isAdmin) && (
              <>
                <button type="submit" style={{ background: RBA_GREEN, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 600 }}>Save Changes</button>
                <button type="button" onClick={handleDelete} style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 600 }}>Delete</button>
              </>
            )}
            <button type="button" onClick={() => navigate('/email-templates')} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 600 }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
