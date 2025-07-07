import React, { useState, useEffect } from 'react';
import { RBA_GREEN, RBA_DARK, RBA_LIGHT, RBA_ACCENT } from '../utils/rbaColors';
import '../components/Footer.jsx';
import { auth, db } from '../services/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import Logo from './assets/Logo.png';
import {
  getUserAutomationSettings,
  updateUserAutomationSettings,
  createAutomationTrigger,
  getActiveTriggers,
  deleteTrigger
} from '../services/userAutomationSettings';

const mockUser = {
  name: 'John Doe',
  email: 'john.doe@email.com',
  company: 'Acme Inc.',
};

const cardStyle = {
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

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: '#333',
  fontWeight: 500,
  marginBottom: 12,
  fontFamily: 'Arial, sans-serif',
};

const inputStyle = {
  width: '60%', // Less wide for better alignment
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid #ccc',
  marginBottom: 16,
  fontSize: 16,
  boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
};

const buttonOutlineStyle = {
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

const sectionTitleStyle = {
  color: RBA_ACCENT,
  fontWeight: 700,
  fontSize: 20,
  marginBottom: 12,
  fontFamily: 'Arial, sans-serif',
};

const SettingsScreen = () => {
  const [showProfileModal, setShowProfileModal] = useState(false);
  // Use Firebase Auth user if available
  const firebaseUser = JSON.parse(localStorage.getItem('user'));
  const [user, setUser] = useState({
    name: firebaseUser?.displayName || '',
    email: firebaseUser?.email || '',
    company: '',
  });

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    async function fetchProfile() {
      if (!firebaseUser) return;
      const ref = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) setUser({ ...user, ...snap.data() });
      else setUser({ ...user, email: firebaseUser.email });
    }
    fetchProfile();
    // eslint-disable-next-line
  }, [firebaseUser]);

  useEffect(() => {
    // TODO: Load user settings from backend
  }, []);

  const handleUpdateProfile = () => {
    setShowProfileModal(true);
  };

  const handleProfileSave = async () => {
    if (!firebaseUser) return;
    await setDoc(doc(db, 'users', firebaseUser.uid), user, { merge: true });
    setShowProfileModal(false);
    // Optionally, show a toast or status message
  };

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>        <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
          {/* Header with logo */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            <img src={Logo} alt="DC Power Connector Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginRight: 16 }} />
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#222' }}>Settings</h2>
          </div>
          {/* User Info Card */}
          <div style={{ marginBottom: 20 }}>
            <span style={{ fontWeight: 700, fontSize: 32 }}>{user.name}</span> <br />
            <span style={{ color: '#555', fontSize: 16 }}>{user.email}</span> <br />
            <span style={{ color: '#888', fontSize: 14 }}>{user.company}</span> <br />
          </div>
          <button style={{ ...buttonOutlineStyle, fontSize: 13, padding: '6px 12px' }} onClick={handleUpdateProfile}>Update Profile</button>
          {showProfileModal && (
            <div className="modal" style={{ background: '#fff', border: '1px solid #ccc', padding: 24, position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%, -30%)', zIndex: 1000, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.12)', fontFamily: 'Arial, sans-serif' }}>
              <h3 style={sectionTitleStyle}>Update Profile</h3>
              <label style={labelStyle}>Name:
                <input style={inputStyle} value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} />
              </label>
              <label style={labelStyle}>Email:
                <input style={inputStyle} value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} />
              </label>
              <label style={labelStyle}>Company:
                <input style={inputStyle} value={user.company} onChange={e => setUser({ ...user, company: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button style={{ ...buttonOutlineStyle, fontSize: 13, padding: '6px 12px' }} onClick={handleProfileSave}>Save</button>
                <button style={{ ...buttonOutlineStyle, background: '#eee', color: RBA_ACCENT, fontSize: 13, padding: '6px 12px' }} onClick={() => setShowProfileModal(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        {/* Signature Update Card */}
        <AutomationSettingsCard />
        <SignatureCard user={user} />
      </div>
    </div>
  );
};

// SignatureCard component
function SignatureCard({ user }) {
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function fetchSignature() {
      const firebaseUser = JSON.parse(localStorage.getItem('user'));
      if (!firebaseUser) return;
      const ref = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().signature) setSignature(snap.data().signature);
      setLoading(false);
    }
    fetchSignature();
  }, []);
  const handleSave = async () => {
    setSaving(true);
    const firebaseUser = JSON.parse(localStorage.getItem('user'));
    if (!firebaseUser) return;
    await setDoc(doc(db, 'users', firebaseUser.uid), { signature }, { merge: true });
    setSaving(false);
  };
  return (
    <div style={{ ...cardStyle, marginTop: 16, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 32px 2vw', boxSizing: 'border-box', position: 'relative' }}>
      <h3 style={sectionTitleStyle}>Email Signature</h3>
      <textarea
        style={{ ...inputStyle, width: '100%', minHeight: 80, fontFamily: 'Arial, sans-serif', resize: 'vertical', marginBottom: 16 }}
        value={loading ? 'Loading...' : signature}
        onChange={e => setSignature(e.target.value)}
        disabled={loading}
        placeholder="Enter your email signature here..."
      />
      <button onClick={handleSave} disabled={saving || loading} style={{ ...buttonOutlineStyle, fontSize: 13, padding: '6px 12px' }}>
        {saving ? 'Saving...' : 'Save Signature'}
      </button>
    </div>  );
}

// AutomationSettingsCard component
function AutomationSettingsCard() {
  const [automationSettings, setAutomationSettings] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [pendingTriggers, setPendingTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const buttonOutlineStyle = {
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '8px 16px',
    background: '#fff',
    color: '#333',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease'
  };

  useEffect(() => {
    if (expanded) {
      loadAllData();
    }
  }, [expanded]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      // Load automation settings
      const settings = await getUserAutomationSettings(user.uid);
      setAutomationSettings(settings);

      // Load campaigns
      const campaignsQuery = query(collection(db, 'campaigns'), where('userId', '==', user.uid));
      const campaignsSnapshot = await getDocs(campaignsQuery);
      setCampaigns(campaignsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Load pending triggers
      const triggers = await getActiveTriggers(user.uid);
      setPendingTriggers(triggers);

    } catch (error) {
      console.error('Error loading automation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      await updateUserAutomationSettings(user.uid, automationSettings);
    } catch (error) {
      console.error('Error saving automation settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSettingChange = (path, value) => {
    const newSettings = { ...automationSettings };
    const keys = path.split('.');
    let current = newSettings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setAutomationSettings(newSettings);
  };

  if (!automationSettings && !loading) return null;

  return (
    <div style={{ ...cardStyle, marginTop: 16, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 32px 2vw', boxSizing: 'border-box', position: 'relative' }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: expanded ? 24 : 0
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#222' }}>
          Automation Settings
        </h3>
        <span style={{ fontSize: 18, color: '#666' }}>
          {expanded ? '−' : '+'}
        </span>
      </div>

      {expanded && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
              Loading automation settings...
            </div>
          ) : (
            <div>
              {/* Heat Score Settings */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#333' }}>
                  Heat Score Automation
                </h4>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={automationSettings?.heatScore?.enabled || false}
                      onChange={(e) => handleSettingChange('heatScore.enabled', e.target.checked)}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Enable Heat Score Automation</span>
                  </label>
                </div>

                {automationSettings?.heatScore?.enabled && (
                  <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Hot Threshold (≥)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={automationSettings?.heatScore?.hotThreshold || 75}
                          onChange={(e) => handleSettingChange('heatScore.hotThreshold', Number(e.target.value))}
                          style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Cold Threshold (≤)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={automationSettings?.heatScore?.coldThreshold || 25}
                          onChange={(e) => handleSettingChange('heatScore.coldThreshold', Number(e.target.value))}
                          style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                        Action for Hot Contacts
                      </label>
                      <select
                        value={automationSettings?.heatScore?.action || 'notify'}
                        onChange={(e) => handleSettingChange('heatScore.action', e.target.value)}
                        style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                      >
                        <option value="notify">Notify Only</option>
                        <option value="tag">Add Tag</option>
                        <option value="assign_campaign">Assign to Campaign</option>
                        <option value="create_task">Create Task</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Engagement Settings */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#333' }}>
                  Engagement Automation
                </h4>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={automationSettings?.engagement?.enabled || false}
                      onChange={(e) => handleSettingChange('engagement.enabled', e.target.checked)}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Enable Engagement Automation</span>
                  </label>
                </div>

                {automationSettings?.engagement?.enabled && (
                  <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          High Engagement Threshold
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={automationSettings?.engagement?.highEngagementThreshold || 3}
                          onChange={(e) => handleSettingChange('engagement.highEngagementThreshold', Number(e.target.value))}
                          style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                        />
                        <small style={{ color: '#666', fontSize: 11 }}>Email opens in last 7 days</small>
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Days Without Engagement
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={automationSettings?.engagement?.dormantDays || 30}
                          onChange={(e) => handleSettingChange('engagement.dormantDays', Number(e.target.value))}
                          style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                        />
                        <small style={{ color: '#666', fontSize: 11 }}>Days to consider dormant</small>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pending Automation Actions */}
              {pendingTriggers.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#333' }}>
                    Pending Automation Actions ({pendingTriggers.length})
                  </h4>
                  <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8 }}>
                    {pendingTriggers.slice(0, 5).map((trigger, index) => (
                      <div key={trigger.id} style={{ 
                        padding: 12, 
                        background: '#fff', 
                        borderRadius: 6, 
                        marginBottom: index < Math.min(4, pendingTriggers.length - 1) ? 8 : 0,
                        border: '1px solid #e9ecef'
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                          {trigger.type.replace(/_/g, ' ').toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {trigger.action} • {new Date(trigger.triggeredAt?.toDate()).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                    {pendingTriggers.length > 5 && (
                      <div style={{ textAlign: 'center', color: '#666', fontSize: 12, marginTop: 8 }}>
                        +{pendingTriggers.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving}
                  style={{
                    ...buttonOutlineStyle,
                    background: RBA_GREEN,
                    color: '#fff',
                    border: 'none'
                  }}
                >
                  {saving ? 'Saving...' : 'Save Automation Settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SettingsScreen;
