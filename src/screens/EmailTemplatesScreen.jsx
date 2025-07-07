import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { RBA_GREEN } from '../utils/rbaColors';
import { getTemplatesSplit } from '../services/email';
import { cardStyle, inputStyle } from '../utils/sharedStyles';
import Logo from './assets/Logo.png';

const mergeFields = [
  { label: 'First Name', value: '{{firstName}}' },
  { label: 'Last Name', value: '{{lastName}}' },
  { label: 'Quote Amount', value: '{{quoteAmount}}' },
  { label: 'Rep Name', value: '{{repName}}' },
  { label: 'Appointment Date', value: '{{appointmentDate}}' },
  { label: 'Last Contact Date', value: '{{lastContacted}}' },
  { label: 'Signature', value: '{{signature}}' },
];

export default function EmailTemplatesScreen() {
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('all');
  const [sortDir, setSortDir] = useState('asc');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [creatorNames, setCreatorNames] = useState({});
  const navigate = useNavigate();
  // Pagination state for each list
  const [privatePage, setPrivatePage] = useState(1);
  const [privatePageSize, setPrivatePageSize] = useState(10);
  const [publicPage, setPublicPage] = useState(1);
  const [publicPageSize, setPublicPageSize] = useState(10);
  // Modal state for accordion-style editing
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    
    async function fetchTemplates() {
      try {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user?.uid) {
          setTemplates([]);
          setError('No user logged in.');
          setUserId('');
          return;
        }
        setUserId(user.uid);
        console.log('Using userId for query:', user.uid);
        const { privateTemplates, publicTemplates } = await getTemplatesSplit();
        // Mark source for UI clarity
        const priv = privateTemplates.map(t => ({ ...t, _source: 'private' }));
        const pub = publicTemplates.map(t => ({ ...t, _source: 'public' }));
        const allTemplates = [...priv, ...pub];
        setTemplates(allTemplates);
        
        // Fetch creator names
        const uniqueUserIds = [...new Set(allTemplates.map(t => t.userId).filter(Boolean))];
        const namePromises = uniqueUserIds.map(async (uid) => {
          try {
            const userDocRef = doc(db, 'users', uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return [uid, userData.displayName || userData.email || 'Unknown User'];
            }
            return [uid, 'Unknown User'];
          } catch (error) {
            console.warn(`Failed to fetch user ${uid}:`, error);
            return [uid, 'Unknown User'];
          }
        });
        
        const nameResults = await Promise.all(namePromises);
        const nameMap = Object.fromEntries(nameResults);
        setCreatorNames(nameMap);
        
        setError('');
        console.log('Fetched templates:', allTemplates);
      } catch (err) {
        // Friendly error for permission/userId issues
        if (err.message && err.message.includes('PERMISSION_DENIED')) {
          setError('Some email logs are missing user information. Please contact support if this persists.');
        } else {
          setError('Failed to load templates: ' + (err.message || err.code || err));
        }
        setTemplates([]);
        setUserId('');
        console.error('Error fetching templates:', err);
      }
    }
    fetchTemplates();
  }, []);
  const filtered = templates
    .filter(t => `${t.name} ${t.subject}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a[sortBy] < b[sortBy]) return sortDir === 'asc' ? -1 : 1;
      if (a[sortBy] > b[sortBy]) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  const handleTemplateClick = (template) => {
    if (expandedTemplate && expandedTemplate.id === template.id) {
      setExpandedTemplate(null); // Collapse if already expanded
    } else {
      setExpandedTemplate(template); // Expand this template
    }
  };

  const fetchTemplateDetails = async (templateId) => {
    try {
      const docRef = doc(db, 'emailTemplates', templateId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
    } catch (error) {
      console.error('Error fetching template details:', error);
    }
    return null;
  };

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <img src={Logo} alt="Logo" style={{ height: 96, marginRight: 24 }} />
          <h2 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#222', fontFamily: 'Arial, sans-serif' }}>Email Templates</h2>
        </div>
        <div style={{ paddingTop: 0 }}>
          <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates..."
              style={{ minWidth: 180, width: 220, padding: 8, borderRadius: 4, border: '1px solid #ccc', fontSize: 16 }}
            />
            <label style={{ fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              Filter By:              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, marginLeft: 0, width: 160, height: 36, marginBottom: 0, fontSize: 15 }}>
                <option value="all">All Templates</option>
                <option value="public">Public Templates</option>
                <option value="private">Private Templates</option>
              </select>
            </label>
            <button onClick={() => navigate('/add-email-template')} style={{ background: RBA_GREEN, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 18px', fontWeight: 600, fontSize: 15 }}>Add Template</button>
          </div>          {error && <div style={{ color: 'red', textAlign: 'center', marginBottom: 16 }}>{error}</div>}
          
          {/* Unified Templates List */}
          {((sortBy === 'all' || sortBy === 'private' || sortBy === 'public') && filtered.length > 0) && (
            <>
              <h3 style={{ marginTop: 24, marginBottom: 16, textAlign: 'left', fontWeight: 700, fontSize: 20 }}>
                {sortBy === 'private' ? 'Private Templates' : sortBy === 'public' ? 'Public Templates' : 'All Templates'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span>Show</span>
                <select value={privatePageSize} onChange={e => { setPrivatePageSize(Number(e.target.value)); setPrivatePage(1); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: '100%', maxWidth: '100%', boxSizing: 'border-box', margin: 0 }}>
                {(() => {
                  // Filter and paginate templates based on current filter
                  let displayTemplates = [];
                  if (sortBy === 'all') {
                    displayTemplates = [...filtered.filter(t => t._source === 'private').map(t => ({...t, isPrivate: true})), ...filtered.filter(t => t._source === 'public').map(t => ({...t, isPrivate: false}))];
                  } else if (sortBy === 'private') {
                    displayTemplates = filtered.filter(t => t._source === 'private').map(t => ({...t, isPrivate: true}));
                  } else if (sortBy === 'public') {
                    displayTemplates = filtered.filter(t => t._source === 'public').map(t => ({...t, isPrivate: false}));
                  }
                  
                  // Apply pagination
                  const startIndex = (privatePage - 1) * privatePageSize;
                  const endIndex = startIndex + privatePageSize;
                  const paginatedTemplates = displayTemplates.slice(startIndex, endIndex);
                    return paginatedTemplates.map(template => (
                    <li key={template.id} style={{ width: '100%', maxWidth: '100%' }}>
                      <div
                        style={{
                          background: '#f9f9f9',
                          borderRadius: expandedTemplate?.id === template.id ? '8px 8px 0 0' : '8px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          padding: '16px 20px',
                          width: '100%',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          border: '1px solid #e0e0e0',
                          borderBottom: expandedTemplate?.id === template.id ? '1px solid #e0e0e0' : '1px solid #e0e0e0'
                        }}
                        onClick={() => handleTemplateClick(template)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 600, fontSize: '16px', color: '#000' }}>
                                {template.name}
                              </span>                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 500,
                                background: template.isPrivate ? '#e3f2fd' : '#f3e5f5',
                                color: template.isPrivate ? '#1976d2' : '#7b1fa2'
                              }}>
                                {template.isPrivate ? 'Private' : 'Public'}
                              </span>
                              <span style={{ fontSize: '14px', color: '#666', marginLeft: 'auto' }}>
                                {expandedTemplate?.id === template.id ? '−' : '+'}
                              </span>
                            </div>
                            <div style={{ color: '#666', fontSize: '14px', marginBottom: '2px' }}>
                              {template.subject}
                            </div>                            <div style={{ color: '#999', fontSize: '12px' }}>
                              Created by: {creatorNames[template.userId] || 'Unknown User'}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Inline Edit Accordion */}
                      {expandedTemplate?.id === template.id && (
                        <TemplateEditAccordion
                          template={template}
                          onSave={async (updatedTemplate) => {
                            await updateDoc(doc(db, 'emailTemplates', updatedTemplate.id), {
                              name: updatedTemplate.name,
                              subject: updatedTemplate.subject,
                              body: updatedTemplate.body,
                              updatedAt: new Date()
                            });
                            setExpandedTemplate(null);
                            // Refresh templates
                            const user = JSON.parse(localStorage.getItem('user'));
                            if (user?.uid) {
                              const { privateTemplates, publicTemplates } = await getTemplatesSplit();
                              const priv = privateTemplates.map(t => ({ ...t, _source: 'private' }));
                              const pub = publicTemplates.map(t => ({ ...t, _source: 'public' }));
                              setTemplates([...priv, ...pub]);
                            }
                          }}
                          onCancel={() => setExpandedTemplate(null)}
                        />
                      )}
                    </li>
                  ));
                })()}
              </ul>
              
              {/* Pagination Controls */}
              {Math.ceil(filtered.length / privatePageSize) > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                  <button 
                    onClick={() => setPrivatePage(p => Math.max(1, p-1))} 
                    disabled={privatePage === 1}
                    style={{
                      background: privatePage === 1 ? '#f5f5f5' : RBA_GREEN,
                      color: privatePage === 1 ? '#999' : '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      cursor: privatePage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    Page {privatePage} of {Math.ceil(filtered.length / privatePageSize)}
                  </span>
                  <button 
                    onClick={() => setPrivatePage(p => Math.min(Math.ceil(filtered.length / privatePageSize), p+1))} 
                    disabled={privatePage === Math.ceil(filtered.length / privatePageSize)}
                    style={{
                      background: privatePage === Math.ceil(filtered.length / privatePageSize) ? '#f5f5f5' : RBA_GREEN,
                      color: privatePage === Math.ceil(filtered.length / privatePageSize) ? '#999' : '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      cursor: privatePage === Math.ceil(filtered.length / privatePageSize) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          
          {filtered.length === 0 && !error && (
            <div style={{ textAlign: 'center', color: '#666', fontSize: '16px', marginTop: '32px' }}>
              No templates found matching your criteria.
            </div>          )}
        </div>        {/* Template Edit Modal */}
      </div>
      {/* Add bottom margin for green background separation */}
      <div style={{ height: 32 }} />
    </div>  );
}

// Template Edit Accordion Component (Inline Editor)
function TemplateEditAccordion({ template, onSave, onCancel }) {
  const [templateData, setTemplateData] = useState({
    name: template.name || '',
    subject: template.subject || '',
    body: template.body || ''
  });
  const [cursor, setCursor] = useState(0);
  const bodyRef = React.useRef();

  const handleSave = () => {
    const updatedTemplate = {
      ...template,
      ...templateData
    };
    onSave(updatedTemplate);
  };

  const canEdit = template._source === 'private' || (!template.public);

  const insertMergeField = (field) => {
    const before = templateData.body.slice(0, cursor);
    const after = templateData.body.slice(cursor);
    const newBody = before + field + after;
    setTemplateData({ ...templateData, body: newBody });
    setCursor(cursor + field.length);
    
    // Focus the textarea and set cursor position
    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.focus();
        bodyRef.current.setSelectionRange(cursor + field.length, cursor + field.length);
      }
    }, 0);
  };

  const handleBodyChange = (e) => {
    setTemplateData({ ...templateData, body: e.target.value });
    setCursor(e.target.selectionStart || 0);
  };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderTop: 'none',
      borderRadius: '0 0 8px 8px',
      padding: '24px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
    }}>      {/* Template Visibility Badge */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 500,
          background: template.isPrivate ? '#e3f2fd' : '#f3e5f5',
          color: template.isPrivate ? '#1976d2' : '#7b1fa2'
        }}>
          {template.isPrivate ? 'Private' : 'Public'}
        </span>
        
        {!canEdit && (
          <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            This template is read-only
          </span>
        )}
      </div>

      {/* Template Name */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          fontSize: '12px', 
          color: '#666', 
          textTransform: 'uppercase', 
          fontWeight: 600,
          display: 'block', 
          marginBottom: '6px' 
        }}>
          Template Name:
        </label>
        {canEdit ? (
          <input
            type="text"
            value={templateData.name}
            onChange={(e) => setTemplateData({ ...templateData, name: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            placeholder="Enter template name..."
          />
        ) : (
          <div style={{ 
            fontSize: '14px', 
            color: '#333', 
            padding: '10px 12px',
            background: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e9ecef'
          }}>
            {templateData.name}
          </div>
        )}
      </div>

      {/* Subject */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          fontSize: '12px', 
          color: '#666', 
          textTransform: 'uppercase', 
          fontWeight: 600,
          display: 'block', 
          marginBottom: '6px' 
        }}>
          Subject:
        </label>
        {canEdit ? (
          <input
            type="text"
            value={templateData.subject}
            onChange={(e) => setTemplateData({ ...templateData, subject: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            placeholder="Enter email subject..."
          />
        ) : (
          <div style={{ 
            fontSize: '14px', 
            color: '#333', 
            padding: '10px 12px',
            background: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e9ecef'
          }}>
            {templateData.subject}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          fontSize: '12px', 
          color: '#666', 
          textTransform: 'uppercase', 
          fontWeight: 600,
          display: 'block', 
          marginBottom: '6px' 
        }}>
          Email Body:
        </label>
        {canEdit ? (
          <>
            <textarea
              ref={bodyRef}
              value={templateData.body}
              onChange={handleBodyChange}
              onClick={e => setCursor(e.target.selectionStart || 0)}
              onKeyUp={e => setCursor(e.target.selectionStart || 0)}
              rows={8}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'monospace',
                lineHeight: '1.4',
                boxSizing: 'border-box'
              }}
              placeholder="Type your email content here. Use mail merge fields for personalization."
            />
            
            {/* Mail Merge Fields */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ 
                fontSize: '12px', 
                color: '#666', 
                textTransform: 'uppercase', 
                fontWeight: 600,
                marginBottom: '8px' 
              }}>
                Mail Merge Fields:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {mergeFields.map(field => (
                  <button
                    key={field.value}
                    type="button"
                    onClick={() => insertMergeField(field.value)}
                    style={{
                      background: RBA_GREEN,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#0f7b32'}
                    onMouseOut={(e) => e.target.style.backgroundColor = RBA_GREEN}
                  >
                    {field.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => insertMergeField('<a href="https://rbaconnector.com/unsubscribe?email={{email}}">Unsubscribe</a>')}
                  style={{
                    background: '#BBA100',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#996600'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#BBA100'}
                >
                  Unsubscribe Link
                </button>
              </div>
              <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                Click a field to insert at cursor position
              </div>
              <div style={{ color: '#BBA100', fontSize: '11px', marginTop: '6px', lineHeight: '1.3' }}>
                <strong>Note:</strong> Use <code>{'{{unsubscribeLink}}'}</code> in your email body for automatic unsubscribe links.
              </div>
            </div>
          </>
        ) : (
          <div style={{ 
            fontSize: '14px', 
            color: '#333', 
            padding: '12px',
            background: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e9ecef',
            maxHeight: '250px',
            overflow: 'auto',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace'
          }}>
            {templateData.body}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: '12px', 
        paddingTop: '16px', 
        borderTop: '1px solid #f0f0f0' 
      }}>
        <button
          onClick={onCancel}
          style={{
            background: '#f5f5f5',
            color: '#666',
            border: '1px solid #ddd',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => { e.target.style.backgroundColor = '#eee'; e.target.style.borderColor = '#ccc'; }}
          onMouseOut={(e) => { e.target.style.backgroundColor = '#f5f5f5'; e.target.style.borderColor = '#ddd'; }}
        >
          {canEdit ? 'Cancel' : 'Close'}
        </button>
        {canEdit && (
          <button
            onClick={handleSave}
            style={{
              background: RBA_GREEN,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#0f7b32'}
            onMouseOut={(e) => e.target.style.backgroundColor = RBA_GREEN}
          >
            Save Changes
          </button>
        )}
      </div>
    </div>
  );
}

// Template Edit Modal Component (Legacy - kept for reference)
function EditTemplateModal({ template, onClose, onSave }) {
  const [templateData, setTemplateData] = useState({
    name: template.name || '',
    subject: template.subject || '',
    body: template.body || ''
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const handleSave = () => {
    const updatedTemplate = {
      ...template,
      ...templateData
    };
    onSave(updatedTemplate);
  };

  const canEdit = template._source === 'private' || (!template.public);

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      background: 'rgba(0,0,0,0.5)', 
      zIndex: 2000, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{ 
        background: '#fff', 
        borderRadius: 12, 
        padding: '24px', 
        minWidth: '600px',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '24px',
          borderBottom: '2px solid #f0f0f0',
          paddingBottom: '16px'
        }}>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: '#222', 
            margin: 0 
          }}>
            {canEdit ? 'Edit Template: ' : 'View Template: '}{templateData.name}
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: '#f5f5f5',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Template Visibility */}
        <div style={{ marginBottom: '24px', padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#333', marginBottom: '12px', margin: 0 }}>
            Template Visibility
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 600,
              background: template.public ? '#e3f2fd' : '#fff3e0',
              color: template.public ? '#1976d2' : '#f57c00',
              border: `1px solid ${template.public ? '#bbdefb' : '#ffcc02'}`
            }}>
              {template.public ? 'PUBLIC' : 'PRIVATE'}
            </span>
            
            {template.public && (
              <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                Public templates cannot be edited
              </span>
            )}
          </div>
        </div>

        {/* Template Details Accordion */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              width: '100%',
              padding: '16px',
              background: isExpanded ? '#f8f9fa' : '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '16px',
              fontWeight: 600,
              color: '#333'
            }}
          >
            <span>Template Details</span>
            <span style={{ fontSize: '18px', color: '#666' }}>
              {isExpanded ? '−' : '+'}
            </span>
          </button>
          
          {isExpanded && (
            <div style={{ 
              padding: '20px', 
              borderLeft: '1px solid #e0e0e0',
              borderRight: '1px solid #e0e0e0',
              borderBottom: '1px solid #e0e0e0',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              background: '#fafafa'
            }}>
              {/* Template Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Template Name:
                </label>
                {canEdit ? (
                  <input
                    type="text"
                    value={templateData.name}
                    onChange={(e) => setTemplateData({ ...templateData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '14px', color: '#333', padding: '8px 0' }}>
                    {templateData.name}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Subject:
                </label>
                {canEdit ? (
                  <input
                    type="text"
                    value={templateData.subject}
                    onChange={(e) => setTemplateData({ ...templateData, subject: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '14px', color: '#333', padding: '8px 0' }}>
                    {templateData.subject}
                  </div>
                )}
              </div>

              {/* Body */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Email Body:
                </label>
                {canEdit ? (
                  <textarea
                    value={templateData.body}
                    onChange={(e) => setTemplateData({ ...templateData, body: e.target.value })}
                    rows={8}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      fontSize: '14px',
                      resize: 'vertical',
                      fontFamily: 'monospace'
                    }}
                  />
                ) : (
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#333', 
                    padding: '12px',
                    background: '#fff',
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    maxHeight: '200px',
                    overflow: 'auto',
                    lineHeight: '1.4',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {templateData.body}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
          <button
            onClick={onClose}
            style={{
              background: '#f5f5f5',
              color: '#666',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              style={{
                background: RBA_GREEN,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save Changes
            </button>
          )}
        </div>
      </div>
    </div>  );
}
