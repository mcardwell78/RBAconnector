import React, { useState, useEffect } from 'react';
import { initializeHeatScoresForUser } from '../services/contactHeatScore';
import { RBA_GREEN } from '../utils/rbaColors';

export default function ImplementationStatusCard() {
  const [status, setStatus] = useState({
    emailTracking: 'implemented',
    heatScoring: 'implemented', 
    automation: 'implemented',
    analytics: 'implemented'
  });
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMessage, setInitMessage] = useState('');

  const handleInitializeHeatScores = async () => {
    setIsInitializing(true);
    setInitMessage('');
    
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) {
        setInitMessage('No user authenticated');
        return;
      }

      const result = await initializeHeatScoresForUser(user.uid);
      setInitMessage(`✅ Initialized heat scores for ${result.initialized} contacts`);
    } catch (error) {
      setInitMessage(`❌ Error: ${error.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const features = [
    {
      name: 'Email Tracking',
      status: status.emailTracking,
      description: 'Track email opens, clicks, and engagement metrics automatically',
      icon: '📧'
    },
    {
      name: 'Contact Heat Scoring',
      status: status.heatScoring,
      description: 'Automatically score contacts based on engagement and behavior',
      icon: '🔥'
    },
    {
      name: 'Marketing Automation',
      status: status.automation,
      description: 'Trigger automated actions based on contact activity and scores',
      icon: '⚙️'
    },
    {
      name: 'Advanced Analytics',
      status: status.analytics,
      description: 'Comprehensive engagement analytics and heat mapping dashboards',
      icon: '📊'
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'implemented': return '#28a745';
      case 'partial': return '#ffc107';
      case 'pending': return '#6c757d';
      default: return '#dc3545';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'implemented': return '✅ Implemented';
      case 'partial': return '⚠️ Partial';
      case 'pending': return '⏳ Pending';
      default: return '❌ Not Started';
    }
  };

  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginBottom: '24px',
      border: '2px solid ' + RBA_GREEN
    }}>
      {/* Header */}
      <div style={{ 
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid #eee'
      }}>
        <h3 style={{ 
          margin: 0, 
          fontSize: '20px', 
          fontWeight: '600', 
          color: '#333',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🚀 Implementation Status
        </h3>
        <p style={{ 
          margin: '8px 0 0 0', 
          color: '#666', 
          fontSize: '14px' 
        }}>
          New advanced features have been implemented and are ready to use!
        </p>
      </div>

      {/* Features List */}
      <div style={{ marginBottom: '20px' }}>
        {features.map((feature, index) => (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            marginBottom: '8px',
            borderRadius: '6px',
            background: '#f8f9fa',
            border: '1px solid #e9ecef'
          }}>
            <span style={{ fontSize: '24px', marginRight: '12px' }}>
              {feature.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '500', color: '#333', marginBottom: '2px' }}>
                {feature.name}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {feature.description}
              </div>
            </div>
            <div style={{ 
              color: getStatusColor(feature.status),
              fontWeight: '600',
              fontSize: '14px'
            }}>
              {getStatusText(feature.status)}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{
        background: '#f0f8f0',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px'
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '16px', 
          fontWeight: '600', 
          color: '#333' 
        }}>
          🎯 Quick Start
        </h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button 
            onClick={handleInitializeHeatScores}
            disabled={isInitializing}
            style={{
              background: RBA_GREEN,
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: isInitializing ? 'not-allowed' : 'pointer',
              opacity: isInitializing ? 0.7 : 1
            }}
          >
            {isInitializing ? 'Initializing...' : '🔥 Initialize Heat Scores'}
          </button>
          <button 
            onClick={() => window.location.href = '/automation-settings'}
            style={{
              background: '#17a2b8',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            ⚙️ Setup Automation
          </button>
          <button 
            onClick={() => window.location.href = '/email-templates'}
            style={{
              background: '#fd7e14',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            📧 Email Templates
          </button>
        </div>
        {initMessage && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            borderRadius: '4px',
            background: initMessage.includes('❌') ? '#f8d7da' : '#d4edda',
            color: initMessage.includes('❌') ? '#721c24' : '#155724',
            fontSize: '14px'
          }}>
            {initMessage}
          </div>
        )}
      </div>

      {/* What's New */}
      <div style={{
        background: '#e7f3ff',
        borderRadius: '6px',
        padding: '16px'
      }}>
        <h4 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '16px', 
          fontWeight: '600', 
          color: '#333' 
        }}>
          ✨ What's New
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#333' }}>
          <li style={{ marginBottom: '4px' }}>
            <strong>Email Tracking:</strong> All emails now include tracking pixels and wrapped links
          </li>
          <li style={{ marginBottom: '4px' }}>
            <strong>Heat Scoring:</strong> Contacts are automatically scored based on engagement
          </li>
          <li style={{ marginBottom: '4px' }}>
            <strong>Automation Rules:</strong> Set up triggers for hot contacts and high engagement
          </li>
          <li style={{ marginBottom: '4px' }}>
            <strong>Analytics Dashboard:</strong> New engagement metrics and heat mapping visuals
          </li>
        </ul>
      </div>
    </div>
  );
}
