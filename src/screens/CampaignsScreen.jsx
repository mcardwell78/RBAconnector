import React, { useEffect, useState } from 'react';
import { RBA_GREEN } from '../utils/rbaColors';
import CampaignBuilder from '../components/CampaignBuilder';
import { getCampaigns, addCampaign, updateCampaign, getCampaignsSplit } from '../services/campaigns';
import { getEnrollmentsForCampaign, enrollContacts } from '../services/campaignEnrollments';
import { getContacts } from '../services/contacts';
import { getDocs, getDoc, doc, collection, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { cardStyle, inputStyle, buttonOutlineStyle, modalStyle } from '../utils/sharedStyles';
import Logo from './assets/Logo.png';
import { createCampaignScheduledEmails } from '../services/email';
import BulkCampaignAssignModal from '../components/BulkCampaignAssignModal';
import ContactMultiSelectModal from '../components/ContactMultiSelectModal';
import { getTemplatesSplit } from '../services/email';

export default function CampaignsScreen() {
  const [campaigns, setCampaigns] = useState([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('all');
  const [sortDir, setSortDir] = useState('desc');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [assignCampaignId, setAssignCampaignId] = useState(null);
  const [assignedContacts, setAssignedContacts] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [privateCampaigns, setPrivateCampaigns] = useState([]);
  const [publicCampaigns, setPublicCampaigns] = useState([]);  const [expandedCampaigns, setExpandedCampaigns] = useState(new Set());
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);
  const [selectedCampaignForDetails, setSelectedCampaignForDetails] = useState(null);
  const [creatorNames, setCreatorNames] = useState({}); // Store creator names by userId
  // Import/export state is managed below, do not redeclare here.
  const navigate = useNavigate();

  // Pagination state for each list
  const [privatePage, setPrivatePage] = useState(1);
  const [privatePageSize, setPrivatePageSize] = useState(10);
  const [publicPage, setPublicPage] = useState(1);
  const [publicPageSize, setPublicPageSize] = useState(10);  // Fetch campaigns and enrollment counts
  const fetchCampaigns = async () => {
    const { privateCampaigns, publicCampaigns } = await getCampaignsSplit();
    setPrivateCampaigns(privateCampaigns);
    setPublicCampaigns(publicCampaigns);
    // Merge for export/legacy logic
    setCampaigns([...privateCampaigns, ...publicCampaigns]);
      // Fetch creator names for all campaigns
    const allCampaigns = [...privateCampaigns, ...publicCampaigns];
    const uniqueUserIds = [...new Set(allCampaigns.map(c => c.userId).filter(Boolean))];
    const names = {};
    for (const userId of uniqueUserIds) {
      try {
        // Query by document ID since the document ID is the user's UID
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          names[userId] = userData.name || userData.displayName || userData.email || 'Unknown User';
          console.log(`Found user ${userId}:`, userData.name || userData.displayName || userData.email);
        } else {
          names[userId] = 'User Not Found';
          console.log(`User document not found for userId: ${userId}`);
        }
      } catch (error) {
        console.error('Error fetching creator name for userId:', userId, error);
        names[userId] = 'Error Loading User';
      }
    }
    setCreatorNames(names);
    
    // Fetch enrollments for all campaigns
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user?.uid) return;
    const q = query(collection(db, 'campaignEnrollments'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    const counts = {};
    snap.docs.forEach(doc => {
      const d = doc.data();
      // Only count active enrollments
      if (d.status === 'active') {
        if (!counts[d.campaignId]) counts[d.campaignId] = 0;
        counts[d.campaignId]++;
      }
    });
    setEnrollmentCounts(counts);
  };
  const toggleCampaignExpansion = (campaignId) => {
    setExpandedCampaigns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(campaignId)) {
        newSet.delete(campaignId);
      } else {
        newSet.add(campaignId);
      }
      return newSet;
    });
  };
  const handleEdit = (campaign) => {
    setSelectedCampaignForDetails(campaign);
    setShowCampaignDetails(true);
  };

  const handleViewEmails = (campaign) => {
    setSelectedCampaignForDetails(campaign);
    setShowCampaignDetails(true);
  };
  const handleAssignNew = (campaign) => {
    setPendingAssignCampaign(campaign);
    setShowContactSelect(true);
  };
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    fetchCampaigns();
    // eslint-disable-next-line
  }, []);

  const filtered = campaigns
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.description || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      if (sort === 'createdAt') return sortDir === 'asc' ? (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0) : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      return 0;
    });
  const handleCreate = () => {
    setEditingCampaign(null);
    setShowBuilder(true);
  };
  const handleSave = async (data) => {
    if (editingCampaign) {
      await updateCampaign(editingCampaign.id, data);
    } else {
      await addCampaign(data);
    }
    setShowBuilder(false);
    fetchCampaigns();
  };
  const [showContactSelect, setShowContactSelect] = useState(false);
  const [pendingAssignCampaign, setPendingAssignCampaign] = useState(null);
  const [pendingContactIds, setPendingContactIds] = useState([]);
  // Replace handleAssign to open contact select modal
  const handleAssign = (campaign) => {
    setPendingAssignCampaign(campaign);
    setShowContactSelect(true);
  };
  // When contacts are selected, open BulkCampaignAssignModal
  const handleContactsSelected = (contactIds) => {
    setPendingContactIds(contactIds);
    setShowContactSelect(false);
    setShowAssign(true);
  };
  const handleOpenDetail = (campaign) => {
    setDetailCampaign(campaign);
    setShowDetail(true);
  };
  const handleCloseDetail = () => {
    setShowDetail(false);
    setDetailCampaign(null);
  };

  // Export campaigns as pretty JSON
  const handleExport = () => {
    const json = JSON.stringify(campaigns, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaigns-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };
  // Import campaigns from JSON
  const handleImport = async () => {
    try {
      const arr = JSON.parse(importText);
      for (const c of arr) {
        await addCampaign({ ...c, createdAt: new Date(), userId: JSON.parse(localStorage.getItem('user'))?.uid });
      }
      setImporting(false);
      setImportText('');
      fetchCampaigns();
    } catch (e) {
      alert('Invalid JSON');
    }
  };
  // Delete campaign and related enrollments
  const handleDeleteCampaign = async (campaignId) => {
    // Delete campaign document
    await import('../services/campaigns').then(mod => mod.deleteCampaign(campaignId));
    // Delete all enrollments for this campaign
    const q = query(collection(db, 'campaignEnrollments'), where('campaignId', '==', campaignId));
    const snap = await getDocs(q);
    const batchDeletes = [];
    snap.forEach(docSnap => {
      batchDeletes.push(import('../services/campaignEnrollments').then(mod => mod.removeEnrollment(docSnap.id)));
    });
    await Promise.all(batchDeletes);
    setShowBuilder(false);
    setEditingCampaign(null);
    fetchCampaigns();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: RBA_GREEN, width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ flex: '0 0 auto' }}>
        {/* Main card/content area */}
        <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
          <img src={require('./assets/Logo.png')} alt="DC Power Connector" style={{ position: 'absolute', top: 24, left: 24, height: 120, display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            <img src={Logo} alt="Logo" style={{ height: 96, marginRight: 24 }} />
            <h2 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#222', fontFamily: 'Arial, sans-serif' }}>Campaigns</h2>
          </div>
          <div style={{ paddingTop: 0 }}>
            <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns, descriptions, creators..." style={{ minWidth: 180, width: 220, padding: 8, borderRadius: 4, border: '1px solid #ccc', fontSize: 16 }} />
              <label style={{ fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                Filter By:                <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...inputStyle, marginLeft: 0, width: 160, height: 36, marginBottom: 0, fontSize: 15 }}>
                  <option value="all">All Campaigns</option>
                  <option value="public">Public Campaigns</option>
                  <option value="private">Private Campaigns</option>
                </select>
              </label>
              <button onClick={() => navigate('/campaigns/new')} style={{ background: RBA_GREEN, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 18px', fontWeight: 600, fontSize: 15 }}>Add New Campaign</button>
            </div>            {((sort === 'all' || sort === 'private' || sort === 'public') && (privateCampaigns.length > 0 || publicCampaigns.length > 0)) && (
              <>                <h3 style={{ marginTop: 24, marginBottom: 16, textAlign: 'left', fontWeight: 700, fontSize: 20 }}>
                  {sort === 'private' ? 'Private Campaigns' : sort === 'public' ? 'Public Campaigns' : 'All Campaigns'}
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
                    // Combine campaigns based on filter
                    let allCampaigns = [];
                    if (sort === 'all') {
                      allCampaigns = [...privateCampaigns.map(c => ({...c, isPrivate: true})), ...publicCampaigns.map(c => ({...c, isPrivate: false}))];
                    } else if (sort === 'private') {
                      allCampaigns = privateCampaigns.map(c => ({...c, isPrivate: true}));
                    } else if (sort === 'public') {
                      allCampaigns = publicCampaigns.map(c => ({...c, isPrivate: false}));
                    }
                      return allCampaigns
                      .filter(c => {
                        const searchLower = search.toLowerCase();
                        const creatorName = creatorNames[c.userId] || 'Unknown User';
                        return c.name.toLowerCase().includes(searchLower) || 
                               (c.description || '').toLowerCase().includes(searchLower) ||
                               creatorName.toLowerCase().includes(searchLower);
                      })
                      .slice((privatePage-1)*privatePageSize, privatePage*privatePageSize)
                      .map(c => (                        <CampaignCard
                          key={c.id}
                          campaign={c}
                          onEdit={handleEdit}
                          onToggleExpand={toggleCampaignExpansion}
                          enrolledCount={enrollmentCounts[c.id] || 0}
                          isExpanded={expandedCampaigns.has(c.id)}
                          isPrivate={c.isPrivate}
                          creatorName={creatorNames[c.userId] || 'Unknown User'}
                        />
                      ));
                  })()}
                </ul>
              </>
            )}
            {showBuilder && (
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 600, maxWidth: 800 }}>
                  <CampaignBuilder campaign={editingCampaign} onSave={async (data) => {
                    if (editingCampaign) {
                      await updateCampaign(editingCampaign.id, data);
                    } else {
                      await addCampaign(data);
                    }
                    setShowBuilder(false);
                    setEditingCampaign(null);
                    fetchCampaigns();
                  }} onCancel={() => { setShowBuilder(false); setEditingCampaign(null); }} 
                  onDelete={handleDeleteCampaign}
                  />
                </div>
              </div>
            )}
            {showDetail && detailCampaign && (
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 600, maxWidth: 800 }}>
                  <h2 style={{ marginBottom: 16 }}>{detailCampaign.name}</h2>
                  <div style={{ marginBottom: 16 }}>{detailCampaign.description}</div>
                  <div style={{ marginBottom: 16 }}><b>Steps:</b>
                    <ol>
                      {(detailCampaign.steps || []).map((step, idx) => (
                        <li key={idx} style={{ marginBottom: 8 }}>
                          <div><b>Type:</b> {step.stepType || 'email'}</div>
                          <div><b>Subject:</b> {step.subject || '(from template)'}</div>
                          <div><b>Delay:</b> {step.delay ? (step.delay.unit === 'custom' ? `${step.delay.value} at ${step.delay.time}` : `${step.delay.value} ${step.delay.unit}`) : ''}</div>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
                    <button onClick={handleCloseDetail} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Close</button>
                  </div>
                </div>              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }} />      {/* --- Assign Modal: Only render when showAssign and pendingAssignCampaign are set --- */}
      {showAssign && pendingAssignCampaign && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 400, maxWidth: 600 }}>
            <BulkCampaignAssignModal
              open={showAssign}
              contactIds={pendingContactIds}
              onClose={() => { setShowAssign(false); setPendingAssignCampaign(null); setPendingContactIds([]); }}
              onComplete={() => { setShowAssign(false); setPendingAssignCampaign(null); setPendingContactIds([]); fetchCampaigns(); }}
              preSelectedCampaign={pendingAssignCampaign}
            />
          </div>
        </div>
      )}{/* Contact Multi-Select Modal */}
      {showContactSelect && (
        <ContactMultiSelectModal
          open={showContactSelect}
          onClose={() => setShowContactSelect(false)}
          onSelect={handleContactsSelected}
        />
      )}
        {/* New Campaign Edit Modal */}
      {showCampaignDetails && selectedCampaignForDetails && (
        <EditCampaignModal
          campaign={selectedCampaignForDetails}
          onClose={() => {
            setShowCampaignDetails(false);
            setSelectedCampaignForDetails(null);
          }}          onSave={async (updatedCampaign) => {
            // Check for active enrollments before allowing edits
            if (!updatedCampaign.public) {
              const user = JSON.parse(localStorage.getItem('user'));
              const enrollmentsQuery = query(
                collection(db, 'campaignEnrollments'), 
                where('campaignId', '==', updatedCampaign.id),
                where('userId', '==', user.uid),
                where('status', '==', 'active')
              );
              const enrollmentsSnap = await getDocs(enrollmentsQuery);
              
              if (enrollmentsSnap.size > 0) {
                alert(`This campaign has ${enrollmentsSnap.size} active enrollment(s) and cannot be edited. Please wait for all enrollments to complete or withdraw them first.`);
                return;
              }
            }
            
            await updateCampaign(updatedCampaign.id, updatedCampaign);
            setShowCampaignDetails(false);
            setSelectedCampaignForDetails(null);
            fetchCampaigns();
          }}
        />
      )}
      </div>
  );
}

// Simple campaign card with expand/collapse functionality
function CampaignCard({ campaign, onEdit, onToggleExpand, enrolledCount, isExpanded, isPrivate, creatorName }) {  const handleNameClick = () => {
    onToggleExpand(campaign.id);
  };

  return (
    <li style={{ 
      ...cardStyle, 
      marginBottom: 8, 
      padding: '16px 20px', 
      maxWidth: 760, 
      width: '98%', 
      marginLeft: 'auto', 
      marginRight: 'auto', 
      boxSizing: 'border-box' 
    }}>
      {/* Main row - Campaign name with private/public label + buttons */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        width: '100%' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>          <button
            onClick={handleNameClick}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#222',
              cursor: 'pointer',
              textAlign: 'left',
              textDecoration: 'underline'
            }}
          >
            {campaign.name}
          </button>          <span style={{ 
            fontSize: 12, 
            fontWeight: 500,
            background: isPrivate ? '#e3f2fd' : '#f3e5f5',
            color: isPrivate ? '#1976d2' : '#7b1fa2',
            padding: '2px 8px',
            borderRadius: 12
          }}>
            {isPrivate ? 'Private' : 'Public'}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPrivate && (
            <button 
              onClick={() => onEdit(campaign)} 
              style={{ 
                ...buttonOutlineStyle, 
                padding: '6px 12px', 
                fontSize: 14,
                minWidth: 60
              }}            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div style={{ 
          marginTop: 16, 
          paddingTop: 16, 
          borderTop: '1px solid #eee',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Description */}
          {campaign.description && (
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333', marginBottom: 4 }}>Description:</div>
              <div style={{ fontSize: 14, color: '#666', lineHeight: 1.4 }}>{campaign.description}</div>
            </div>
          )}
          
          {/* Campaign details in a grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: 16 
          }}>            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>Total Steps:</div>
              <div style={{ fontSize: 14, color: '#666' }}>{campaign.steps?.length || 0}</div>
            </div>
            
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>Active Enrolled:</div>
              <div style={{ fontSize: 14, color: '#666' }}>{enrolledCount}</div>
            </div>
            
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>Purpose:</div>
              <div style={{ fontSize: 14, color: '#666' }}>{campaign.purpose || 'Not specified'}</div>
            </div>
            
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>Created By:</div>
              <div style={{ fontSize: 14, color: '#666' }}>{creatorName}</div>
            </div>
            
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>Creation Date:</div>
              <div style={{ fontSize: 14, color: '#666' }}>
                {campaign.createdAt ? new Date(campaign.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
              </div>
            </div>
          </div>

          {/* Tags if any */}
          {campaign.tags && campaign.tags.length > 0 && (
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#333', marginBottom: 6 }}>Tags:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {campaign.tags.map((tag, idx) => (
                  <span key={idx} style={{ 
                    background: '#e3f2fd', 
                    color: '#1976d2', 
                    borderRadius: 12, 
                    padding: '3px 10px', 
                    fontSize: 12, 
                    fontWeight: 500 
                  }}>
                    {tag}
                  </span>
                ))}              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// Edit Campaign Modal with accordion-style steps and editing capabilities
function EditCampaignModal({ campaign, onClose, onSave }) {
  const [expandedStep, setExpandedStep] = useState(null);
  const [editingStep, setEditingStep] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [campaignData, setCampaignData] = useState({
    ...campaign,
    steps: campaign.steps || []
  });
  const delayUnits = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'days', label: 'Days' },
    { value: 'weeks', label: 'Weeks' },
    { value: 'months', label: 'Months' }
  ];

  // Color constant
  const RBA_GREEN = '#5BA150';

  // Load templates on mount
  useEffect(() => {
    async function loadTemplates() {
      try {
        const { privateTemplates, publicTemplates } = await getTemplatesSplit();
        const priv = privateTemplates.map(t => ({ ...t, _source: 'private' }));
        const pub = publicTemplates.map(t => ({ ...t, _source: 'public' }));
        setTemplates([...priv, ...pub]);
      } catch (error) {
        console.error('Error loading templates:', error);
      }
    }
    loadTemplates();
  }, []);

  const toggleStep = (stepIndex) => {
    setExpandedStep(expandedStep === stepIndex ? null : stepIndex);
    setEditingStep(null); // Close any editing
  };

  const startEditingStep = (stepIndex) => {
    setEditingStep(stepIndex);
    setExpandedStep(stepIndex);
  };
  const saveStepEdit = (stepIndex, updatedStep) => {
    const newSteps = [...campaignData.steps];
    newSteps[stepIndex] = updatedStep;
    setCampaignData({ ...campaignData, steps: newSteps });
    setEditingStep(null);
  };

  const cancelStepEdit = () => {
    setEditingStep(null);
  };

  const addNewStep = () => {
    const newStep = {
      stepType: 'email',
      templateId: '',
      subject: '',
      body: '',
      delay: { value: 1, unit: 'days' }
    };
    setCampaignData({ 
      ...campaignData, 
      steps: [...campaignData.steps, newStep] 
    });
  };

  const moveStepUp = (stepIndex) => {
    if (stepIndex === 0) return;
    const newSteps = [...campaignData.steps];
    [newSteps[stepIndex - 1], newSteps[stepIndex]] = [newSteps[stepIndex], newSteps[stepIndex - 1]];
    setCampaignData({ ...campaignData, steps: newSteps });
  };

  const moveStepDown = (stepIndex) => {
    if (stepIndex === campaignData.steps.length - 1) return;
    const newSteps = [...campaignData.steps];
    [newSteps[stepIndex], newSteps[stepIndex + 1]] = [newSteps[stepIndex + 1], newSteps[stepIndex]];
    setCampaignData({ ...campaignData, steps: newSteps });
  };

  const deleteStep = (stepIndex) => {
    const newSteps = campaignData.steps.filter((_, index) => index !== stepIndex);
    setCampaignData({ ...campaignData, steps: newSteps });
    setEditingStep(null);
    setExpandedStep(null);
  };
  const handleSave = () => {
    const updatedCampaign = { ...campaignData };
    
    // If makePublic is checked, set the campaign to public
    if (campaignData.makePublic && !campaignData.public) {
      updatedCampaign.public = true;
      updatedCampaign.makePublic = undefined; // Remove the temporary flag
    }
    
    onSave(updatedCampaign);
  };

  // Helper function to format delay
  const formatDelay = (delay) => {
    if (!delay) return '0 days';
    if (typeof delay === 'object' && delay.value !== undefined && delay.unit !== undefined) {
      if (delay.unit === 'custom' && delay.time) {
        return `${delay.value} at ${delay.time}`;
      }
      return `${delay.value} ${delay.unit}`;
    }
    return delay.toString() + ' days';
  };

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
      }}>        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '24px',
          borderBottom: '2px solid #f0f0f0',
          paddingBottom: '16px'
        }}>          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: '#222', 
            margin: 0 
          }}>
            {campaignData.public ? 'View Campaign: ' : 'Edit Campaign: '}{campaignData.name}
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
        </div>        {/* Campaign Description */}
        {campaignData.description && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>
              Description
            </h3>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.5', margin: 0 }}>
              {campaignData.description}
            </p>
          </div>
        )}

        {/* Public/Private Toggle */}
        <div style={{ marginBottom: '24px', padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#333', marginBottom: '12px', margin: 0 }}>
            Campaign Visibility
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 600,
              background: campaignData.public ? '#e3f2fd' : '#fff3e0',
              color: campaignData.public ? '#1976d2' : '#f57c00',
              border: `1px solid ${campaignData.public ? '#bbdefb' : '#ffcc02'}`
            }}>
              {campaignData.public ? 'PUBLIC' : 'PRIVATE'}
            </span>
            
            {!campaignData.public && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '14px', 
                  color: '#333',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={campaignData.makePublic || false}
                    onChange={(e) => setCampaignData({ 
                      ...campaignData, 
                      makePublic: e.target.checked 
                    })}
                    style={{ marginRight: '4px' }}
                  />
                  Make this campaign public
                </label>
              </div>
            )}
            
            {campaignData.public && (
              <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                Public campaigns cannot be made private or edited
              </span>
            )}
          </div>
          
          {!campaignData.public && (
            <div style={{ 
              marginTop: '8px', 
              fontSize: '12px', 
              color: '#666', 
              lineHeight: '1.4'
            }}>
              <strong>Note:</strong> Once made public, this campaign cannot be changed back to private and cannot be edited. Only admins can delete public campaigns.
            </div>
          )}
        </div>        {/* Campaign Steps */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#333', margin: 0 }}>
              Campaign Steps ({campaignData.steps?.length || 0})
            </h3>
            {!campaignData.public && (
              <button
                onClick={addNewStep}
                style={{
                  background: RBA_GREEN,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Add Step
              </button>
            )}
          </div>
          
          {campaignData.steps && campaignData.steps.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>              {campaignData.steps.map((step, index) => (                <StepAccordion
                  key={index}
                  step={step}
                  stepIndex={index}
                  totalSteps={campaignData.steps.length}
                  isExpanded={expandedStep === index}
                  isEditing={editingStep === index}
                  isPublic={campaignData.public}
                  templates={templates}
                  delayUnits={delayUnits}
                  onToggle={() => toggleStep(index)}
                  onStartEdit={() => startEditingStep(index)}
                  onSaveEdit={(updatedStep) => saveStepEdit(index, updatedStep)}
                  onCancelEdit={cancelStepEdit}
                  onMoveUp={() => moveStepUp(index)}
                  onMoveDown={() => moveStepDown(index)}
                  onDelete={() => deleteStep(index)}
                  formatDelay={formatDelay}
                />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
              No steps configured for this campaign.
            </p>
          )}
        </div>        {/* Action Buttons */}
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
            {campaignData.public ? 'Close' : 'Cancel'}
          </button>
          {!campaignData.public && (
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
    </div>
  );
}

// Individual Step Accordion Component with editing capabilities
function StepAccordion({ 
  step, 
  stepIndex, 
  totalSteps,
  isExpanded, 
  isEditing, 
  isPublic,
  templates, 
  delayUnits, 
  onToggle,
  onStartEdit, 
  onSaveEdit, 
  onCancelEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
  formatDelay 
}) {const [editData, setEditData] = useState({
    templateId: step.templateId || '',
    subject: step.subject || '',
    body: step.body || '',
    delay: step.delay || { value: 0, unit: 'days' }
  });

  // Import the color constant
  const RBA_GREEN = '#5BA150';

  useEffect(() => {
    if (isEditing) {
      setEditData({
        templateId: step.templateId || '',
        subject: step.subject || '',
        body: step.body || '',
        delay: step.delay || { value: 0, unit: 'days' }
      });
    }
  }, [isEditing, step]);

  const handleTemplateChange = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setEditData({
        ...editData,
        templateId,
        subject: template.subject || '',
        body: template.body || ''
      });
    } else {
      setEditData({
        ...editData,
        templateId: '',
        subject: '',
        body: ''
      });
    }
  };

  const handleSave = () => {
    const updatedStep = {
      ...step,
      templateId: editData.templateId,
      subject: editData.subject,
      body: editData.body,
      delay: editData.delay
    };
    onSaveEdit(updatedStep);
  };
  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Step Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: isExpanded ? '#f8f9fa' : '#fff'
      }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1,
            padding: '16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              background: RBA_GREEN, 
              color: 'white', 
              borderRadius: '50%', 
              width: '24px', 
              height: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 600
            }}>
              {stepIndex + 1}
            </span>
            <span style={{ color: '#333' }}>
              Step {stepIndex + 1}: {step.subject || 'No Subject'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>
              Delay: {formatDelay(step.delay)}
            </span>
            <span style={{ fontSize: '16px', color: '#666' }}>
              {isExpanded ? '−' : '+'}
            </span>
          </div>
        </button>        
        {/* Reorder buttons - moved outside the main button */}
        {!isPublic && (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '2px', 
            padding: '8px',
            borderLeft: '1px solid #e0e0e0'
          }}>
            <button
              onClick={onMoveUp}
              disabled={stepIndex === 0}
              style={{
                background: stepIndex === 0 ? '#f0f0f0' : '#e0e0e0',
                border: 'none',
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: '10px',
                cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
                color: stepIndex === 0 ? '#999' : '#666'
              }}
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={stepIndex === totalSteps - 1}
              style={{
                background: stepIndex === totalSteps - 1 ? '#f0f0f0' : '#e0e0e0',
                border: 'none',
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: '10px',
                cursor: stepIndex === totalSteps - 1 ? 'not-allowed' : 'pointer',
                color: stepIndex === totalSteps - 1 ? '#999' : '#666'
              }}
            >
              ▼
            </button>
          </div>
        )}
      </div>
      
      {/* Step Content */}
      {isExpanded && !isEditing && (
        <div style={{ 
          padding: '16px', 
          borderTop: '1px solid #e0e0e0',
          background: '#fafafa'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <strong style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
                Subject:
              </strong>
              <div style={{ fontSize: '14px', color: '#333', marginTop: '4px' }}>
                {step.subject || 'No subject'}
              </div>
            </div>
            <div>
              <strong style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
                Delay:
              </strong>
              <div style={{ fontSize: '14px', color: '#333', marginTop: '4px' }}>
                {formatDelay(step.delay)}
              </div>
            </div>
          </div>
          
          {step.body && (
            <div style={{ marginBottom: '16px' }}>
              <strong style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>
                Email Body:
              </strong>
              <div style={{ 
                fontSize: '14px', 
                color: '#333', 
                marginTop: '4px',
                padding: '12px',
                background: '#fff',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
                maxHeight: '200px',
                overflow: 'auto',
                lineHeight: '1.4'
              }}>
                {step.body}
              </div>
            </div>          )}

          {!isPublic && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={onStartEdit}
                style={{
                  background: RBA_GREEN,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Edit Step
              </button>
              <button
                onClick={onDelete}
                style={{
                  background: '#dc3545',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editing Mode */}
      {isExpanded && isEditing && (
        <div style={{ 
          padding: '16px', 
          borderTop: '1px solid #e0e0e0',
          background: '#f8f9fa'
        }}>
          {/* Template Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Email Template:
            </label>
            <select
              value={editData.templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '14px'
              }}
            >
              <option value="">Select template...</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} {template._source === 'public' ? '(Public)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Subject:
            </label>
            <input
              type="text"
              value={editData.subject}
              onChange={(e) => setEditData({ ...editData, subject: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Delay */}
          <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Delay Value:
              </label>
              <input
                type="number"
                value={editData.delay?.value || 0}
                onChange={(e) => setEditData({ 
                  ...editData, 
                  delay: { 
                    ...editData.delay, 
                    value: parseInt(e.target.value) || 0 
                  } 
                })}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Delay Unit:
              </label>
              <select
                value={editData.delay?.unit || 'days'}
                onChange={(e) => setEditData({ 
                  ...editData, 
                  delay: { 
                    ...editData.delay, 
                    unit: e.target.value 
                  } 
                })}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '14px'
                }}
              >
                {delayUnits.map(unit => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={onCancelEdit}
              style={{
                background: '#f5f5f5',
                color: '#666',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                background: RBA_GREEN,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
