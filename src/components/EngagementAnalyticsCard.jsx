import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { RBA_GREEN } from '../utils/rbaColors';

export default function EngagementAnalyticsCard() {
  const [analytics, setAnalytics] = useState({
    totalEmails: 0,
    totalOpens: 0,
    totalClicks: 0,
    openRate: 0,
    clickRate: 0,
    recentEngagements: [],
    topPerformingEmails: []
  });
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('7d'); // 7d, 30d, 90d, all

  useEffect(() => {
    fetchAnalytics();
  }, [timeframe]);

  const fetchAnalytics = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      // Calculate date threshold based on timeframe
      let dateThreshold = null;
      if (timeframe !== 'all') {
        const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
        dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      }

      // Get email logs (not emailEngagements - that collection doesn't exist!)
      let emailLogsQuery = query(
        collection(db, 'emailLogs'),
        where('userId', '==', user.uid)
      );

      if (dateThreshold) {
        emailLogsQuery = query(
          emailLogsQuery,
          where('timestamp', '>=', dateThreshold)
        );
      }

      const emailLogsSnap = await getDocs(emailLogsQuery);
      const emailLogs = emailLogsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // console.log('[EngagementAnalyticsCard] Found email logs:', emailLogs.length);
      // console.log('[EngagementAnalyticsCard] Sample email log:', emailLogs[0]);

      // Calculate metrics from emailLogs
      const totalEmails = emailLogs.length;
      const totalOpens = emailLogs.reduce((sum, e) => sum + (e.opens || 0), 0);
      const totalClicks = emailLogs.reduce((sum, e) => sum + (e.clicks || 0), 0);
      const emailsWithOpens = emailLogs.filter(e => e.opens > 0).length;
      const emailsWithClicks = emailLogs.filter(e => e.clicks > 0).length;
      
      const openRate = totalEmails > 0 ? (emailsWithOpens / totalEmails * 100).toFixed(1) : 0;
      const clickRate = totalEmails > 0 ? (emailsWithClicks / totalEmails * 100).toFixed(1) : 0;

      // console.log('[EngagementAnalyticsCard] Calculated metrics:', {
      //   totalEmails,
      //   totalOpens,
      //   totalClicks,
      //   openRate,
      //   clickRate
      // });

      // Get recent engagements (last opened/clicked)
      const recentEngagements = emailLogs
        .filter(e => e.lastOpenedAt || e.lastClickedAt)
        .sort((a, b) => {
          const aTime = Math.max(
            a.lastOpenedAt?.seconds || 0,
            a.lastClickedAt?.seconds || 0
          );
          const bTime = Math.max(
            b.lastOpenedAt?.seconds || 0,
            b.lastClickedAt?.seconds || 0
          );
          return bTime - aTime;
        })
        .slice(0, 5);

      // Get top performing emails
      const topPerformingEmails = emailLogs
        .sort((a, b) => ((b.opens || 0) + (b.clicks || 0) * 2) - ((a.opens || 0) + (a.clicks || 0) * 2))
        .slice(0, 5);

      setAnalytics({
        totalEmails,
        totalOpens,
        totalClicks,
        openRate: parseFloat(openRate),
        clickRate: parseFloat(clickRate),
        recentEngagements,
        topPerformingEmails
      });
    } catch (error) {
      console.error('Error fetching engagement analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) return 'Unknown';
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp?.seconds) return 'Unknown';
    return new Date(timestamp.seconds * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '24px'
      }}>
        <div style={{ textAlign: 'center', color: '#666' }}>
          Loading engagement analytics...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      border: '1px solid #e0e0e0',
      marginBottom: '24px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h3 style={{ 
          margin: 0, 
          fontSize: '20px', 
          fontWeight: '600', 
          color: '#333' 
        }}>
          📧 Email Engagement Analytics
        </h3>
        <select 
          value={timeframe} 
          onChange={(e) => setTimeframe(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            fontSize: '14px'
          }}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: RBA_GREEN }}>
            {analytics.totalEmails}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Emails Sent</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
            {analytics.totalOpens}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Total Opens</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fd7e14' }}>
            {analytics.totalClicks}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Total Clicks</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
            {analytics.openRate}%
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Open Rate</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
            {analytics.clickRate}%
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>Click Rate</div>
        </div>
      </div>

      {/* Recent Activity & Top Performing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Recent Engagements */}
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
            🕐 Recent Activity
          </h4>
          {analytics.recentEngagements.length > 0 ? (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {analytics.recentEngagements.map((engagement, index) => (
                <div key={engagement.id} style={{
                  padding: '8px 12px',
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}>
                  <div style={{ fontWeight: '500', marginBottom: '4px', color: '#333' }}>
                    {engagement.subject}
                  </div>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    {engagement.emailAddress}
                  </div>
                  <div style={{ color: '#999', fontSize: '11px' }}>
                    {engagement.lastClickedAt ? 
                      `Clicked: ${formatDateTime(engagement.lastClickedAt)}` :
                      `Opened: ${formatDateTime(engagement.lastOpenedAt)}`
                    }
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#666', fontSize: '14px', fontStyle: 'italic' }}>
              No recent engagement activity
            </div>
          )}
        </div>

        {/* Top Performing Emails */}
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
            🏆 Top Performing Emails
          </h4>
          {analytics.topPerformingEmails.length > 0 ? (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {analytics.topPerformingEmails.map((email, index) => (
                <div key={email.id} style={{
                  padding: '8px 12px',
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}>
                  <div style={{ fontWeight: '500', marginBottom: '4px', color: '#333' }}>
                    {email.subject}
                  </div>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>
                    {email.emailAddress}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#999' }}>
                    <span>👁️ {email.opens || 0} opens</span>
                    <span>🖱️ {email.clicks || 0} clicks</span>
                    <span>📅 {formatDate(email.sentAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#666', fontSize: '14px', fontStyle: 'italic' }}>
              No email performance data yet
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ 
        marginTop: '20px', 
        paddingTop: '16px', 
        borderTop: '1px solid #eee',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={() => window.location.href = '/email-templates'}
          style={{
            background: RBA_GREEN,
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          📝 Email Templates
        </button>
        <button 
          onClick={() => window.location.href = '/campaigns'}
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
          🎯 Campaigns
        </button>
        <button 
          onClick={fetchAnalytics}
          style={{
            background: '#6c757d',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
