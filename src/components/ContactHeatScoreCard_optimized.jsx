import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { RBA_GREEN } from '../utils/rbaColors';

export default function ContactHeatScoreCard() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('summary');

  const fetchHeatData = useCallback(async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      const contactsQuery = query(
        collection(db, 'contacts'),
        where('userId', '==', user.uid)
      );
      const contactsSnap = await getDocs(contactsQuery);
      const contactsData = contactsSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        heatScore: doc.data().heatScore || 0
      }));

      setContacts(contactsData);
    } catch (error) {
      console.error('Error fetching heat data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeatData();
  }, [fetchHeatData]);

  // Memoize expensive calculations
  const heatData = useMemo(() => {
    if (contacts.length === 0) {
      return {
        totalContacts: 0,
        hotContacts: 0,
        warmContacts: 0,
        coldContacts: 0,
        averageScore: 0,
        topContacts: [],
        recentActivity: []
      };
    }

    const totalContacts = contacts.length;
    const hotContacts = contacts.filter(c => (c.heatScore || 0) >= 20).length;
    const warmContacts = contacts.filter(c => (c.heatScore || 0) >= 10 && (c.heatScore || 0) < 20).length;
    const coldContacts = contacts.filter(c => (c.heatScore || 0) < 10).length;
    
    const totalScore = contacts.reduce((sum, c) => sum + (c.heatScore || 0), 0);
    const averageScore = totalContacts > 0 ? parseFloat((totalScore / totalContacts).toFixed(1)) : 0;

    const topContacts = contacts
      .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0))
      .slice(0, 10);

    const recentActivity = contacts
      .filter(c => c.lastEngagement)
      .sort((a, b) => (b.lastEngagement?.seconds || 0) - (a.lastEngagement?.seconds || 0))
      .slice(0, 10);

    return {
      totalContacts,
      hotContacts,
      warmContacts,
      coldContacts,
      averageScore,
      topContacts,
      recentActivity
    };
  }, [contacts]);

  const getCategoryColor = (category) => {
    switch (category) {
      case 'hot': return '#e74c3c';
      case 'warm': return '#f39c12';
      case 'cold': return '#3498db';
      default: return '#95a5a6';
    }
  };

  const formatContactName = (contact) => {
    return `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unnamed Contact';
  };

  const renderCategoryView = () => {
    let filteredContacts = [];
    let categoryName = '';
    let categoryColor = '';

    switch (viewMode) {
      case 'hot':
        filteredContacts = contacts.filter(c => (c.heatScore || 0) >= 20);
        categoryName = 'Hot Contacts';
        categoryColor = getCategoryColor('hot');
        break;
      case 'warm':
        filteredContacts = contacts.filter(c => (c.heatScore || 0) >= 10 && (c.heatScore || 0) < 20);
        categoryName = 'Warm Contacts';
        categoryColor = getCategoryColor('warm');
        break;
      case 'cold':
        filteredContacts = contacts.filter(c => (c.heatScore || 0) < 10);
        categoryName = 'Cold Contacts';
        categoryColor = getCategoryColor('cold');
        break;
      default:
        return null;
    }

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ margin: 0, color: categoryColor }}>{categoryName} ({filteredContacts.length})</h4>
          <button
            onClick={() => setViewMode('summary')}
            style={{
              background: 'none',
              border: '1px solid #ddd',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Back to Summary
          </button>
        </div>
        
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {filteredContacts.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', margin: '20px 0' }}>
              No {viewMode} contacts found
            </p>
          ) : (
            filteredContacts.map(contact => (
              <div key={contact.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #f0f0f0'
              }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{formatContactName(contact)}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{contact.email}</div>
                </div>
                <div style={{
                  background: categoryColor,
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  {contact.heatScore || 0}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{
        background: '#fff',
        borderRadius: 8,
        padding: 24,
        marginBottom: 24,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>
          Contact Heat Mapping
        </h3>
        <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
          Loading contact heat scores...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 8,
      padding: 24,
      marginBottom: 24,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>
        Contact Heat Mapping
      </h3>

      {viewMode === 'summary' ? (
        <div>
          {/* Summary Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 16,
            marginBottom: 20
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#2c3e50' }}>
                {heatData.totalContacts}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Total Contacts</div>
            </div>

            <div 
              style={{ textAlign: 'center', cursor: 'pointer' }}
              onClick={() => setViewMode('hot')}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: getCategoryColor('hot') }}>
                {heatData.hotContacts}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Hot (20+)</div>
            </div>

            <div 
              style={{ textAlign: 'center', cursor: 'pointer' }}
              onClick={() => setViewMode('warm')}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: getCategoryColor('warm') }}>
                {heatData.warmContacts}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Warm (10-19)</div>
            </div>

            <div 
              style={{ textAlign: 'center', cursor: 'pointer' }}
              onClick={() => setViewMode('cold')}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: getCategoryColor('cold') }}>
                {heatData.coldContacts}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Cold (0-9)</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: RBA_GREEN }}>
                {heatData.averageScore}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Avg Score</div>
            </div>
          </div>

          {/* Top Contacts */}
          {heatData.topContacts.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>
                Top Contacts by Heat Score
              </h4>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {heatData.topContacts.slice(0, 5).map(contact => (
                  <div key={contact.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #f0f0f0'
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {formatContactName(contact)}
                      </div>
                      <div style={{ fontSize: 11, color: '#666' }}>
                        {contact.email}
                      </div>
                    </div>
                    <div style={{
                      background: contact.heatScore >= 20 ? getCategoryColor('hot') :
                                 contact.heatScore >= 10 ? getCategoryColor('warm') : getCategoryColor('cold'),
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600
                    }}>
                      {contact.heatScore || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {heatData.totalContacts === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
              No contact heat score data available yet.
              <br />
              Heat scores will appear as contacts engage with your emails.
            </div>
          )}
        </div>
      ) : (
        renderCategoryView()
      )}
    </div>
  );
}
