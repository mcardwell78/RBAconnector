import React, { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { createCampaignScheduledEmails } from '../services/email';
import { fromZonedTime } from 'date-fns-tz';

// Unified modal for assigning a single contact to a campaign (from Contact Details)
export default function CampaignAssignContacts({ contactId, onSave, onCancel, campaignId, assignedContacts, allowStepDelayEdit }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [pendingCampaign, setPendingCampaign] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [reEnrollPrompt, setReEnrollPrompt] = useState(null); // { completed, incomplete, lastStep }
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [assignmentComplete, setAssignmentComplete] = useState(false);
  const [checkingEnrollment, setCheckingEnrollment] = useState(false);
  const [reEnrollCampaign, setReEnrollCampaign] = useState(null);
  const [assignmentCampaign, setAssignmentCampaign] = useState(null);
  const [customDelays, setCustomDelays] = useState({}); // { stepIndex: { value, unit, time } }
  const [templates, setTemplates] = useState([]);
  const [campaignUsageCounts, setCampaignUsageCounts] = useState({});
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Helper to fully reset modal state (for error recovery)
  const resetState = () => {
    setStatus('');
    setSelectedCampaign(null);
    setPendingCampaign(null);
    setReEnrollPrompt(null);
    setReEnrollCampaign(null);
    setCheckingEnrollment(false);
    setLoading(false);
    setAssignmentComplete(false);
    setAssignmentCampaign(null);
  };

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setStatus('You are not logged in or your session has expired. Please log in again.');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Load campaigns on mount
    import('../services/campaigns').then(mod =>
      mod.getCampaignsSplit().then(({ privateCampaigns, publicCampaigns }) => {
        setCampaigns([...privateCampaigns, ...publicCampaigns]);
      })
    );
  }, []);

  // Fetch templates when a campaign is selected
  useEffect(() => {
    if (!selectedCampaign) return;
    import('../services/email').then(mod =>
      mod.getTemplatesSplit().then(({ privateTemplates, publicTemplates }) => {
        // Remove duplicates (user's own template may also be public)
        const privateIds = new Set(privateTemplates.map(t => t.id));
        const mergedTemplates = [
          ...privateTemplates,
          ...publicTemplates.filter(t => !privateIds.has(t.id))
        ];
        setTemplates(mergedTemplates);
      })
    );
  }, [selectedCampaign]);

  // Defensive: Check for existing enrollment when a campaign is selected
  useEffect(() => {
    if (!selectedCampaign || !firebaseUser) return;
    setCheckingEnrollment(true);
    import('../services/campaignEnrollments').then(mod =>
      mod.getEnrollmentsForCampaign(selectedCampaign.id).then(enrollments => {
        // Find all enrollments for this contact
        const contactEnrollments = enrollments.filter(e => e.contactId === contactId);
        // Find the most recent historical enrollment (withdrawn or completed)
        let mostRecent = null;
        if (contactEnrollments.length > 0) {
          mostRecent = contactEnrollments.reduce((a, b) => (a.createdAt?.seconds > b.createdAt?.seconds ? a : b));
        }
        // If any enrollment is completed or withdrawn, show re-enroll/resume prompt
        if (contactEnrollments.some(e => e.status === 'withdrawn')) {
          setReEnrollPrompt({
            mode: 'resume',
            lastStep: mostRecent?.currentStep || 0,
            completed: contactEnrollments.filter(e => e.status === 'completed').length,
            incomplete: contactEnrollments.filter(e => e.status === 'withdrawn').length
          });
        } else if (contactEnrollments.some(e => e.status === 'completed')) {
          setReEnrollPrompt({
            mode: 'restart',
            lastStep: 0,
            completed: contactEnrollments.filter(e => e.status === 'completed').length,
            incomplete: contactEnrollments.filter(e => e.status === 'withdrawn').length
          });
        } else {
          setReEnrollPrompt(null);
        }
        setCheckingEnrollment(false);
      })
    ).catch(() => setCheckingEnrollment(false));
  }, [selectedCampaign, firebaseUser, contactId]);

  // Fetch campaign usage counts for this contact
  useEffect(() => {
    if (!campaigns.length || !contactId) return;
    let isMounted = true;
    import('../services/campaignEnrollments').then(mod =>
      Promise.all(campaigns.map(campaign =>
        mod.getEnrollmentsForCampaign(campaign.id)
      )).then(allEnrollments => {
        if (!isMounted) return;
        const counts = {};
        allEnrollments.forEach((enrollments, idx) => {
          // Count ALL enrollments for this contact/campaign (any status)
          counts[campaigns[idx].id] = enrollments.filter(e => e.contactId === contactId).length;
        });
        setCampaignUsageCounts(counts);
      })
    );
    return () => { isMounted = false; };
  }, [campaigns, contactId]);

  // Enhanced search filter
  const filteredCampaigns = campaigns.filter(campaign => {
    const author = campaign.author || '';
    const isPublic = campaign.public ? 'public' : 'private';
    const keywords = (campaign.keywords || []).join(' ');
    const text = [campaign.name, campaign.description, author, isPublic, keywords].join(' ').toLowerCase();
    return text.includes(search.toLowerCase());
  });

  // Handler for campaign selection (with async re-enroll check)
  const handleSelectCampaign = async (campaign) => {
    if (assignmentComplete || loading) return;
    setStatus('');
    setSelectedCampaign(null); // Prevent UI flicker
    setPendingCampaign(campaign);
    setReEnrollPrompt(null);
    setReEnrollCampaign(null);
    setCheckingEnrollment(true);
    setAssignmentComplete(false);
    setAssignmentCampaign(null);
    // Check for historical enrollments for this contact/campaign
    const mod = await import('../services/campaignEnrollments');
    const enrollments = await mod.getEnrollmentsForCampaign(campaign.id);
    const contactEnrollments = enrollments.filter(e => e.contactId === contactId);
    let mostRecent = null;
    if (contactEnrollments.length > 0) {
      mostRecent = contactEnrollments.reduce((a, b) => (a.createdAt?.seconds > b.createdAt?.seconds ? a : b));
    }
    // If any enrollment is completed or withdrawn, show re-enroll/resume prompt
    if (contactEnrollments.some(e => e.status === 'withdrawn')) {
      setReEnrollPrompt({
        mode: 'resume',
        lastStep: mostRecent?.currentStep || 0,
        completed: contactEnrollments.filter(e => e.status === 'completed').length,
        incomplete: contactEnrollments.filter(e => e.status === 'withdrawn').length
      });
      setSelectedCampaign(campaign);
      setPendingCampaign(null);
      setCheckingEnrollment(false);
      return;
    } else if (contactEnrollments.some(e => e.status === 'completed')) {
      setReEnrollPrompt({
        mode: 'restart',
        lastStep: 0,
        completed: contactEnrollments.filter(e => e.status === 'completed').length,
        incomplete: contactEnrollments.filter(e => e.status === 'withdrawn').length
      });
      setSelectedCampaign(campaign);
      setPendingCampaign(null);
      setCheckingEnrollment(false);
      return;
    }
    setSelectedCampaign(campaign);
    setPendingCampaign(null);
    setReEnrollPrompt(null);
    setCheckingEnrollment(false);
  };

  // Handler for re-enroll choice
  const handleReEnrollChoice = async (mode) => {
    let campaign = reEnrollCampaign;
    if (!campaign) {
      campaign = assignmentCampaign || selectedCampaign;
      setReEnrollCampaign(campaign);
    }
    if (!campaign) {
      setStatus('No campaign selected. Please select a campaign first.');
      setReEnrollPrompt(null);
      setSelectedCampaign(null);
      return;
    }
    // Always pass reEnrollArg as { [contactId]: { mode } }
    const reEnrollArg = { [contactId]: { mode: String(mode), lastStep: reEnrollPrompt?.lastStep || 0 } };
    const success = await handleAssign(mode, true, campaign, reEnrollArg);
    if (!success) {
      setReEnrollPrompt(prev => prev || { completed: 1, incomplete: 0, lastStep: 0 });
      setReEnrollCampaign(campaign);
    } else {
      setReEnrollPrompt(null);
      setReEnrollCampaign(null);
      setAssignmentComplete(true);
    }
  };

  // Handler for step delay change
  const handleDelayChange = (stepIdx, field, value) => {
    setCustomDelays(prev => ({
      ...prev,
      [stepIdx]: {
        ...prev[stepIdx],
        [field]: value
      }
    }));
  };

  // Assign or re-enroll
  // Accept reEnrollArg as an override
  const handleAssign = async (mode, isReEnroll = false, campaignOverride = null, reEnrollArgOverride = null) => {
    if (assignmentComplete) return false;
    const campaign = campaignOverride || selectedCampaign;
    if (!firebaseUser) {
      setStatus('You are not logged in or your session has expired. Please log in again.');
      return false;
    }
    if (!campaign) {
      setStatus('No campaign selected. Please select a campaign first.');
      setReEnrollPrompt(null);
      setSelectedCampaign(null);
      return false;
    }
    setLoading(true);
    setStatus('Assigning...');
    try {
      let reEnrollArg = {};
      if (reEnrollArgOverride) {
        reEnrollArg = reEnrollArgOverride;
      } else if (mode === 'restart' || mode === 'resume') {
        reEnrollArg = { [contactId]: { mode: String(mode), lastStep: reEnrollPrompt?.lastStep || 0 } };
      }
      let assignResult;
      let customDelaysArray = undefined;
      if (allowStepDelayEdit && customDelays && campaign && Array.isArray(campaign.steps)) {
        customDelaysArray = campaign.steps.map((step, idx) => {
          const delay = customDelays[idx] || {};
          if (idx === 0 && delay.unit === 'custom' && delay.value && delay.time) {
            // Convert Eastern to UTC before sending to backend
            const utcDate = fromZonedTime(`${delay.value}T${delay.time}`, 'America/New_York');
            return { ...delay, value: utcDate.toISOString() };
          }
          return delay;
        });
        // Defensive: log customDelaysArray for debugging
        console.log('[CampaignAssignContacts] customDelaysArray:', customDelaysArray);
        // Defensive: check for invalid first step date
        if (customDelaysArray[0] && customDelaysArray[0].value && isNaN(Date.parse(customDelaysArray[0].value))) {
          setStatus('Invalid date/time for first step. Please check your input.');
          setLoading(false);
          return false;
        }
      }
      try {
        assignResult = await onSave(campaign, contactId, reEnrollArg, allowStepDelayEdit ? customDelaysArray : undefined);
      } catch (e) {
        setStatus('Permission error or failed to assign: ' + (e.message || e));
        setLoading(false);
        if (typeof onCancel === 'function') onCancel(); // Close modal on error
        return false;
      }
      if (assignResult && assignResult.error) {
        setStatus('Error assigning: ' + (assignResult.error.message || assignResult.error.code || assignResult.error));
        setLoading(false);
        if (typeof onCancel === 'function') onCancel(); // Close modal on error
        return false;
      }
      setStatus('Assigned!');
      setAssignmentComplete(true);
      setAssignmentCampaign(campaign);
      setLoading(false);
      // Always close modal/accordion after success
      if (typeof onCancel === 'function') onCancel();
      if (typeof window !== 'undefined' && typeof window.onCampaignAssigned === 'function') window.onCampaignAssigned();
      if (typeof props?.onAssigned === 'function') props.onAssigned();
      return true;
    } catch (e) {
      setStatus('Error assigning: ' + (e.message || e));
      setLoading(false);
      if (typeof onCancel === 'function') onCancel();
      return false;
    }
  };

  // Initialize default delays when a campaign is selected
  useEffect(() => {
    if (!selectedCampaign || !Array.isArray(selectedCampaign.steps)) {
      setCustomDelays({});
      return;
    }
    
    // Initialize delays for all steps except the last one
    const defaultDelays = {};
    selectedCampaign.steps.forEach((step, idx) => {
      if (idx === 0) {
        // First step: default to tomorrow at 9 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const pad = n => n.toString().padStart(2, '0');
        const tomorrowDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        defaultDelays[idx] = { value: tomorrowDate, time: '09:00', unit: 'custom' };
      } else if (idx < selectedCampaign.steps.length - 1) {
        // Middle steps: use step delay or default to 1 day
        defaultDelays[idx] = step.delay || { value: 1, unit: 'days' };
      }
      // Last step: no delay needed, don't add to defaultDelays
    });
    
    setCustomDelays(defaultDelays);
  }, [selectedCampaign]);

  // UI
  if (status && status.startsWith('Error checking enrollments:')) {
    return (
      <div style={{ padding: 32, maxWidth: 400 }}>
        <h3>Error</h3>
        <div style={{ color: 'red', marginBottom: 16 }}>{status}</div>
        <button style={{ margin: 8, padding: 8 }} onClick={resetState}>Try Again</button>
        <button style={{ margin: 8, padding: 8 }} onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  if (reEnrollPrompt) {
    // Only show the correct re-enroll option based on most recent status
    return (
      <div style={{ padding: 32, maxWidth: 400 }}>
        <h3>Re-enroll Contact?</h3>
        {reEnrollPrompt.mode === 'resume' ? (
          <>
            <p>This contact previously withdrew from this campaign. Would you like to resume from the last incomplete step?</p>
            <button style={{ margin: 8, padding: 8 }} onClick={() => handleReEnrollChoice('resume')}>Resume from last incomplete step (Step {reEnrollPrompt.lastStep + 1})</button>
          </>
        ) : (
          <>
            <p>This contact has completed this campaign before. Would you like to restart from the beginning?</p>
            <button style={{ margin: 8, padding: 8 }} onClick={() => handleReEnrollChoice('restart')}>Restart from beginning</button>
          </>
        )}
        <button style={{ margin: 8, padding: 8 }} onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  // UI: Show step delay fields if allowStepDelayEdit and selectedCampaign
  if (allowStepDelayEdit && selectedCampaign && selectedCampaign.steps && !assignmentComplete && !loading) {
    return (
      <div style={{ padding: 32, maxWidth: 400 }}>
        <h3>Enroll Contact</h3>
        <div style={{ marginBottom: 16 }}><b>Campaign:</b> {selectedCampaign?.name}</div>
        <div style={{ color: '#5BA150', marginBottom: 12 }}>{status}</div>
        <div style={{ marginBottom: 16 }}>
          <b>Edit Step Delays:</b>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {selectedCampaign.steps.map((step, idx) => {
              let stepSubject = step.subject;
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
                  Step {idx + 1}: {stepSubject || '(no subject)'}<br />
                  {/* For the first step, always show date and time pickers and require them */}
                  {idx === 0 ? (
                    <>
                      <label>
                        Date:
                        <input
                          type="date"
                          value={customDelays[0]?.value || ''}
                          onChange={e => handleDelayChange(0, 'value', e.target.value)}
                          required
                          style={{ marginRight: 8 }}
                        />
                      </label>
                      <label>
                        Time:
                        <input
                          type="time"
                          value={customDelays[0]?.time || '09:00'}
                          onChange={e => handleDelayChange(0, 'time', e.target.value)}
                          required
                          style={{ marginRight: 8 }}
                        />
                      </label>
                      <span style={{ color: '#888', fontSize: 12 }}>First email will be scheduled for this date/time.</span>
                    </>
                  ) : null}
                  
                  {/* Show delay input for all steps except the last one */}
                  {!isLastStep && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 13, color: '#666' }}>
                        {idx === 0 ? 'Delay to Step 2:' : `Delay to Step ${idx + 2}:`}
                      </span><br />
                      <input
                        type="number"
                        min={0}
                        value={customDelays[idx]?.value || step.delay?.value || 1}
                        onChange={e => handleDelayChange(idx, 'value', Number(e.target.value))}
                        style={{ width: 60, marginRight: 8 }}
                      />
                      <select
                        value={customDelays[idx]?.unit || step.delay?.unit || 'days'}
                        onChange={e => handleDelayChange(idx, 'unit', e.target.value)}
                        style={{ marginRight: 8 }}
                      >
                        <option value="minutes">minutes</option>
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                        <option value="months">months</option>
                        <option value="custom">custom</option>
                      </select>
                      {customDelays[idx]?.unit === 'custom' && (
                        <input
                          type="time"
                          value={customDelays[idx]?.time || '09:00'}
                          onChange={e => handleDelayChange(idx, 'time', e.target.value)}
                        />
                      )}
                    </div>
                  )}
                  
                  {/* Show final step message */}
                  {isLastStep && (
                    <span style={{ color: '#888', fontSize: 12 }}>Final step</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Cancel</button>
          <button onClick={() => handleAssign('new')} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }} disabled={loading || !selectedCampaign}>Enroll</button>
        </div>
      </div>
    );
  }

  // Show loading state while assigning
  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 400 }}>
        <h3>Enroll Contact</h3>
        <div style={{ marginBottom: 16 }}><b>Campaign:</b> {selectedCampaign?.name}</div>
        <div style={{ color: '#5BA150', marginBottom: 12 }}>{status || 'Assigning...'} </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }} disabled>Cancel</button>
        </div>
      </div>
    );
  }

  // Show status or success after assignment
  if (assignmentComplete) {
    return (
      <div style={{ padding: 32, maxWidth: 400 }}>
        <h3>Enroll Contact</h3>
        <div style={{ marginBottom: 16 }}><b>Campaign:</b> {assignmentCampaign?.name}</div>
        <div style={{ color: '#5BA150', marginBottom: 12 }}>{status}</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Close</button>
        </div>
      </div>
    );
  }

  // Only show campaign list if not loading or assignmentComplete
  if (!selectedCampaign && !pendingCampaign && !assignmentComplete && !loading) {
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
        <h3>Select Campaign</h3>
        <input
          type="text"
          placeholder="Search campaigns by name, author, public/private, or keyword..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 16, padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
        />
        {filteredCampaigns.length === 0 ? <div>No campaigns found.</div> : (
          <ul style={{ listStyle: 'none', padding: 0, width: '100%', maxWidth: 800, minWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
            {filteredCampaigns.map(campaign => {
              // Used Count: total number of enrollments for this contact/campaign (any status)
              const usedCount = campaignUsageCounts[campaign.id] || 0;
              return (
                <li key={campaign.id} style={{
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  background: '#f6f6f6',
                  borderRadius: 8,
                  border: '1px solid #eee',
                  padding: '18px 28px',
                  boxSizing: 'border-box',
                  minWidth: 600,
                  maxWidth: 800,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  gap: 24
                }}>
                  <button
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: selectedCampaign && selectedCampaign.id === campaign.id ? '#e6f7ea' : '#fff',
                      border: 'none',
                      outline: 'none',
                      fontSize: 18,
                      fontWeight: 700,
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4
                    }}
                    onClick={() => handleSelectCampaign(campaign)}
                    disabled={loading}
                  >
                    <span>{campaign.name}</span>
                    <span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}>{campaign.public ? 'Public' : 'Private'} | Author: {campaign.author || 'Unknown'}</span>
                    <span style={{ fontSize: 14, color: '#888', margin: '4px 0 2px 0' }}>{campaign.description}</span>
                    <span style={{ fontSize: 13, color: '#888', margin: '2px 0' }}>Steps: {Array.isArray(campaign.steps) ? campaign.steps.length : 0}</span>
                  </button>
                  <span style={{ marginLeft: 24, fontSize: 16, color: '#007A33', minWidth: 120, textAlign: 'right', fontWeight: 600 }}>
                    Used Count: {usedCount}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
