import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { sendOneOffEmail } from '../services/email';

export default function SendOneOffEmailModal({ open, onClose, contact, onSent }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendTime, setSendTime] = useState('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function fetchTemplates() {
      // Removed auth.currentUser usage, using user from context/localStorage instead
      let privateTemplates = [];
      let publicTemplates = [];
      try {
        // Fetch private templates (owned by user)
        const user = JSON.parse(localStorage.getItem('user'));
        if (user?.uid) {
          try {
            // Only fetch private (non-public) templates owned by the user
            const qPrivate = query(
              collection(db, 'emailTemplates'),
              where('userId', '==', user.uid),
              where('public', '==', false)
            );
            const snapPrivate = await getDocs(qPrivate);
            privateTemplates = snapPrivate.docs.map(d => ({
              id: d.id,
              ...d.data(),
              category: 'Private'
            }));
            console.log('[fetchTemplates] privateTemplates:', privateTemplates.map(t => ({ id: t.id, name: t.name, public: t.public, userId: t.userId, category: t.category })));
          } catch (err) {
            console.error('[fetchTemplates] ERROR in privateTemplates query:', err);
          }
        }
        // Fetch public templates
        try {
          const qPublic = query(collection(db, 'emailTemplates'), where('public', '==', true));
          const snapPublic = await getDocs(qPublic);
          publicTemplates = snapPublic.docs.map(d => ({ id: d.id, ...d.data(), category: 'Public' }));
          console.log('[fetchTemplates] publicTemplates:', publicTemplates.map(t => ({ id: t.id, name: t.name, public: t.public, userId: t.userId })));
        } catch (err) {
          console.error('[fetchTemplates] ERROR in publicTemplates query:', err);
        }
        // Remove duplicates (in case user's own template is also public)
        const privateIds = new Set(privateTemplates.map(t => t.id));
        publicTemplates = publicTemplates.filter(t => !privateIds.has(t.id));
        setTemplates([...privateTemplates, ...publicTemplates]);
      } catch (err) {
        setTemplates([]);
        console.error('fetchTemplates error', err);
      }
    }
    if (open) fetchTemplates();
  }, [open]);

  useEffect(() => {
    if (selectedTemplate) {
      const t = templates.find(t => t.id === selectedTemplate);
      if (t) {
        setSubject(t.subject || '');
        setBody(t.body || '');
      }
    }
  }, [selectedTemplate, templates]);

  const handleSend = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      console.log('Calling sendOneOffEmail', {
        to: contact.email,
        subject,
        body,
        contactId: contact.id,
        templateId: selectedTemplate || null,
        sendTime,
        scheduledDate
      });
      if (sendTime === 'schedule' && scheduledDate) {
        // Schedule for later: add to Firestore for backend to process
        // Ensure scheduledFor is a Firestore Timestamp, not JS Date
        const { Timestamp } = await import('firebase/firestore');
        const scheduledFor = Timestamp.fromDate(new Date(scheduledDate));
        await addDoc(collection(db, 'scheduledEmails'), {
          to: contact.email,
          subject,
          body,
          contactId: contact.id,
          templateId: selectedTemplate || null,
          userId: contact.userId || null,
          scheduledFor,
          createdAt: Timestamp.now(),
          status: 'pending',
        });
        setSuccess('Email scheduled!');
      } else {
        // Send now
        const result = await sendOneOffEmail({
          to: contact.email,
          subject,
          body,
          contactId: contact.id,
          templateId: selectedTemplate || null
        });
        console.log('sendOneOffEmail result', result);
        setSuccess('Email sent!');
      }
      if (onSent) onSent();
      // Reset state and close after short delay
      setTimeout(() => {
        setSelectedTemplate('');
        setSubject('');
        setBody('');
        setSendTime('now');
        setScheduledDate('');
        setSuccess('');
        setError('');
        onClose();
      }, 1200);
    } catch (e) {
      console.error('sendOneOffEmail error', e);
      setError(e.message || 'Failed to send email.');
    }
    setLoading(false);
  };

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 32, minWidth: 400, maxWidth: 500 }}>
        <h3>Send One Off Email</h3>
        <div style={{ marginBottom: 12 }}>
          <b>To:</b> {contact.email} ({contact.firstName} {contact.lastName})
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Email Template: </label>
          <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: '100%' }}>
            <option value="">-- Select Template --</option>
            {/* Private templates on top, then public, with category label */}
            {['Private', 'Public'].map(cat => [
              <optgroup key={cat} label={cat + ' Templates'}>
                {templates.filter(t => t.category === cat).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.subject} {t.category ? `(${t.category})` : ''}
                  </option>
                ))}
              </optgroup>
            ])}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Subject: </label>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Body: </label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Send: </label>
          <select value={sendTime} onChange={e => setSendTime(e.target.value)}>
            <option value="now">Now</option>
            <option value="schedule">Schedule for Later</option>
          </select>
          {sendTime === 'schedule' && (
            <input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} style={{ marginLeft: 8 }} />
          )}
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        {success && <div style={{ color: 'green', marginBottom: 8 }}>{success}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button onClick={handleSend} disabled={loading || !subject || !body}>Send</button>
        </div>
      </div>
    </div>
  );
}
