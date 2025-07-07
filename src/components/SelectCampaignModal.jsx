import React, { useEffect, useState } from 'react';
import { getCampaignsSplit } from '../services/campaigns';

export default function SelectCampaignModal({ open, onClose, onSelect }) {
  const [privateCampaigns, setPrivateCampaigns] = useState([]);
  const [publicCampaigns, setPublicCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getCampaignsSplit()
      .then(({ privateCampaigns, publicCampaigns }) => {
        setPrivateCampaigns(privateCampaigns);
        setPublicCampaigns(publicCampaigns);
        setLoading(false);
      })
      .catch(err => {
        setError('Error loading campaigns: ' + (err.message || err.code || err));
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 2px 8px #0002', maxWidth: 400 }}>
        <h3>Select Campaign</h3>
        {loading ? <div>Loading...</div> : error ? <div style={{ color: 'red' }}>{error}</div> : (
          <>
            {privateCampaigns.length > 0 && <div style={{ fontWeight: 600, marginTop: 8 }}>Your Campaigns</div>}
            {privateCampaigns.map(c => (
              <button key={c.id} style={{ width: '100%', margin: '6px 0', padding: 10, borderRadius: 6, border: '1px solid #eee', background: '#f6f6f6', fontWeight: 600 }} onClick={() => onSelect(c)}>{c.name}</button>
            ))}
            {publicCampaigns.length > 0 && <div style={{ fontWeight: 600, marginTop: 16 }}>Public Campaigns</div>}
            {publicCampaigns.map(c => (
              <button key={c.id} style={{ width: '100%', margin: '6px 0', padding: 10, borderRadius: 6, border: '1px solid #eee', background: '#f6f6f6', fontWeight: 600 }} onClick={() => onSelect(c)}>{c.name}</button>
            ))}
            {(privateCampaigns.length === 0 && publicCampaigns.length === 0) && <div style={{ color: '#888', marginTop: 12 }}>No campaigns found.</div>}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
