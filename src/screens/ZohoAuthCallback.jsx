import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeCodeForTokens } from '../services/zohoAuth';
import { cardStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';

export default function ZohoAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing Zoho authentication...');

  useEffect(() => {
    async function handleCallback() {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state'); // Contains user email
        const error = searchParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(`Authentication failed: ${error}`);
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received from Zoho');
          return;
        }

        if (!state) {
          setStatus('error');
          setMessage('No user information received from Zoho');
          return;
        }

        setMessage('Exchanging authorization code for access tokens...');
        
        // Exchange code for tokens
        await exchangeCodeForTokens(code, state);
        
        setStatus('success');
        setMessage('Zoho Mail successfully connected! Redirecting...');
        
        // Redirect to settings or dashboard after 2 seconds
        setTimeout(() => {
          navigate('/settings?tab=email');
        }, 2000);
        
      } catch (error) {
        console.error('Zoho OAuth callback error:', error);
        setStatus('error');
        setMessage(`Authentication failed: ${error.message}`);
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  const getStatusColor = () => {
    switch (status) {
      case 'success': return '#5BA150';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div style={{ 
      background: RBA_GREEN, 
      minHeight: '100vh', 
      width: '100vw', 
      fontFamily: 'Arial, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{ 
        ...cardStyle, 
        width: '100%', 
        maxWidth: 500, 
        padding: 40,
        textAlign: 'center'
      }}>
        <div style={{ 
          fontSize: 48, 
          marginBottom: 20 
        }}>
          {getStatusIcon()}
        </div>
        
        <h2 style={{ 
          color: getStatusColor(),
          marginBottom: 20,
          fontSize: 24
        }}>
          Zoho Mail Authentication
        </h2>
        
        <p style={{ 
          fontSize: 16,
          lineHeight: 1.5,
          color: '#666',
          marginBottom: 30
        }}>
          {message}
        </p>
        
        {status === 'processing' && (
          <div style={{
            display: 'inline-block',
            width: 20,
            height: 20,
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #5BA150',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        )}
        
        {status === 'error' && (
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => navigate('/settings?tab=email')}
              style={{
                background: '#5BA150',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 16,
                cursor: 'pointer',
                marginRight: 10
              }}
            >
              Back to Settings
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 16,
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        )}
        
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
