import React, { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { createCampaignScheduledEmails } from '../services/email';
import { cardStyle } from '../utils/sharedStyles';

// Modern drawer for assigning a contact to a campaign
export default function CampaignAssignDrawer({
  open,
  contactId,
  onSave,
  onClose,
  campaignId,
  assignedContacts,
  allowStepDelayEdit
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [customDelays, setCustomDelays] = useState({});
  const [templates, setTemplates] = useState([]);
  const [firebaseUser, setFirebaseUser] = useState(null);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSelectedCampaign(null);
      setStatus('');
      setCustomDelays({});
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    import('../services/campaigns').then(mod =>
      mod.getCampaignsSplit().then(({ privateCampaigns, publicCampaigns }) => {
        setCampaigns([...privateCampaigns, ...publicCampaigns]);
      })
    );
  }, [open]);

  useEffect(() => {
    if (!selectedCampaign) return;
    import('../services/email').then(mod =>
      mod.getTemplatesSplit().then(({ privateTemplates, publicTemplates }) => {
        setTemplates([...privateTemplates, ...publicTemplates]);
      })
    );
  }, [selectedCampaign]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) setStatus('You are not logged in.');
    });
    return () => unsubscribe();
  }, []);

  const handleDelayChange = (stepIdx, field, value) => {
    setCustomDelays(prev => ({
      ...prev,
      [stepIdx]: {
        ...prev[stepIdx],
        [field]: value
      }
    }));
  };

  const handleAssign = async () => {
    if (!selectedCampaign || !firebaseUser) return;
    setLoading(true);
    setStatus('Assigning...');
    try {
      let customDelaysArray = selectedCampaign.steps.map((_, idx) => customDelays[idx] || {});
      await onSave(selectedCampaign, contactId, undefined, allowStepDelayEdit ? customDelaysArray : undefined);
      setStatus('Assigned!');
      setLoading(false);
      onClose();
    } catch (e) {
      setStatus('Error: ' + (e.message || e));
      setLoading(false);
    }
  };

  // Get current date and time in YYYY-MM-DD and HH:MM format
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const currentDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 420,
      height: '100vh',
      background: '#fff',
      boxShadow: '-2px 0 12px #0002',
      zIndex: 2000,
      transition: 'transform 0.3s',
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      display: 'flex',
      flexDirection: 'column',
      ...cardStyle
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Assign to Campaign</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>&times;</button>
      </div>
      {status && <div style={{ color: status.startsWith('Error') ? 'red' : '#5BA150', marginBottom: 12 }}>{status}</div>}
      {!selectedCampaign ? (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Select Campaign</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {campaigns.map(campaign => (
              <li key={campaign.id} style={{ marginBottom: 8 }}>
                <button onClick={() => setSelectedCampaign(campaign)} style={{ width: '100%', padding: 12, borderRadius: 6, border: '1px solid #eee', background: '#f6f6f6', fontWeight: 600 }}>
                  <b>{campaign.name}</b><br />
                  <span style={{ fontSize: 13, color: '#888' }}>{campaign.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}><b>Campaign:</b> {selectedCampaign.name}</div>
          {allowStepDelayEdit && selectedCampaign.steps && (
            <div style={{ marginBottom: 16 }}>
              <b>Edit Step Delays:</b>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {selectedCampaign.steps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: 8 }}>
                    Step {idx + 1}: {step.subject || '(no subject)'}<br />
                    <input
                      type="number"
                      min={0}
                      value={customDelays[idx]?.value || step.delay?.value || 1}
                      onChange={e => handleDelayChange(idx, 'value', Number(e.target.value))}
                      style={{ width: 60, marginRight: 8 }}
                    />
                    <select
                      value={customDelays[idx]?.unit || step.delay?.unit || 'days'}
                      onChange={e => handleDelayChange(idx, 'unit', e.target.value)}
                      style={{ marginRight: 8 }}
                    >
                      <option value="minutes">minutes</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                      <option value="custom">custom</option>
                    </select>
                    {(customDelays[idx]?.unit === 'custom') && (
                      <>
                        <input
                          type="date"
                          value={customDelays[idx]?.value || currentDate}
                          onChange={e => handleDelayChange(idx, 'value', e.target.value)}
                          style={{ marginRight: 8 }}
                        />
                        <input
                          type="time"
                          value={customDelays[idx]?.time || currentTime}
                          onChange={e => handleDelayChange(idx, 'time', e.target.value)}
                          style={{ marginRight: 8 }}
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setSelectedCampaign(null)} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Back</button>
            <button onClick={handleAssign} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }} disabled={loading}>Assign</button>
          </div>
        </>
      )}
    </div>
  );
}
