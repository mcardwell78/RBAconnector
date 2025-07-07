import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { RBA_GREEN } from '../utils/rbaColors';

export default function ContactEngagementCard({ contactId }) {
  const [engagementData, setEngagementData] = useState({
    heatScore: null,
    category: null,
    emailEngagements: [],
    totalOpens: 0,
    totalClicks: 0,
    lastActivity: null,
    lastActivityType: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contactId) {
      fetchEngagementData();
    }
  }, [contactId]);

  const fetchEngagementData = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      // Get heat score
      const heatScoreQuery = query(
        collection(db, 'contactHeatScores'),
        where('contactId', '==', contactId),
        where('userId', '==', user.uid)
      );
      const heatScoreSnap = await getDocs(heatScoreQuery);
      let heatScore = null;
      if (!heatScoreSnap.empty) {
        heatScore = heatScoreSnap.docs[0].data();
      }

      // Get email engagements
      const engagementQuery = query(
        collection(db, 'emailEngagements'),
        where('contactId', '==', contactId),
        where('userId', '==', user.uid),
        orderBy('sentAt', 'desc')
      );
      const engagementSnap = await getDocs(engagementQuery);
      const emailEngagements = engagementSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Calculate totals
      const totalOpens = emailEngagements.reduce((sum, e) => sum + (e.opens || 0), 0);
      const totalClicks = emailEngagements.reduce((sum, e) => sum + (e.clicks || 0), 0);

      setEngagementData({
        heatScore: heatScore?.score || 0,
        category: heatScore?.category || 'unknown',
        emailEngagements: emailEngagements.slice(0, 5), // Show last 5
        totalOpens,
        totalClicks,
        lastActivity: heatScore?.lastActivity,
        lastActivityType: heatScore?.lastActivityType
      });
    } catch (error) {
      console.error('Error fetching engagement data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'hot': return '#dc3545';
      case 'warm': return '#fd7e14';
      case 'cold': return '#6c757d';
      default: return '#17a2b8';
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#dc3545'; // Red for hot
    if (score >= 40) return '#fd7e14'; // Orange for warm
    return '#6c757d'; // Gray for cold
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp?.seconds) return 'Never';
    return new Date(timestamp.seconds * 1000).toLocaleString();
  };

  const getActivityIcon = (activityType) => {
    switch (activityType) {
      case 'email_open': return '👁️';
      case 'email_click': return '🖱️';
      case 'form_submission': return '📝';
      case 'phone_call': return '📞';
      case 'meeting': return '🤝';
      default: return '📈';
    }
  };

  if (loading) {
    return (
      <div style={{
        color: '#666', 
        textAlign: 'center',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        Loading engagement data...
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <h3 style={{
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '16px',
        color: '#333',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        📊 Engagement & Heat Score
      </h3>

      {/* Heat Score Section */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        padding: '12px',
        background: '#f8f9fa',
        borderRadius: '6px'
      }}>
        <div>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Heat Score</div>
          <div style={{
            fontSize: '28px',
            fontWeight: 'bold',
            color: getScoreColor(engagementData.heatScore)
          }}>
            {engagementData.heatScore}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            color: '#fff',
            background: getCategoryColor(engagementData.category)
          }}>
            {engagementData.category === 'hot' && '🔥'} 
            {engagementData.category === 'warm' && '🌡️'} 
            {engagementData.category === 'cold' && '❄️'} 
            {engagementData.category === 'unknown' && '❓'} 
            {` ${engagementData.category}`}
          </div>
          {engagementData.lastActivity && (
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              {getActivityIcon(engagementData.lastActivityType)} {formatDateTime(engagementData.lastActivity)}
            </div>
          )}
        </div>
      </div>

      {/* Email Engagement Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ textAlign: 'center', padding: '8px', background: '#e3f2fd', borderRadius: '4px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
            {engagementData.emailEngagements.length}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Emails</div>
        </div>
        <div style={{ textAlign: 'center', padding: '8px', background: '#e8f5e8', borderRadius: '4px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2e7d32' }}>
            {engagementData.totalOpens}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Opens</div>
        </div>
        <div style={{ textAlign: 'center', padding: '8px', background: '#fff3e0', borderRadius: '4px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f57c00' }}>
            {engagementData.totalClicks}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Clicks</div>
        </div>
      </div>

      {/* Recent Email Engagements */}
      {engagementData.emailEngagements.length > 0 && (
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
            Recent Email Activity
          </h4>
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {engagementData.emailEngagements.map(engagement => (
              <div key={engagement.id} style={{
                padding: '8px 12px',
                border: '1px solid #eee',
                borderRadius: '4px',
                marginBottom: '6px',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: '500', marginBottom: '2px', color: '#333' }}>
                  {engagement.subject}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                  <span>
                    👁️ {engagement.opens || 0} opens • 🖱️ {engagement.clicks || 0} clicks
                  </span>
                  <span>
                    {formatDateTime(engagement.sentAt)}
                  </span>
                </div>
                {engagement.lastOpenedAt && (
                  <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                    Last opened: {formatDateTime(engagement.lastOpenedAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {engagementData.emailEngagements.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          color: '#666', 
          fontSize: '14px', 
          fontStyle: 'italic', 
          padding: '20px 0' 
        }}>
          No email engagement data yet
        </div>
      )}
    </div>
  );
}
