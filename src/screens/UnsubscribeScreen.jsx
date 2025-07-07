import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../services/firebase';

export default function UnsubscribeScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [searchParams] = useSearchParams();
  const functions = getFunctions(app);
  const publicUnsubscribe = httpsCallable(functions, 'publicUnsubscribe');

  useEffect(() => {
    // Pre-fill email from query param if present
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  const handleUnsubscribe = async () => {
    setStatus('');
    setLoading(true);
    try {
      const result = await publicUnsubscribe({ email });
      if (result.data && result.data.success) {
        setStatus('You have been unsubscribed from all future emails.');
        setConfirmed(true);
      } else {
        setStatus(result.data && result.data.message ? result.data.message : 'No contact found with that email.');
      }
    } catch (e) {
      setStatus('An error occurred. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 600, padding: 32 }}>
        {confirmed ? (
          <>
            <h2 style={{ color: RBA_GREEN, marginBottom: 16 }}>Unsubscribed</h2>
            <p style={{ color: '#333', fontSize: 18 }}>You have been unsubscribed from all future emails.</p>
          </>
        ) : (
          <>
            <p>Enter your email address to unsubscribe from all future communications.</p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your email address"
              style={{ ...inputStyle, marginBottom: 16 }}
              disabled={loading}
              autoFocus
            />
            <button
              onClick={handleUnsubscribe}
              style={{ ...buttonOutlineStyle, width: '100%' }}
              disabled={loading || !email}
            >
              Unsubscribe
            </button>
            {status && <div style={{ marginTop: 16, color: status.includes('error') ? 'red' : RBA_GREEN }}>{status}</div>}
          </>
        )}
      </div>
    </div>
  );
}
