import React, { useState, useEffect, useRef } from 'react';
import { createCampaignScheduledEmails } from '../services/email';
import { bulkEnrollOrQueueContacts } from '../services/campaignEnrollments';
import { getCampaignsSplit } from '../services/campaigns';
import { getContact, updateMultipleContactsLastContacted } from '../services/contacts';
import { getTemplatesSplit } from '../services/email';
import { formatTime12Hour } from '../utils/formatTime12Hour';
import { getEnrollmentsForContact } from '../services/campaignEnrollments';
import { addTask } from '../services/tasks';

export default function BulkCampaignAssignModal({ open, contactIds, onClose, onComplete, preSelectedCampaign }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [alreadyEnrolledContacts, setAlreadyEnrolledContacts] = useState([]);
  const [queueIfAlreadyEnrolled, setQueueIfAlreadyEnrolled] = useState(false);
  const [stepDelays, setStepDelays] = useState([]); // [{value, unit, time}]
  const [initialDelay, setInitialDelay] = useState({ value: 1, unit: 'days', time: '09:00' });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [eligibleContacts, setEligibleContacts] = useState([]);
  const [excludedContacts, setExcludedContacts] = useState([]);
  const [initialDate, setInitialDate] = useState('');
  const [initialTime, setInitialTime] = useState('');
  const [templates, setTemplates] = useState([]);
  const [taskStatus, setTaskStatus] = useState('');
  // Accordion open state
  const [accordionOpen, setAccordionOpen] = useState(false);
  // Dropdown state for contact lists
  const [showImmediateList, setShowImmediateList] = useState(false);
  const [showQueuedList, setShowQueuedList] = useState(false);
  const [showExcludedList, setShowExcludedList] = useState(false);
  const [showNoEmailList, setShowNoEmailList] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState({
    showPublic: true,
    showPrivate: true,
    sortBy: 'name' // 'name', 'recent', 'steps'
  });
  const [noEmailTaskDate, setNoEmailTaskDate] = useState('');
  
  // Ref for campaign selector to handle click-outside
  const campaignSelectorRef = useRef(null);
  useEffect(() => {
    if (open) {
      console.log('[BulkCampaignAssignModal] Loading campaigns...');
      getCampaignsSplit().then(({ privateCampaigns, publicCampaigns }) => {
        const allCampaigns = [...privateCampaigns, ...publicCampaigns];
        console.log('[BulkCampaignAssignModal] Campaigns loaded:', {
          private: privateCampaigns.length,
          public: publicCampaigns.length,
          total: allCampaigns.length
        });
        setCampaigns(allCampaigns);
        
        // Set preselected campaign if provided
        if (preSelectedCampaign) {
          // Find the full campaign object from the fetched campaigns
          const fullCampaign = allCampaigns.find(c => c.id === preSelectedCampaign.id) || preSelectedCampaign;
          setSelectedCampaign(fullCampaign);
          initializeStepDelays(fullCampaign);
        }
      }).catch(error => {
        console.error('[BulkCampaignAssignModal] Error loading campaigns:', error);
        setCampaigns([]);
        setStatus('Error loading campaigns: ' + (error.message || error.code || error));
      });
      
      if (!preSelectedCampaign) {
        setSelectedCampaign(null);
      }
      setStatus('');
      setAlreadyEnrolledContacts([]);
      setQueueIfAlreadyEnrolled(false);
      setStepDelays([]);
      // Set initialDelay to current date and time
      const now = new Date();
      const pad = n => n.toString().padStart(2, '0');
      // Set initial date to current date (timezone-safe)
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setInitialDate(`${year}-${month}-${day}`);
      setInitialTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
      setInitialDelay({
        value: 0,
        unit: 'minutes',
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`
      });
      setShowAdvanced(false);
      setEligibleContacts([]);
      setExcludedContacts([]);
    }
  }, [open, preSelectedCampaign]);

  // Click outside handler for campaign dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (campaignSelectorRef.current && !campaignSelectorRef.current.contains(event.target)) {
        setShowCampaignDropdown(false);
      }
    }

    if (showCampaignDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCampaignDropdown]);

  // Fetch contact details and filter out Do Not Email
  useEffect(() => {
    async function filterEligibleContacts() {
      if (!contactIds || contactIds.length === 0) {
        setEligibleContacts([]);
        setExcludedContacts([]);
        return;
      }
      const allContacts = await Promise.all(contactIds.map(id => getContact(id)));
      const eligible = allContacts.filter(c => c && !c.emailOptOut && !c.unsubscribed);
      const excluded = allContacts.filter(c => c && (c.emailOptOut || c.unsubscribed));
      setEligibleContacts(eligible.map(c => c.id));
      setExcludedContacts(excluded.map(c => c.id));
    }
    if (open) filterEligibleContacts();
  }, [contactIds, open]);

  useEffect(() => {
    async function checkAlreadyEnrolled() {
      if (!selectedCampaign || !eligibleContacts.length) {
        setAlreadyEnrolledContacts([]);
        return;
      }
      // Fetch ALL enrollments for eligible contacts (across all campaigns)
      const allEnrollments = [];
      for (const contactId of eligibleContacts) {
        const contactEnrollments = await getEnrollmentsForContact(contactId);
        if (contactEnrollments && contactEnrollments.length > 0) {
          allEnrollments.push({ contactId, enrollments: contactEnrollments });
        }
      }
      // Any contact with at least one active/queued enrollment in any campaign
      const enrolledIds = allEnrollments.filter(e => e.enrollments.some(enr => ['active', 'queued'].includes(enr.status))).map(e => e.contactId);
      setAlreadyEnrolledContacts(enrolledIds);
    }
    checkAlreadyEnrolled();
  }, [selectedCampaign, eligibleContacts]);

  // Load templates when a campaign is selected
  useEffect(() => {
    if (!selectedCampaign) {
      setTemplates([]);
      return;
    }
    getTemplatesSplit().then(({ privateTemplates, publicTemplates }) => {
      // Remove duplicates (user's own template may also be public)
      const privateIds = new Set(privateTemplates.map(t => t.id));
      const mergedTemplates = [
        ...privateTemplates,
        ...publicTemplates.filter(t => !privateIds.has(t.id))
      ];
      setTemplates(mergedTemplates);
    });
  }, [selectedCampaign]);

  // Close campaign dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showCampaignDropdown && !event.target.closest('.campaign-selector')) {
        setShowCampaignDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCampaignDropdown]);

  // Initialize step delays when a campaign is selected
  const initializeStepDelays = (campaign) => {
    if (!campaign || !Array.isArray(campaign.steps) || campaign.steps.length === 0) {
      setStepDelays([]);
      return;
    }
    console.log('[BulkCampaignAssignModal] FIXED: Initializing step delays - campaign has', campaign.steps.length, 'steps');

    // Create N-1 delay entries for the transitions between steps
    const delays = campaign.steps.slice(1).map((step, index) => {
      // Use the delay from the step if it exists, otherwise default
      return step.delay || { value: 7, unit: 'days' };
    });

    console.log(`[BulkCampaignAssignModal] FIXED: Created ${delays.length} delay entries for steps 1-${campaign.steps.length -1}`);
    console.log('[BulkCampaignAssignModal] FIXED: stepDelays array:', delays);
    setStepDelays(delays);
  };

  // New handler for building the step delays array before assignment
  const buildStepDelays = () => {
    console.log('[BulkCampaignAssignModal] FIXED: buildStepDelays - stepDelays array:', stepDelays);
    if (!selectedCampaign || !Array.isArray(selectedCampaign.steps) || !stepDelays) {
      return [];
    }
    console.log('[BulkCampaignAssignModal] FIXED: selectedCampaign steps:', selectedCampaign.steps.length);

    const builtDelays = selectedCampaign.steps.map((step, i) => {
      if (i === 0) {
        // First step uses the main date/time picker
        // Create a full Date object and convert to ISO string for backend
        const [year, month, day] = initialDate.split('-').map(Number);
        const [hours, minutes] = initialTime.split(':').map(Number);
        const fullDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
        
        console.log('[BulkCampaignAssignModal] Creating ISO string for backend:', {
          initialDate,
          initialTime,
          fullDateTime: fullDateTime.toISOString()
        });
        
        return {
          unit: 'custom',
          value: fullDateTime.toISOString(), // Send full ISO string
          time: initialTime, // Keep for legacy compatibility
        };
      }
      // Subsequent steps use the delays from the state
      // Note: stepDelays from state is N-1 length, so we access it with i-1
      return stepDelays[i - 1] || { value: 7, unit: 'days' }; // Fallback
    });
    
    console.log('[BulkCampaignAssignModal] FIXED: Built delays for backend:', builtDelays);
    return builtDelays;
  };

  // Split eligible contacts into immediate and queued groups
  const immediateContacts = eligibleContacts.filter(id => !alreadyEnrolledContacts.includes(id));
  const queuedContacts = alreadyEnrolledContacts;
  // Helper to get contact display names (for list rendering)
  const [contactDetails, setContactDetails] = useState({});

  useEffect(() => {
    async function fetchDetails() {
      const ids = [
        ...eligibleContacts,
        ...excludedContacts
      ];
      if (ids.length === 0) return;
      const details = {};
      await Promise.all(ids.map(async id => {
        try {
          const c = await getContact(id);
          if (c) details[id] = c;
        } catch (error) {
          console.error('Error fetching contact', id, error);
        }
      }));
      setContactDetails(details);
    }
    if (open && (eligibleContacts.length > 0 || excludedContacts.length > 0)) {
      fetchDetails();
    }
  }, [open, eligibleContacts.join(','), excludedContacts.join(',')]);

  // Compute contacts with no email (after contactDetails is available)
  const noEmailContacts = Object.values(contactDetails).filter(
    c => eligibleContacts.includes(c.id) && (!c.email || c.email.trim() === '')
  ).map(c => c.id);
  // Compute immediate contacts that have email addresses
  const immediateContactsWithEmail = immediateContacts.filter(id => {
    const contact = contactDetails[id];
    return contact && contact.email && contact.email.trim() !== '';
  });


  const handleAssign = async () => {
    const contactIdsToAssign = immediateContactsWithEmail;

    console.log('[BulkCampaignAssignModal] handleAssign called', { 
      selectedCampaign: selectedCampaign?.id, 
      eligibleContacts: eligibleContacts.length,
      immediateContacts: immediateContacts.length,
      immediateContactsWithEmail: immediateContactsWithEmail.length,
      contactDetails: Object.keys(contactDetails).length,
      loading,
      buttonDisabled: loading || !selectedCampaign || immediateContactsWithEmail.length === 0
    });
    
    if (!selectedCampaign) {
      setStatus('Error: No campaign selected.');
      console.log('[BulkCampaignAssignModal] No campaign selected');
      return;
    }
    
    if (!immediateContactsWithEmail.length) {
      setStatus('Error: No eligible contacts with email addresses to enroll.');
      console.log('[BulkCampaignAssignModal] No eligible contacts with email');
      return;
    }
    
    setLoading(true);
    setStatus('Assigning...');

    const finalStepDelays = buildStepDelays();

    const options = {
      queueIfAlreadyEnrolled: false, // Default behavior
      stepDelays: finalStepDelays,
      // The initialDate and initialTime are now part of the stepDelays array for step 0
    };

    console.log('[BulkCampaignAssignModal] Calling bulkEnrollOrQueueContacts with:');
    console.log('  campaignId:', selectedCampaign.id);
    console.log('  contactIds:', contactIdsToAssign);
    console.log('  options:', options);

    try {
      const result = await bulkEnrollOrQueueContacts(selectedCampaign.id, contactIdsToAssign, options);
      console.log('[BulkCampaignAssignModal] bulkEnrollOrQueueContacts result:', result);

      if (result.enrolled && result.enrolled.length > 0) {
        setStatus('Enrollment successful, creating scheduled emails...');
        console.log(`[BulkCampaignAssignModal] Calling createCampaignScheduledEmails for ${result.enrolled.length} enrollments.`);

        const customDelaysByEnrollment = {};
        result.enrolled.forEach(enrollmentId => {
          customDelaysByEnrollment[enrollmentId] = finalStepDelays;
        });

        try {
          await createCampaignScheduledEmails({
            enrollmentIds: result.enrolled,
            customDelaysByEnrollment,
            initialDate,
            initialTime,
            timezoneOffsetMinutes: new Date().getTimezoneOffset()
          });
          console.log('[BulkCampaignAssignModal] createCampaignScheduledEmails successful.');
        } catch (scheduleError) {
          console.error('[BulkCampaignAssignModal] Error creating scheduled emails:', scheduleError);
          setStatus(`Error: Enrollments created, but failed to schedule emails: ${scheduleError.message}`);
        }
      }

      setStatus(`Assigned ${result.enrolled.length} contacts successfully.`);
      if (result.skipped.length > 0) {
        setStatus(prev => `${prev} Skipped ${result.skipped.length} contacts (already enrolled).`);
      }
      if (result.queued.length > 0) {
        setStatus(prev => `${prev} Queued ${result.queued.length} contacts for re-enrollment.`);
      }
      if (result.error) {
        throw new Error(result.error);
      }
      setTimeout(() => {
        onClose(); // Close modal on success
        if (onComplete) onComplete(); // Trigger refresh
      }, 2000);
    } catch (error) {
      setStatus('Error: ' + (error.message || error));
      setLoading(false);
    }
  };

  // Handler for bulk phone call task creation
  async function handleBulkPhoneTask() {
    setTaskStatus('');
    if (!noEmailTaskDate) return;
    try {
      setTaskStatus('Adding tasks...');
      await Promise.all(
        noEmailContacts.map(async (id) => {
          await addTask({
            contactId: id,
            type: 'Phone Call',
            dueDate: new Date(noEmailTaskDate),
            notes: 'No Email - Bulk Task',
            completed: false,
          });
        })
      );
      setTaskStatus('Tasks added!');
    } catch (e) {
      setTaskStatus('Error adding tasks.');
    }
  }

  // Helper to highlight search terms in text
  function highlightSearchTerms(text, searchTerm) {
    if (!searchTerm || !text) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} style={{ backgroundColor: '#fff59d', fontWeight: 600 }}>
          {part}
        </span>
      ) : part
    );
  }

  // Helper to get contact display name
  function getContactDisplayName(c) {
    if (!c) return '';
    if (c.firstName || c.lastName) return `${c.firstName || ''} ${c.lastName || ''}`.trim();
    if (c.email) return c.email;
    return c.id;
  }

  // Accordion for advanced options
  const renderAdvancedAccordion = () => (
    <div style={{ marginBottom: 16, border: '1px solid #eee', borderRadius: 8 }}>
      <div
        style={{ cursor: 'pointer', padding: 12, background: '#f7f7f7', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center' }}
        onClick={() => setShowAdvanced(v => !v)}
      >
        <span style={{ marginRight: 8 }}>{showAdvanced ? '▼' : '▶'}</span>
        Advanced Options (Edit Step Delays)
      </div>
      {showAdvanced && (
        <div style={{ padding: 12, background: '#fafafa', borderRadius: 8, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          {selectedCampaign && selectedCampaign.steps && selectedCampaign.steps.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <b>Edit Step Delays:</b>
              <p style={{ fontSize: '0.9em', color: '#666', margin: '4px 0 8px 0' }}>
                Configure delays between email steps. Step 1 timing is set above.
              </p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {selectedCampaign.steps.slice(1).map((step, delayIdx) => {
                  const stepIdx = delayIdx + 1; // Actual step index (1, 2, 3...)
                  let stepSubject = step.subject;
                  if ((!stepSubject || stepSubject === '(no subject)') && step.templateId && templates.length > 0) {
                    const template = templates.find(t => t.id === step.templateId);
                    stepSubject = template?.subject || template?.name || '(no subject)';
                  }
                  return (
                    <li key={stepIdx} style={{ marginBottom: 8 }}>
                      Delay before Step {stepIdx + 1}: <span style={{fontWeight:600}}>{stepSubject || '(no subject)'}</span><br />
                      <input
                        type="number"
                        min={0}
                        value={stepDelays[delayIdx]?.value || step.delay?.value || 1}
                        onChange={e => setStepDelays(prev => {
                          const arr = [...prev];
                          arr[delayIdx] = { ...arr[delayIdx], value: Number(e.target.value) };
                          console.log(`[BulkCampaignAssignModal] FIXED: Delay ${delayIdx} (before step ${stepIdx + 1}) value changed to:`, Number(e.target.value));
                          console.log('[BulkCampaignAssignModal] FIXED: Updated stepDelays:', JSON.stringify(arr, null, 2));
                          return arr;
                        })}
                        style={{ width: 60, marginRight: 8 }}
                      />
                      <select
                        value={stepDelays[delayIdx]?.unit || step.delay?.unit || 'days'}
                        onChange={e => setStepDelays(prev => {
                          const arr = [...prev];
                          arr[delayIdx] = { ...arr[delayIdx], unit: e.target.value };
                          console.log(`[BulkCampaignAssignModal] FIXED: Delay ${delayIdx} (before step ${stepIdx + 1}) unit changed to:`, e.target.value);
                          console.log('[BulkCampaignAssignModal] FIXED: Updated stepDelays:', JSON.stringify(arr, null, 2));
                          return arr;
                        })}
                        style={{ marginRight: 8 }}
                      >
                        <option value="minutes">minutes</option>
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                        <option value="months">months</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {selectedCampaign && alreadyEnrolledContacts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <b>Initial Delay for Queued Contacts:</b><br />
              <input
                type="number"
                min={0}
                value={initialDelay.value}
                onChange={e => setInitialDelay(prev => ({ ...prev, value: Number(e.target.value) }))
                }
                style={{ width: 60, marginRight: 8 }}
              />
              <select
                value={initialDelay.unit}
                onChange={e => setInitialDelay(prev => ({ ...prev, unit: e.target.value }))}
                style={{ marginRight: 8 }}
              >
                <option value="minutes">minutes</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
              {/* No separate time picker for queued contacts; use initialTime for all */}
              <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>Queued contacts will start at <b>{initialTime}</b> after their delay.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
  
  // Debug logging
  console.log('[BulkCampaignAssignModal] Contact filtering:', {
    eligibleContacts: eligibleContacts.length,
    immediateContacts: immediateContacts.length,
    contactDetailsKeys: Object.keys(contactDetails).length,
    immediateContactsWithEmail: immediateContactsWithEmail.length,
    contactDetails: Object.values(contactDetails).slice(0, 3).map(c => ({ id: c.id, email: c.email }))
  });

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      background: '#0008', 
      zIndex: 1000, 
      display: 'flex', 
      alignItems: showCampaignDropdown ? 'flex-start' : 'center', // Align to top when dropdown is open
      justifyContent: 'center',
      paddingTop: showCampaignDropdown ? '1vh' : '0', // Reduced padding to give more space
      transition: 'all 0.3s ease-in-out',
      boxSizing: 'border-box'
    }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 0,
          width: 750, // was 500
          maxWidth: '98vw',
          height: showCampaignDropdown ? '90vh' : 'auto', // Larger height when dropdown is open
          maxHeight: showCampaignDropdown ? '90vh' : '90vh', 
          minHeight: 120,
          boxShadow: '0 2px 8px #0002',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s ease-in-out', // Smooth transition
        }}
      >
        <div
          style={{
            padding: 32,
            overflowY: 'auto',
            height: showCampaignDropdown ? 'calc(90vh - 64px)' : 'auto', // Match the modal height
            maxHeight: showCampaignDropdown ? 'calc(90vh - 64px)' : 'calc(90vh - 64px)', 
            minHeight: 120,
            boxSizing: 'border-box',
          }}
        >
          <h3>Assign {contactIds.length} Contacts to Campaign</h3>
          <div style={{ marginBottom: 16 }}>
            {/* Enhanced Campaign Selector */}
            <div className="campaign-selector" style={{ position: 'relative' }} ref={campaignSelectorRef}>
              {/* Search Input */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder={selectedCampaign ? selectedCampaign.name : (campaigns.length === 0 ? 'Loading campaigns...' : `Search ${campaigns.length} campaigns by name, description, or purpose...`)}
                  value={campaignSearch}
                  onChange={e => {
                    setCampaignSearch(e.target.value);
                    setShowCampaignDropdown(true);
                  }}
                  onFocus={() => setShowCampaignDropdown(true)}
                  onKeyDown={e => {
                    // Handle keyboard navigation
                    if (e.key === 'Escape') {
                      setShowCampaignDropdown(false);
                      setCampaignSearch('');
                    } else if (e.key === 'ArrowDown' && !showCampaignDropdown) {
                      setShowCampaignDropdown(true);
                    }
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '12px 40px 12px 40px', // Space for search icon
                    borderRadius: 6, 
                    border: '1px solid #ddd',
                    fontSize: 14,
                    fontWeight: selectedCampaign ? 600 : 400,
                    boxSizing: 'border-box'
                  }}
                  disabled={campaigns.length === 0}
                />
                {/* Search Icon */}
                <div style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#666',
                  fontSize: 14,
                  pointerEvents: 'none'
                }}>
                  🔍
                </div>
              </div>
              <div 
                style={{ 
                  position: 'absolute', 
                  right: 12, 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#666'
                }}
                onClick={() => setShowCampaignDropdown(!showCampaignDropdown)}
              >
                {showCampaignDropdown ? '▲' : '▼'}
              </div>
              
              {showCampaignDropdown && campaigns.length > 0 && (
                <div style={{ 
                  position: 'absolute', 
                  top: '100%', 
                  left: 0, 
                  right: 0, 
                  background: 'white', 
                  border: '1px solid #ddd', 
                  borderTop: 'none',
                  borderRadius: '0 0 6px 6px',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  height: '60vh', // Set explicit height instead of maxHeight
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {/* Quick Select Section - show when no search and dropdown first opens */}
                  {!campaignSearch && campaigns.length > 0 && (
                    <div style={{
                      padding: '12px 16px',
                      background: '#f8fffe',
                      borderBottom: '1px solid #e0f2f1'
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#00695c', marginBottom: 8 }}>
                        QUICK SELECT
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(() => {
                          // Show recently updated campaigns or most used
                          const quickCampaigns = [...campaigns]
                            .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
                            .slice(0, 3);
                          
                          return quickCampaigns.map(c => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedCampaign(c);
                                initializeStepDelays(c);
                                setShowCampaignDropdown(false);
                                setAccordionOpen(true);
                              }}
                              style={{
                                fontSize: 11,
                                padding: '4px 8px',
                                background: '#e0f2f1',
                                border: '1px solid #4caf50',
                                borderRadius: 12,
                                color: '#2e7d32',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                maxWidth: '150px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={c.name}
                            >
                              {c.name.length > 20 ? `${c.name.substring(0, 20)}...` : c.name}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                  
                  {/* Filter Controls */}
                  <div style={{ 
                    padding: 12, 
                    borderBottom: '1px solid #eee',
                    background: '#f8f9fa',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}>
                    {/* Public/Private Toggle */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Show:</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={campaignFilter.showPrivate}
                          onChange={e => setCampaignFilter(prev => ({ ...prev, showPrivate: e.target.checked }))}
                          style={{ margin: 0 }}
                        />
                        Private
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={campaignFilter.showPublic}
                          onChange={e => setCampaignFilter(prev => ({ ...prev, showPublic: e.target.checked }))}
                          style={{ margin: 0 }}
                        />
                        Public
                      </label>
                    </div>
                    
                    {/* Sort Options */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Sort:</span>
                      <select
                        value={campaignFilter.sortBy}
                        onChange={e => setCampaignFilter(prev => ({ ...prev, sortBy: e.target.value }))}
                        style={{ 
                          fontSize: 12, 
                          padding: '2px 6px',
                          border: '1px solid #ddd',
                          borderRadius: 3,
                          background: 'white'
                        }}
                      >
                        <option value="name">A-Z</option>
                        <option value="recent">Most Recent</option>
                        <option value="steps">Step Count</option>
                      </select>
                    </div>
                    
                    {/* Clear Filters */}
                    {(campaignSearch || !campaignFilter.showPrivate || !campaignFilter.showPublic) && (
                      <button
                        onClick={() => {
                          setCampaignSearch('');
                          setCampaignFilter({ showPublic: true, showPrivate: true, sortBy: 'name' });
                        }}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          background: '#e3f2fd',
                          border: '1px solid #2196f3',
                          borderRadius: 12,
                          color: '#1976d2',
                          cursor: 'pointer'
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  
                  {/* Campaign Results */}
                  <div style={{ 
                    overflowY: 'auto',
                    flex: 1, // Take up remaining space
                    minHeight: '300px' // Ensure good minimum height for visibility
                  }}>
                    {(() => {
                      // Filter campaigns
                      let filteredCampaigns = campaigns.filter(c => {
                        // Search filter
                        const searchMatch = !campaignSearch || 
                          c.name.toLowerCase().includes(campaignSearch.toLowerCase()) || 
                          c.description?.toLowerCase().includes(campaignSearch.toLowerCase()) ||
                          c.purpose?.toLowerCase().includes(campaignSearch.toLowerCase()) ||
                          c.keywords?.some(k => k.toLowerCase().includes(campaignSearch.toLowerCase()));
                        
                        // Public/Private filter
                        const typeMatch = (c.public && campaignFilter.showPublic) || (!c.public && campaignFilter.showPrivate);
                        
                        return searchMatch && typeMatch;
                      });
                      
                      // Sort campaigns
                      filteredCampaigns.sort((a, b) => {
                        switch (campaignFilter.sortBy) {
                          case 'recent':
                            const aDate = a.updatedAt || a.createdAt || 0;
                            const bDate = b.updatedAt || b.createdAt || 0;
                            return new Date(bDate) - new Date(aDate);
                          case 'steps':
                            return (b.steps?.length || 0) - (a.steps?.length || 0);
                          case 'name':
                          default:
                            return a.name.localeCompare(b.name);
                        }
                      });
                      
                      // Show results
                      if (filteredCampaigns.length === 0) {
                        return (
                          <div style={{ 
                            padding: 20, 
                            textAlign: 'center', 
                            color: '#666',
                            fontSize: 14
                          }}>
                            {campaignSearch ? (
                              <div>
                                <div style={{ marginBottom: 8 }}>
                                  No campaigns found matching <strong>"{campaignSearch}"</strong>
                                </div>
                                <div style={{ fontSize: 12, color: '#999' }}>
                                  Try adjusting your search or check the filter settings above
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ marginBottom: 8 }}>
                                  No campaigns match your current filters
                                </div>
                                <div style={{ fontSize: 12, color: '#999' }}>
                                  Try enabling both Public and Private campaigns
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      return filteredCampaigns.slice(0, 100).map(c => ( // Increased from 50 to 100 results for better discovery
                        <div
                          key={c.id}
                          style={{ 
                            padding: '8px 16px', // Reduced from 12px to 8px for more compact layout
                            cursor: 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                            backgroundColor: selectedCampaign?.id === c.id ? '#e3f2fd' : 'white',
                            transition: 'all 0.2s ease',
                            borderLeft: selectedCampaign?.id === c.id ? '3px solid #2196f3' : '3px solid transparent'
                          }}
                          onMouseEnter={e => {
                            if (selectedCampaign?.id !== c.id) {
                              e.target.style.backgroundColor = '#f5f5f5';
                              e.target.style.transform = 'translateX(2px)';
                            }
                          }}
                          onMouseLeave={e => {
                            e.target.style.backgroundColor = selectedCampaign?.id === c.id ? '#e3f2fd' : 'white';
                            e.target.style.transform = 'translateX(0)';
                          }}
                          onClick={() => {
                            setSelectedCampaign(c);
                            initializeStepDelays(c);
                            setCampaignSearch('');
                            setShowCampaignDropdown(false);
                            setAccordionOpen(true);
                          }}
                        >
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'flex-start',
                            marginBottom: 2 // Reduced from 4px to 2px
                          }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#333', flex: 1 }}>
                              {campaignSearch ? highlightSearchTerms(c.name, campaignSearch) : c.name}
                            </div>
                            <div style={{
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center'
                            }}>
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 8,
                                background: c.public ? '#e8f5e8' : '#f0f0f0',
                                color: c.public ? '#2e7d32' : '#666',
                                fontWeight: 600
                              }}>
                                {c.public ? 'PUBLIC' : 'PRIVATE'}
                              </span>
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 8,
                                background: '#e3f2fd',
                                color: '#1976d2',
                                fontWeight: 600
                              }}>
                                {c.steps?.length || 0} STEPS
                              </span>
                            </div>
                          </div>
                          
                          {c.description && (
                            <div style={{ 
                              fontSize: 12, 
                              color: '#666', 
                              marginBottom: 2, // Reduced from 4px to 2px
                              lineHeight: 1.3
                            }}>
                              {(() => {
                                const desc = c.description.length > 60 ? `${c.description.substring(0, 60)}...` : c.description;
                                return campaignSearch ? highlightSearchTerms(desc, campaignSearch) : desc;
                              })()}
                            </div>
                          )}
                          
                          {c.purpose && (
                            <div style={{ 
                              fontSize: 11, 
                              color: '#999',
                              fontStyle: 'italic'
                            }}>
                              Purpose: {c.purpose}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                  
                  {/* Results Summary */}
                  <div style={{
                    padding: '8px 16px',
                    background: '#f8f9fa',
                    borderTop: '1px solid #eee',
                    fontSize: 11,
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    {(() => {
                      const total = campaigns.length;
                      const filtered = campaigns.filter(c => {
                        const searchMatch = !campaignSearch || 
                          c.name.toLowerCase().includes(campaignSearch.toLowerCase()) || 
                          c.description?.toLowerCase().includes(campaignSearch.toLowerCase()) ||
                          c.purpose?.toLowerCase().includes(campaignSearch.toLowerCase()) ||
                          c.keywords?.some(k => k.toLowerCase().includes(campaignSearch.toLowerCase()));
                        const typeMatch = (c.public && campaignFilter.showPublic) || (!c.public && campaignFilter.showPrivate);
                        return searchMatch && typeMatch;
                      }).length;
                      
                      if (filtered === total) {
                        return `Showing all ${total} campaigns`;
                      } else if (filtered > 100) {
                        return `Showing first 100 of ${filtered} matches (${total} total campaigns)`;
                      } else {
                        return `Showing ${filtered} of ${total} campaigns`;
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
            {campaigns.length === 0 && (
              <div style={{ color: '#888', fontSize: 14, marginTop: 8 }}>
                {status.startsWith('Error') ? 
                  `⚠️ ${status}` : 
                  'No campaigns available. Create a campaign first, or check your permissions.'
                }
              </div>
            )}
          </div>
          {/* Accordion for campaign details */}
          <div style={{ maxHeight: accordionOpen ? 1000 : 0, overflow: 'hidden', transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1)' }}>
          {selectedCampaign && (
            <>
              {/* Immediate Group Section - only show if there are immediate contacts */}
              {immediateContactsWithEmail.length > 0 && (
                <div style={{ background: '#e6f7ea', borderRadius: 8, padding: 18, marginBottom: 18, border: '1px solid #b7eb8f' }}>
                  <h4 style={{ margin: 0 }}>{immediateContactsWithEmail.length} Contact{immediateContactsWithEmail.length !== 1 ? 's' : ''} Scheduled for Enrollment <span role="img" aria-label="check">✅</span></h4>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, marginRight: 8 }}>List of Contacts</span>
                    <span style={{ cursor: 'pointer' }} onClick={() => setShowImmediateList(v => !v)}>
                      {showImmediateList ? '▼' : '▶'}
                    </span>
                  </div>
                  {showImmediateList && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 15, color: '#222', margin: '8px 0 8px 0', border: '1px solid #b7eb8f', borderRadius: 6, background: '#f6ffed', padding: 8 }}>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {[...immediateContactsWithEmail]
                          .map(id => getContactDisplayName(contactDetails[id]))
                          .sort((a, b) => a.localeCompare(b))
                          .map((name, idx) => (
                            <li key={idx} style={{ padding: '2px 0' }}>{name}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <label style={{ display: 'block', marginBottom: 6, marginTop: 8 }}>
                    Start Date/Time:
                    <input type="date" value={initialDate} onChange={e => setInitialDate(e.target.value)} style={{ marginLeft: 8, marginRight: 8 }} />
                    <input type="time" value={initialTime} onChange={e => { setInitialTime(e.target.value); setInitialDelay(d => ({ ...d, time: e.target.value })); }} />
                  </label>
                </div>
              )}
              {/* Queued Group Section - only show if there are queued contacts */}
              {queuedContacts.length > 0 && (
                <div style={{ background: '#fffbe6', borderRadius: 8, padding: 18, marginBottom: 18, border: '1px solid #ffe58f' }}>
                  <h4 style={{ margin: 0 }}>{queuedContacts.length} Contact{queuedContacts.length !== 1 ? 's' : ''} Queued after Current Campaign <span role="img" aria-label="hourglass">⏳</span></h4>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, marginRight: 8 }}>List of Contacts</span>
                    <span style={{ cursor: 'pointer' }} onClick={() => setShowQueuedList(v => !v)}>
                      {showQueuedList ? '▼' : '▶'}
                    </span>
                  </div>
                  {showQueuedList && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 15, color: '#222', margin: '8px 0 8px 0', border: '1px solid #ffe58f', borderRadius: 6, background: '#fffbe6', padding: 8 }}>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {[...queuedContacts]
                        .map(id => getContactDisplayName(contactDetails[id]))
                        .sort((a, b) => a.localeCompare(b))
                        .map((name, idx) => (
                          <li key={idx} style={{ padding: '2px 0' }}>{name}</li>
                        ))}
                    </ul>
                  </div>
                  )}
                  <label style={{ display: 'block', marginBottom: 6, marginTop: 8 }}>
                    Delay after last active campaign:
                    <input type="number" min={0} value={initialDelay.value} onChange={e => setInitialDelay(prev => ({ ...prev, value: Number(e.target.value) }))} style={{ width: 60, marginLeft: 8, marginRight: 8 }} />
                    <select value={initialDelay.unit} onChange={e => setInitialDelay(prev => ({ ...prev, unit: e.target.value }))} style={{ marginRight: 8 }}>
                      <option value="minutes">minutes</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                    </select>
                    <br />
                    <span style={{ display: 'inline-block', marginTop: 6 }}>Send time:</span>
                    <input type="time" value={initialDelay.time} onChange={e => setInitialDelay(prev => ({ ...prev, time: e.target.value }))} style={{ marginLeft: 8 }} />
                  </label>
                  {immediateContacts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <label>
                        <input type="checkbox" checked={queueIfAlreadyEnrolled === false ? false : queueIfAlreadyEnrolled} onChange={e => setQueueIfAlreadyEnrolled(e.target.checked)} />
                        {' '}Omit these contacts from assignment
                      </label>
                    </div>
                  )}
                </div>
              )}
          {/* Excluded/Unsubscribed Group Section - only show if there are excluded contacts */}
          {excludedContacts.length > 0 && (
            <div style={{ background: '#fff1f0', borderRadius: 8, padding: 18, marginBottom: 18, border: '1px solid #ffa39e' }}>
              <h4 style={{ margin: 0 }}>{excludedContacts.length} Contact{excludedContacts.length !== 1 ? 's' : ''} Will Not Be Scheduled (Unsubscribed/Do Not Email) <span role="img" aria-label="no-email">🚫</span></h4>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, marginRight: 8 }}>List of Contacts</span>
                <span style={{ cursor: 'pointer' }} onClick={() => setShowExcludedList(v => !v)}>
                  {showExcludedList ? '▼' : '▶'}
                </span>
              </div>
              {showExcludedList && (
                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 15, color: '#222', margin: '8px 0 8px 0', border: '1px solid #ffa39e', borderRadius: 6, background: '#fff1f0', padding: 8 }}>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {[...excludedContacts]
                      .map(id => getContactDisplayName(contactDetails[id]))
                      .sort((a, b) => a.localeCompare(b))
                      .map((name, idx) => (
                        <li key={idx} style={{ padding: '2px 0' }}>{name}</li>
                      ))}
                  </ul>
                </div>
              )}
              <div style={{ color: '#d32f2f', fontSize: 13, marginTop: 8 }}>These contacts are unsubscribed or on your Do Not Email list and will not be scheduled.</div>
            </div>
          )}
          {/* No Email Group Section - only show if there are contacts with no email */}
          {noEmailContacts.length > 0 && (
            <div style={{ background: '#f0f5ff', borderRadius: 8, padding: 18, marginBottom: 18, border: '1px solid #adc6ff' }}>
              <h4 style={{ margin: 0 }}>{noEmailContacts.length} Contact{noEmailContacts.length !== 1 ? 's' : ''} Not Assigned (No Email Address) <span role="img" aria-label="no-email">📞</span></h4>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, marginRight: 8 }}>List of Contacts</span>
                <span style={{ cursor: 'pointer' }} onClick={() => setShowNoEmailList(v => !v)}>
                  {showNoEmailList ? '▼' : '▶'}
                </span>
              </div>
              {showNoEmailList && (
                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 15, color: '#222', margin: '8px 0 8px 0', border: '1px solid #adc6ff', borderRadius: 6, background: '#f0f5ff', padding: 8 }}>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {noEmailContacts
                      .map(id => getContactDisplayName(contactDetails[id]))
                      .sort((a, b) => a.localeCompare(b))
                      .map((name, idx) => (
                        <li key={idx} style={{ padding: '2px 0' }}>{name}</li>
                      ))}
                  </ul>
                </div>
              )}
              <div style={{ color: '#2f54eb', fontSize: 13, marginTop: 8 }}>These contacts do not have an email address and will not be assigned. <br />
                <span style={{ fontWeight: 600 }}>Bulk Add Phone Call Task:</span>
                <input type="date" value={noEmailTaskDate} onChange={e => setNoEmailTaskDate(e.target.value)} style={{ marginLeft: 8, marginRight: 8 }} />
                <button style={{ background: '#2f54eb', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 16px', fontWeight: 600 }}
                  onClick={handleBulkPhoneTask}
                  disabled={!noEmailTaskDate || !noEmailContacts.length}
                >Add Task</button>
                {taskStatus && <span style={{ marginLeft: 12, color: taskStatus.startsWith('Error') ? 'red' : '#5BA150' }}>{taskStatus}</span>}
              </div>
            </div>
          )}
              {/* Summary Section */}
              <div style={{ marginBottom: 16, background: '#f6f6f6', border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
                <b>Summary:</b> Enrolling <b>{immediateContacts.length}</b> immediately, queuing <b>{queuedContacts.length}</b> for later.
              </div>
              {/* Advanced Options Accordion */}
              <div style={{ marginBottom: 16, border: '1px solid #eee', borderRadius: 8 }}>
                <div
                  style={{ cursor: 'pointer', padding: 12, background: '#f7f7f7', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center' }}
                  onClick={() => setShowAdvanced(v => !v)}
                >
                  <span style={{ marginRight: 8 }}>{showAdvanced ? '▼' : '▶'}</span>
                  Advanced Options (Edit Step Delays)
                </div>
                {showAdvanced && (
                  <div style={{ padding: 12, background: '#fafafa', borderRadius: 8, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                    {selectedCampaign && selectedCampaign.steps && selectedCampaign.steps.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <b>Edit Step Delays:</b>
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                          {selectedCampaign.steps.map((step, idx) => {
                            let stepSubject = step.subject;
                            
                            // If no subject, try to get it from template
                            if ((!stepSubject || stepSubject === '(no subject)') && step.templateId && templates.length > 0) {
                              const template = templates.find(t => t.id === step.templateId);
                              stepSubject = template?.subject || template?.name || '(no subject)';
                            }
                            
                            // If still no subject, extract first line from body as fallback
                            if (!stepSubject || stepSubject === '(no subject)') {
                              if (step.body && typeof step.body === 'string') {
                                const firstLine = step.body.split('\n')[0].trim();
                                stepSubject = firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : '');
                              } else {
                                stepSubject = `Step ${idx + 1}`;
                              }
                            }
                            
                            // Remove template variables from display
                            if (stepSubject) {
                              stepSubject = stepSubject.replace(/\{\{[^}]+\}\}/g, '...');
                            }
                            
                            const isLastStep = idx === selectedCampaign.steps.length - 1;
                            
                            return (
                              <li key={idx} style={{ marginBottom: 8 }}>
                                Step {idx + 1}: <span style={{fontWeight:600}}>{stepSubject || '(no subject)'}</span><br />
                                {idx === 0 ? (
                                  <span style={{ color: '#888', fontSize: 13 }}>Start date/time</span>
                                ) : null}
                                
                                {/* Show delay input for transitions from current step to next step */}
                                {idx > 0 && (
                                  <div style={{ marginTop: 4 }}>
                                    <span style={{ fontSize: 13, color: '#666' }}>
                                      Delay from Step {idx} to Step {idx + 1}:
                                    </span><br />
                                    <input
                                      type="number"
                                      min={0}
                                      value={stepDelays[idx - 1]?.value || step.delay?.value || 1}
                                      onChange={e => setStepDelays(prev => {
                                        const arr = [...prev];
                                        // idx-1 because stepDelays[0] represents delay from step 0 to step 1
                                        const delayIndex = idx - 1;
                                        arr[delayIndex] = { ...arr[delayIndex], value: Number(e.target.value) };
                                        console.log(`[BulkCampaignAssignModal] Delay from Step ${idx} to Step ${idx + 1} value changed to:`, Number(e.target.value));
                                        console.log('[BulkCampaignAssignModal] Updated stepDelays:', JSON.stringify(arr, null, 2));
                                        return arr;
                                      })}
                                      style={{ width: 60, marginRight: 8 }}
                                    />
                                    <select
                                      value={stepDelays[idx - 1]?.unit || step.delay?.unit || 'days'}
                                      onChange={e => setStepDelays(prev => {
                                        const arr = [...prev];
                                        // idx-1 because stepDelays[0] represents delay from step 0 to step 1
                                        const delayIndex = idx - 1;
                                        arr[delayIndex] = { ...arr[delayIndex], unit: e.target.value };
                                        console.log(`[BulkCampaignAssignModal] Delay from Step ${idx} to Step ${idx + 1} unit changed to:`, e.target.value);
                                        console.log('[BulkCampaignAssignModal] Updated stepDelays:', JSON.stringify(arr, null, 2));
                                        return arr;
                                      })}
                                      style={{ marginRight: 8 }}
                                    >
                                      <option value="minutes">minutes</option>
                                      <option value="days">days</option>
                                      <option value="weeks">weeks</option>
                                      <option value="months">months</option>
                                    </select>
                                  </div>
                                )}
                                
                                {/* Show final step message */}
                                {isLastStep && (
                                  <span style={{ color: '#888', fontSize: 13 }}>Final step</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          </div>
          {status && <div style={{ color: status.startsWith('Error') ? 'red' : '#5BA150', marginBottom: 12 }}>{status}</div>}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={onClose} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Cancel</button>
            <button onClick={handleAssign} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }} disabled={loading || !selectedCampaign || immediateContactsWithEmail.length === 0}>Assign</button>
          </div>
        </div>
      </div>
    </div>
  );
}
