import React, { useState, useEffect } from 'react';
import { cardStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';
import { 
  migrateUserContactsToV2, 
  getMigrationStats, 
  getContactsByReasonCategory,
  REASON_NO_SALE_CATEGORIES 
} from '../services/contactMigration';

export default function ContactMigrationCard() {
  const [stats, setStats] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoryContacts, setCategoryContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;
      
      const migrationStats = await getMigrationStats(user.uid);
      setStats(migrationStats);
    } catch (error) {
      console.error('Error loading migration stats:', error);
    }
  };

  const handleMigration = async () => {
    setMigrating(true);
    setMigrationResult(null);
    
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;
      
      const result = await migrateUserContactsToV2(user.uid);
      setMigrationResult(result);
      await loadStats(); // Refresh stats
    } catch (error) {
      setMigrationResult({
        error: true,
        message: 'Migration failed: ' + error.message
      });
    } finally {
      setMigrating(false);
    }
  };

  const handleCategoryAnalysis = async (category) => {
    if (selectedCategory === category) {
      setSelectedCategory('');
      setCategoryContacts([]);
      return;
    }

    setLoading(true);
    setSelectedCategory(category);
    
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;
      
      const contacts = await getContactsByReasonCategory(user.uid, category);
      setCategoryContacts(contacts);
    } catch (error) {
      console.error('Error loading category contacts:', error);
      setCategoryContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCategoryName = (category) => {
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getCategoryColor = (category) => {
    const colors = {
      price: '#e74c3c',
      timing: '#f39c12',
      decision_process: '#3498db',
      product_service: '#9b59b6',
      external_factors: '#1abc9c',
      no_interest: '#95a5a6',
      uncategorized: '#34495e'
    };
    return colors[category] || '#34495e';
  };

  if (!stats) {
    return (
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>
          Contact Schema Migration
        </h3>
        <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
          Loading migration stats...
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>
        Contact Schema Migration & Analysis
      </h3>
      
      {/* Migration Status */}
      <div style={{ 
        background: '#f8f9fa', 
        padding: 16, 
        borderRadius: 8, 
        marginBottom: 16,
        border: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>Migration Status</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: '#666' }}>
              {stats.v2}/{stats.total} contacts migrated
            </span>
            <div style={{
              width: 100,
              height: 8,
              background: '#e9ecef',
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(stats.v2 / stats.total) * 100}%`,
                height: '100%',
                background: RBA_GREEN,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>
        
        {stats.v1 > 0 && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleMigration}
              disabled={migrating}
              style={{
                ...buttonOutlineStyle,
                background: RBA_GREEN,
                color: '#fff',
                fontSize: 14,
                padding: '8px 16px'
              }}
            >
              {migrating ? 'Migrating...' : `Migrate ${stats.v1} Contacts`}
            </button>
            
            {migrationResult && (
              <span style={{ 
                fontSize: 14,
                color: migrationResult.error ? '#e74c3c' : RBA_GREEN,
                fontWeight: 500
              }}>
                {migrationResult.message}
              </span>
            )}
          </div>
        )}
        
        {stats.v1 === 0 && (
          <div style={{ color: RBA_GREEN, fontWeight: 500, fontSize: 14 }}>
            ✓ All contacts migrated to enhanced schema
          </div>
        )}
      </div>

      {/* Reason No Sale Analysis */}
      {stats.v2 > 0 && Object.keys(stats.reasonCategories).length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
            Reason No Sale Analysis
          </h4>
          
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {Object.entries(stats.reasonCategories).map(([category, count]) => (
              <div
                key={category}
                onClick={() => handleCategoryAnalysis(category)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  background: selectedCategory === category ? '#f8f9fa' : '#fff',
                  border: `2px solid ${selectedCategory === category ? getCategoryColor(category) : '#e9ecef'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: getCategoryColor(category)
                  }} />
                  <span style={{ fontWeight: 500 }}>
                    {formatCategoryName(category)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ 
                    background: getCategoryColor(category),
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {count}
                  </span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {((count / stats.v2) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Category Details */}
          {selectedCategory && (
            <div style={{
              background: '#f8f9fa',
              border: `2px solid ${getCategoryColor(selectedCategory)}`,
              borderRadius: 8,
              padding: 16,
              marginTop: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h5 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  {formatCategoryName(selectedCategory)} Contacts
                </h5>
                <span style={{ fontSize: 12, color: '#666' }}>
                  {loading ? 'Loading...' : `${categoryContacts.length} contacts`}
                </span>
              </div>

              {!loading && categoryContacts.length > 0 && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 12, color: '#666' }}>Recommended Action:</strong>
                    <div style={{ fontSize: 14, marginTop: 4 }}>
                      {REASON_NO_SALE_CATEGORIES[selectedCategory]?.followUpAction}
                    </div>
                  </div>

                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {categoryContacts.slice(0, 10).map(contact => (
                      <div
                        key={contact.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: '1px solid #e9ecef'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>
                            {contact.firstName} {contact.lastName}
                          </div>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            {contact.salesOutcome?.reasonNoSale?.subcategory && 
                              formatCategoryName(contact.salesOutcome.reasonNoSale.subcategory)
                            }
                          </div>
                        </div>
                        <div style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: contact.salesOutcome?.reasonNoSale?.priority === 'high' 
                            ? '#e74c3c' 
                            : contact.salesOutcome?.reasonNoSale?.priority === 'medium'
                            ? '#f39c12'
                            : '#27ae60',
                          color: '#fff'
                        }}>
                          {contact.salesOutcome?.reasonNoSale?.priority?.toUpperCase()}
                        </div>
                      </div>
                    ))}
                    {categoryContacts.length > 10 && (
                      <div style={{ textAlign: 'center', padding: 8, color: '#666', fontSize: 12 }}>
                        ... and {categoryContacts.length - 10} more contacts
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Priority Distribution */}
          <div style={{ marginTop: 16 }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600 }}>
              Follow-up Priority Distribution
            </h5>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(stats.priorityDistribution).map(([priority, count]) => (
                <div
                  key={priority}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: 8,
                    borderRadius: 6,
                    background: priority === 'high' 
                      ? '#fff5f5' 
                      : priority === 'medium'
                      ? '#fffbf0'
                      : '#f0fff4',
                    border: `1px solid ${priority === 'high' 
                      ? '#fed7d7' 
                      : priority === 'medium'
                      ? '#feebc8'
                      : '#c6f6d5'}`
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{count}</div>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
                    {priority} Priority
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
