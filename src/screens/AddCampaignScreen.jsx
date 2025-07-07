import React, { useState, useEffect } from 'react';
import CampaignBuilder from '../components/CampaignBuilder';
import { useNavigate } from 'react-router-dom';
import { addCampaign } from '../services/campaigns';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle } from '../utils/sharedStyles';

export default function AddCampaignScreen() {
  const [isPublic, setIsPublic] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  const handleSave = async (data) => {
    await addCampaign(data);
    navigate('/campaigns');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: RBA_GREEN, width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
          <CampaignBuilder onSave={handleSave} onCancel={() => navigate('/campaigns')} />
        </div>
      </div>
    </div>
  );
}
