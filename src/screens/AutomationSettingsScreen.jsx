import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { RBA_GREEN } from '../utils/rbaColors';
import { cardStyle } from '../utils/sharedStyles';
import Navbar from '../components/Navbar';

export default function AutomationSettingsScreen() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    automationEnabled: false,
    heatScoreAutomation: {
      enabled: false,
      hotThreshold: 80,
      warmThreshold: 40,
      action: 'create_task' // create_task, send_email, add_to_campaign
    },
    emailEngagementAutomation: {
      enabled: false,
      multipleOpensThreshold: 3,
      action: 'create_task'
    },
    leadScoringAutomation: {
      enabled: false,
      scoreThreshold: 75,
      action: 'notify_user'
    }
  });
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [pendingTriggers, setPendingTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    loadSettings();
    loadEmailTemplates();
    loadCampaigns();
    loadPendingTriggers();
  }, []);

  const loadSettings = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      const userSettingsRef = doc(db, 'userSettings', user.uid);
      const settingsSnap = await getDoc(userSettingsRef);
      
      if (settingsSnap.exists()) {
        const userData = settingsSnap.data();
        setSettings({
          automationEnabled: userData.automationEnabled || false,
          heatScoreAutomation: {
            enabled: userData.heatScoreAutomation?.enabled || false,
            hotThreshold: userData.heatScoreAutomation?.hotThreshold || 80,
            warmThreshold: userData.heatScoreAutomation?.warmThreshold || 40,
            action: userData.heatScoreAutomation?.action || 'create_task'
          },
          emailEngagementAutomation: {
            enabled: userData.emailEngagementAutomation?.enabled || false,
            multipleOpensThreshold: userData.emailEngagementAutomation?.multipleOpensThreshold || 3,
            action: userData.emailEngagementAutomation?.action || 'create_task'
          },
          leadScoringAutomation: {
            enabled: userData.leadScoringAutomation?.enabled || false,
            scoreThreshold: userData.leadScoringAutomation?.scoreThreshold || 75,
            action: userData.leadScoringAutomation?.action || 'notify_user'
          }
        });
      }
    } catch (error) {
      console.error('Error loading automation settings:', error);
      setMessage('Error loading settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadEmailTemplates = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      const templatesQuery = query(
        collection(db, 'emailTemplates'),
        where('userId', '==', user.uid)
      );
      const templatesSnap = await getDocs(templatesQuery);
      setEmailTemplates(templatesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error loading email templates:', error);
    }
  };

  const loadCampaigns = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      const campaignsQuery = query(
        collection(db, 'campaigns'),
        where('userId', '==', user.uid)
      );
      const campaignsSnap = await getDocs(campaignsQuery);
      setCampaigns(campaignsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const loadPendingTriggers = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      const triggersQuery = query(
        collection(db, 'automationTriggers'),
        where('userId', '==', user.uid),
        where('status', '==', 'pending'),
        orderBy('triggeredAt', 'desc')
      );
      const triggersSnap = await getDocs(triggersQuery);
      setPendingTriggers(triggersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error loading pending triggers:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage('');
    
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) {
        setMessage('No user authenticated');
        return;
      }

      const userSettingsRef = doc(db, 'userSettings', user.uid);
      await setDoc(userSettingsRef, settings, { merge: true });
      
      setMessage('Automation settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving automation settings:', error);
      setMessage('Error saving settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (path, value) => {
    const newSettings = { ...settings };
    const keys = path.split('.');
    let current = newSettings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    
    setSettings(newSettings);
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp?.seconds) return 'Unknown';
    return new Date(timestamp.seconds * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif' }}>
        <Navbar />
        <div style={{ paddingTop: 112, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 112px)' }}>
          <div style={{ color: '#fff', fontSize: '18px' }}>Loading automation settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif' }}>
      <Navbar />
      <div style={{ paddingTop: 112, padding: '112px 16px 32px 16px' }}>
        <div style={{ ...cardStyle, maxWidth: 800, margin: '0 auto', padding: '32px' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#333', marginBottom: '8px' }}>
              ⚙️ Automation Settings
            </h1>
            <p style={{ color: '#666', fontSize: '16px', margin: 0 }}>
              Configure automated actions based on contact engagement and behavior
            </p>
          </div>

          {message && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: message.includes('Error') ? '#f8d7da' : '#d4edda',
              color: message.includes('Error') ? '#721c24' : '#155724',
              borderRadius: '4px',
              marginBottom: '24px'
            }}>
              {message}
            </div>
          )}

          {/* Master Toggle */}
          <div style={{
            background: '#f8f9fa',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
            border: '2px solid ' + (settings.automationEnabled ? RBA_GREEN : '#dee2e6')
          }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.automationEnabled}
                onChange={(e) => updateSetting('automationEnabled', e.target.checked)}
                style={{ marginRight: '12px', width: '18px', height: '18px' }}
              />
              <div>
                <span style={{ fontSize: '18px', fontWeight: '600', color: '#333' }}>
                  Enable Automation
                </span>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                  Master switch to enable/disable all automated actions
                </p>
              </div>
            </label>
          </div>

          {/* Heat Score Automation */}
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid #dee2e6',
            opacity: settings.automationEnabled ? 1 : 0.6
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
              🔥 Heat Score Automation
            </h3>
            
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.heatScoreAutomation.enabled}
                onChange={(e) => updateSetting('heatScoreAutomation.enabled', e.target.checked)}
                disabled={!settings.automationEnabled}
                style={{ marginRight: '8px' }}
              />
              <span>Enable heat score automation</span>
            </label>

            <div style={{ marginLeft: '24px', opacity: settings.heatScoreAutomation.enabled ? 1 : 0.5 }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Hot Contact Threshold:
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.heatScoreAutomation.hotThreshold}
                  onChange={(e) => updateSetting('heatScoreAutomation.hotThreshold', parseInt(e.target.value))}
                  disabled={!settings.heatScoreAutomation.enabled}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', width: '80px' }}
                />
                <span style={{ marginLeft: '8px', color: '#666' }}>points</span>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Action for hot contacts:
                </label>
                <select
                  value={settings.heatScoreAutomation.action}
                  onChange={(e) => updateSetting('heatScoreAutomation.action', e.target.value)}
                  disabled={!settings.heatScoreAutomation.enabled}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', width: '200px' }}
                >
                  <option value="create_task">Create Follow-up Task</option>
                  <option value="send_email">Send Email Template</option>
                  <option value="add_to_campaign">Add to Campaign</option>
                  <option value="notify_user">Notify User Only</option>
                </select>
              </div>

              {settings.heatScoreAutomation.action === 'send_email' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                    Email Template:
                  </label>
                  <select
                    value={settings.heatScoreAutomation.templateId || ''}
                    onChange={(e) => updateSetting('heatScoreAutomation.templateId', e.target.value)}
                    disabled={!settings.heatScoreAutomation.enabled}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', width: '300px' }}
                  >
                    <option value="">Select template...</option>
                    {emailTemplates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name || template.subject}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {settings.heatScoreAutomation.action === 'add_to_campaign' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                    Campaign:
                  </label>
                  <select
                    value={settings.heatScoreAutomation.campaignId || ''}
                    onChange={(e) => updateSetting('heatScoreAutomation.campaignId', e.target.value)}
                    disabled={!settings.heatScoreAutomation.enabled}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', width: '300px' }}
                  >
                    <option value="">Select campaign...</option>
                    {campaigns.map(campaign => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Email Engagement Automation */}
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid #dee2e6',
            opacity: settings.automationEnabled ? 1 : 0.6
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
              📧 Email Engagement Automation
            </h3>
            
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.emailEngagementAutomation.enabled}
                onChange={(e) => updateSetting('emailEngagementAutomation.enabled', e.target.checked)}
                disabled={!settings.automationEnabled}
                style={{ marginRight: '8px' }}
              />
              <span>Enable email engagement automation</span>
            </label>

            <div style={{ marginLeft: '24px', opacity: settings.emailEngagementAutomation.enabled ? 1 : 0.5 }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Multiple Opens Threshold:
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={settings.emailEngagementAutomation.multipleOpensThreshold}
                  onChange={(e) => updateSetting('emailEngagementAutomation.multipleOpensThreshold', parseInt(e.target.value))}
                  disabled={!settings.emailEngagementAutomation.enabled}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', width: '80px' }}
                />
                <span style={{ marginLeft: '8px', color: '#666' }}>opens trigger action</span>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Action:
                </label>
                <select
                  value={settings.emailEngagementAutomation.action}
                  onChange={(e) => updateSetting('emailEngagementAutomation.action', e.target.value)}
                  disabled={!settings.emailEngagementAutomation.enabled}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', width: '200px' }}
                >
                  <option value="create_task">Create Follow-up Task</option>
                  <option value="send_email">Send Email Template</option>
                  <option value="notify_user">Notify User Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pending Automation Triggers */}
          {pendingTriggers.length > 0 && (
            <div style={{
              background: '#fff3cd',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px',
              border: '1px solid #ffeaa7'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>
                ⏳ Pending Automation Triggers ({pendingTriggers.length})
              </h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {pendingTriggers.map(trigger => (
                  <div key={trigger.id} style={{
                    background: '#fff',
                    borderRadius: '4px',
                    padding: '12px',
                    marginBottom: '8px',
                    border: '1px solid #dee2e6'
                  }}>
                    <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                      {trigger.type} - {trigger.action}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      Contact ID: {trigger.contactId}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      Triggered: {formatDateTime(trigger.triggeredAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Button */}
          <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <button
              onClick={saveSettings}
              disabled={saving}
              style={{
                background: RBA_GREEN,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
