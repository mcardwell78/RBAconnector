import React, { useState, useEffect } from 'react';
import { getCampaignsSplit } from '../services/campaigns';
import { getEnrollmentsForCampaign } from '../services/campaignEnrollments';
import { fromZonedTime } from 'date-fns-tz';
import { getCampaign } from '../services/campaigns';
import { getTemplatesSplit } from '../services/email';

export default function CampaignAssignAccordion({
  contactId,
  onSave,
  onCancel,
  allowStepDelayEdit = true,
  trigger,
  hideTitleAndAddButton = false,
  onNavigateToSection,
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [privateCampaigns, setPrivateCampaigns] = useState([]);
  const [publicCampaigns, setPublicCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showDelayPopup, setShowDelayPopup] = useState(false);
  const [usageCounts, setUsageCounts] = useState({});
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [historicalCampaigns, setHistoricalCampaigns] = useState([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [accordionStep, setAccordionStep] = useState('list'); // 'list' | 'confirm' | 'delay'
  const [historicalMatch, setHistoricalMatch] = useState(null);
  const pageSize = 6;
  const [page, setPage] = useState(1);
  // Add state to store reEnrollChoice
  const [reEnrollChoice, setReEnrollChoice] = useState(undefined);

  // Only show the button if a contact is selected
  if (!contactId) return null;

  useEffect(() => {
    // Always fetch campaigns on mount
    if (!campaignsLoaded) {
      getCampaignsSplit().then(async ({ privateCampaigns, publicCampaigns }) => {
        setPrivateCampaigns(privateCampaigns);
        setPublicCampaigns(publicCampaigns);
        setCampaignsLoaded(true);
      });
    }
  }, [campaignsLoaded, contactId]);

  // Fetch usage counts for all campaigns for this contact
  useEffect(() => {
    if ((!privateCampaigns.length && !publicCampaigns.length) || !contactId) return;
    let isMounted = true;
    const all = [...privateCampaigns, ...publicCampaigns];
    Promise.all(
      all.map(campaign => getEnrollmentsForCampaign(campaign.id))
    ).then(allEnrollments => {
      if (!isMounted) return;
      const counts = {};
      allEnrollments.forEach((enrollments, idx) => {
        // Count ALL enrollments for this contact/campaign (any status)
        counts[all[idx].id] = enrollments.filter(e => e.contactId === contactId).length;
      });
      setUsageCounts(counts);
    });
    return () => { isMounted = false; };
  }, [privateCampaigns, publicCampaigns, contactId]);

  // When a campaign is selected for assignment, check for historical match
  const handleSelectCampaign = async (campaign) => {
    // Fetch enrollments for this campaign and contact
    const enrollments = await getEnrollmentsForCampaign(campaign.id);
    const contactEnrollments = enrollments.filter(e => e.contactId === contactId);
    // If any enrollment is completed, withdrawn, or paused, show confirmation
    if (contactEnrollments.some(e => ['completed', 'withdrawn', 'paused'].includes(e.status))) {
      setHistoricalMatch({ ...campaign, enrollments: contactEnrollments });
      setSelectedCampaign(campaign);
      setAccordionStep('confirm');
    } else {
      setSelectedCampaign(campaign);
      setAccordionStep('delay');
    }
  };

  // Handler for confirmation step
  const handleHistoricalConfirm = (action) => {
    if (action === 'new') {
      setSelectedCampaign(null);
      setHistoricalMatch(null);
      setAccordionStep('list');
    } else if (action === 'continue') {
      // Prepare reEnrollChoice for this contact/campaign
      let reEnrollChoice = {};
      if (historicalMatch && historicalMatch.enrollments) {
        // Find most recent enrollment
        const mostRecent = historicalMatch.enrollments.reduce((a, b) => (a.createdAt?.seconds > b.createdAt?.seconds ? a : b));
        if (mostRecent && mostRecent.status === 'withdrawn') {
          reEnrollChoice = { [contactId]: { mode: 'resume', lastStep: mostRecent.currentStep || 0 } };
        } else {
          reEnrollChoice = { [contactId]: { mode: 'restart', lastStep: 0 } };
        }
      }
      setAccordionStep('delay');
      setReEnrollChoice(reEnrollChoice); // <-- store for use in handleDelaySave
    }
  };

  const handleDelaySave = (delays) => {
    // Convert first step's custom date/time from Eastern to UTC before passing to onSave
    const convertedDelays = delays.map((delay, idx) => {
      if (idx === 0 && delay.unit === 'custom' && delay.value && delay.time) {
        const utcDate = fromZonedTime(`${delay.value}T${delay.time}`, 'America/New_York');
        return { ...delay, value: utcDate.toISOString() };
      }
      return delay;
    });
    setShowDelayPopup(false);
    // Pass reEnrollChoice if present (for re-enroll), otherwise undefined
    onSave(selectedCampaign, contactId, reEnrollChoice, convertedDelays);
    setExpanded(false);
    setSelectedCampaign(null);
    setCampaignsLoaded(false); // reload on next open
    setReEnrollChoice(undefined); // reset after use
  };

  const handleCancel = () => {
    setShowDelayPopup(false);
    setSelectedCampaign(null);
    setExpanded(false);
    setCampaignsLoaded(false);
    if (onCancel) onCancel();
  };

  // Filter and paginate campaigns
  // If hideTitleAndAddButton, show all public and private campaigns (not just assignable)
  const allCampaigns = hideTitleAndAddButton
    ? [...privateCampaigns, ...publicCampaigns].filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : [...privateCampaigns, ...publicCampaigns].filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(allCampaigns.length / pageSize));
  const pageItems = allCampaigns.slice((page-1)*pageSize, page*pageSize);

  // Only show the header and Add button if not suppressed
  return (
    <div style={{ marginTop: 0 }}>
      {/* Campaign List or Selected Campaign Summary */}
      {!selectedCampaign ? (
        <div style={{
          background: '#f6f6f6',
          borderRadius: 8,
          border: '1px solid #eee',
          boxShadow: '0 1px 4px #0001',
          padding: '18px 28px',
          margin: '0 0 18px 0',
          fontFamily: 'Arial, sans-serif',
          color: '#222',
          width: '100%',
          minWidth: 600,
          maxWidth: 900,
          boxSizing: 'border-box',
          transition: 'all 0.2s',
        }}>
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 4, border: '1px solid #ccc', minWidth: 600, maxWidth: 900 }}
          />
          <div style={{ maxWidth: 900, minWidth: 600, margin: '0 auto', maxHeight: 320, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, background: '#fafafa', padding: 8 }}>
            {pageItems.map(c => {
              // Find active enrollment for this campaign/contact
              const activeEnrollment = activeCampaigns.find(a => a.id === c.id || a.campaignId === c.id);
              return (
                <button key={c.id} style={{ width: '100%', margin: '10px 0', padding: '14px 18px', borderRadius: 8, border: '1px solid #eee', background: '#f6f6f6', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', fontSize: 17, position: 'relative' }} onClick={() => handleSelectCampaign(c)}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                    <span style={{ textAlign: 'left', fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{c.public ? 'Public' : 'Private'}{c.author ? ` | Author: ${c.author}` : ''}</span>
                    <span style={{ fontSize: 14, color: '#888', margin: '4px 0 2px 0' }}>{c.description}</span>
                    <span style={{ fontSize: 13, color: '#888', margin: '2px 0' }}>Steps: {Array.isArray(c.steps) ? c.steps.length : 0}</span>
                  </div>
                  <span style={{ marginLeft: 24, fontSize: 16, color: '#007A33', minWidth: 120, textAlign: 'right', fontWeight: 600 }}>
                    {activeEnrollment
                      ? `Current Step: ${typeof activeEnrollment.enrollment?.currentStep === 'number' ? activeEnrollment.enrollment.currentStep + 1 : typeof activeEnrollment.currentStep === 'number' ? activeEnrollment.currentStep + 1 : 1}`
                      : `Used Count: ${usageCounts[c.id] || 0}`}
                  </span>
                </button>
              );
            })}
            {pageItems.length === 0 && <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 16 }}>No campaigns found.</div>}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>Prev</button>
              <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>Next</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: '#f6f6f6',
          borderRadius: 8,
          border: '1px solid #eee',
          boxShadow: '0 1px 4px #0001',
          padding: '18px 28px',
          margin: '0 0 18px 0',
          fontFamily: 'Arial, sans-serif',
          color: '#222',
          width: '100%',
          minWidth: 600,
          maxWidth: 900,
          boxSizing: 'border-box',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedCampaign.name}</div>
            <div style={{ fontSize: 14, color: '#888' }}>{selectedCampaign.public ? 'Public' : 'Private'}{selectedCampaign.author ? ` | Author: ${selectedCampaign.author}` : ''}</div>
            <div style={{ fontSize: 14, color: '#888', margin: '4px 0 2px 0' }}>{selectedCampaign.description}</div>
            <div style={{ fontSize: 13, color: '#888', margin: '2px 0' }}>Steps: {Array.isArray(selectedCampaign.steps) ? selectedCampaign.steps.length : 0}</div>
          </div>
          <button onClick={() => { setSelectedCampaign(null); setAccordionStep('list'); }} style={{ background: '#eee', color: '#1976d2', border: '1px solid #1976d2', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', marginLeft: 24 }}>Change</button>
        </div>
      )}
      {/* Accordion Steps (confirm, delay) below the campaign list */}
      {accordionStep === 'confirm' && historicalMatch && selectedCampaign && (
        <div style={{ maxWidth: 900, minWidth: 600, margin: '0 auto', boxShadow: '0 2px 8px #0002', borderRadius: 8, background: '#fff', padding: '18px 28px', position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16, color: '#d32f2f' }}>This contact has historical enrollments for this campaign.</div>
          <div style={{ fontSize: 15, color: '#444', marginBottom: 24 }}>Select an action for this campaign:</div>
          <div style={{ width: '100%', marginBottom: 24 }}>
            {historicalMatch.enrollments.length > 1 ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Historical Enrollments:</div>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {historicalMatch.enrollments
                    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                    .map((enr, idx) => (
                      <li key={enr.id || idx} style={{ marginBottom: 10, padding: 10, border: '1px solid #eee', borderRadius: 6, background: '#f9f9f9' }}>
                        <div><b>Status:</b> <span style={{ color: enr.status === 'withdrawn' ? '#1976d2' : enr.status === 'completed' ? '#888' : '#5BA150' }}>{enr.status}</span></div>
                        <div><b>Started:</b> {enr.createdAt ? new Date(enr.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
                        <div><b>Current Step:</b> {typeof enr.currentStep === 'number' ? enr.currentStep + 1 : '-'}</div>
                        <div><b>Steps Completed:</b> {typeof enr.currentStep === 'number' ? enr.currentStep : 0} / {Array.isArray(historicalMatch.steps) ? historicalMatch.steps.length : 0}</div>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600 }}>Previous Enrollment:</div>
                {historicalMatch.enrollments.map((enr, idx) => (
                  <div key={enr.id || idx} style={{ marginBottom: 10, padding: 10, border: '1px solid #eee', borderRadius: 6, background: '#f9f9f9' }}>
                    <div><b>Status:</b> <span style={{ color: enr.status === 'withdrawn' ? '#1976d2' : enr.status === 'completed' ? '#888' : '#5BA150' }}>{enr.status}</span></div>
                    <div><b>Started:</b> {enr.createdAt ? new Date(enr.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
                    <div><b>Current Step:</b> {typeof enr.currentStep === 'number' ? enr.currentStep + 1 : '-'}</div>
                    <div><b>Steps Completed:</b> {typeof enr.currentStep === 'number' ? enr.currentStep : 0} / {Array.isArray(historicalMatch.steps) ? historicalMatch.steps.length : 0}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Action buttons: Resume, Restart, Reselect */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Resume if any withdrawn */}
            {historicalMatch.enrollments.some(e => e.status === 'withdrawn') && (
              <button style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 16 }}
                onClick={async () => {
                  // Find most recent withdrawn
                  const mostRecent = historicalMatch.enrollments.filter(e => e.status === 'withdrawn').sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
                  setReEnrollChoice({ [contactId]: { mode: 'resume', lastStep: mostRecent.currentStep || 0 } });
                  let campaignObj = null;
                  if (historicalMatch.id) {
                    const all = [...privateCampaigns, ...publicCampaigns];
                    campaignObj = all.find(c => c.id === historicalMatch.id);
                  }
                  if ((!campaignObj || !Array.isArray(campaignObj.steps)) && historicalMatch.id) {
                    const fetched = await getCampaign(historicalMatch.id);
                    if (fetched && Array.isArray(fetched.steps)) campaignObj = fetched;
                  }
                  if (!campaignObj || !Array.isArray(campaignObj.steps)) {
                    alert('Could not load campaign steps. Please try again or contact support.');
                    return;
                  }
                  // Always use the campaign object from the list or Firestore, never a merged object
                  setSelectedCampaign(campaignObj);
                  setAccordionStep('delay');
                }}>
                Resume from last incomplete step
              </button>
            )}
            {/* Restart if any completed or withdrawn */}
            {(historicalMatch.enrollments.some(e => e.status === 'completed') || historicalMatch.enrollments.some(e => e.status === 'withdrawn')) && (
              <button style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 16 }}
                onClick={async () => {
                  setReEnrollChoice({ [contactId]: { mode: 'restart', lastStep: 0 } });
                  let campaignObj = null;
                  if (historicalMatch.id) {
                    const all = [...privateCampaigns, ...publicCampaigns];
                    campaignObj = all.find(c => c.id === historicalMatch.id);
                  }
                  if ((!campaignObj || !Array.isArray(campaignObj.steps)) && historicalMatch.id) {
                    const fetched = await getCampaign(historicalMatch.id);
                    if (fetched && Array.isArray(fetched.steps)) campaignObj = fetched;
                  }
                  if (!campaignObj || !Array.isArray(campaignObj.steps)) {
                    alert('Could not load campaign steps. Please try again or contact support.');
                    return;
                  }
                  setSelectedCampaign(campaignObj);
                  setAccordionStep('delay');
                }}>
                Restart from beginning
              </button>
            )}
            {/* Reselect (go back to campaign list) */}
            <button style={{ background: '#eee', color: '#222', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 16 }}
              onClick={() => {
                setSelectedCampaign(null);
                setHistoricalMatch(null);
                setAccordionStep('list');
              }}>
              Reselect Campaign
            </button>
          </div>
        </div>
      )}
      {/* Accordion Step: Delay Editor */}
      {accordionStep === 'delay' && selectedCampaign && (
        <div style={{ marginTop: 8, maxWidth: 900, minWidth: 600, marginLeft: 'auto', marginRight: 'auto', boxShadow: '0 2px 8px #0002', borderRadius: 8, background: '#fff', padding: '18px 28px', position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ marginBottom: 16 }}>Edit Step Delays</h3>
          <DelayEditAccordion
            campaign={selectedCampaign}
            reEnrollChoice={reEnrollChoice}
            onSave={handleDelaySave}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  );
}

// Replace DelayEditPopup with DelayEditAccordion (inline, not modal)
function DelayEditAccordion({ campaign, reEnrollChoice, onSave, onCancel }) {
  // Support Resume: only show steps from currentStep onward if reEnrollChoice is resume
  const resumeStep = reEnrollChoice && Object.values(reEnrollChoice)[0]?.mode === 'resume' ? (Object.values(reEnrollChoice)[0].lastStep || 0) : 0;
  const stepsToShow = Array.isArray(campaign.steps) ? campaign.steps.slice(resumeStep) : [];
  const [delays, setDelays] = useState(() => {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const currentDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return stepsToShow.map((step, idx) => {
      if (idx === 0) {
        // First step: use current date/time
        return { value: currentDate, time: currentTime, unit: 'custom' };
      } else if ((resumeStep + idx) === (stepsToShow.length + resumeStep - 1)) {
        // Last step: no delay needed, but keep structure for consistency
        return { value: step.delay?.value || 0, unit: step.delay?.unit || 'days', time: step.delay?.time || '09:00' };
      } else {
        // Middle steps: use step delay or default to 1 day
        return { value: step.delay?.value || 1, unit: step.delay?.unit || 'days', time: step.delay?.time || '09:00' };
      }
    });
  });
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    getTemplatesSplit().then(({ privateTemplates, publicTemplates }) => {
      // Remove duplicates (user's own template may also be public)
      const privateIds = new Set(privateTemplates.map(t => t.id));
      const mergedTemplates = [
        ...privateTemplates,
        ...publicTemplates.filter(t => !privateIds.has(t.id))
      ];
      setTemplates(mergedTemplates);
    });
  }, []);
  const handleChange = (idx, field, value) => {
    setDelays(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };
  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {stepsToShow.map((step, idx) => {
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
              stepSubject = `Step ${resumeStep + idx + 1}`;
            }
          }
          
          // Remove template variables from display
          if (stepSubject) {
            stepSubject = stepSubject.replace(/\{\{[^}]+\}\}/g, '...');
          }
          
          const isLastStep = (resumeStep + idx) === (stepsToShow.length + resumeStep - 1);
          
          return (
            <li key={idx} style={{ marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Step {resumeStep + idx + 1}: {stepSubject || '(no subject)'}</div>
              {idx === 0 ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label>Date: <input type="date" value={delays[0].value} onChange={e => handleChange(0, 'value', e.target.value)} style={{ marginRight: 8 }} /></label>
                  <label>Time: <input type="time" value={delays[0].time} onChange={e => handleChange(0, 'time', e.target.value)} style={{ marginRight: 8 }} /></label>
                  <span style={{ color: '#888', fontSize: 12 }}>This step will be scheduled for this date/time.</span>
                </div>
              ) : null}
              
              {/* Show delay input for all steps except the last one */}
              {!isLastStep && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 13, color: '#666' }}>
                    {idx === 0 ? 'Delay to Step 2:' : `Delay to Step ${resumeStep + idx + 2}:`}
                  </span>
                  <input type="number" min={0} value={delays[idx].value} onChange={e => handleChange(idx, 'value', e.target.value)} style={{ width: 60, marginRight: 8 }} />
                  <select value={delays[idx].unit} onChange={e => handleChange(idx, 'unit', e.target.value)} style={{ marginRight: 8 }}>
                    <option value="minutes">minutes</option>
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                    <option value="months">months</option>
                    <option value="custom">custom</option>
                  </select>
                  {delays[idx].unit === 'custom' && (
                    <input type="time" value={delays[idx].time} onChange={e => handleChange(idx, 'time', e.target.value)} />
                  )}
                </div>
              )}
              
              {/* Show final step message */}
              {isLastStep && (
                <div style={{ color: '#888', fontSize: 12 }}>Final step</div>
              )}
            </li>
          );
        })}
      </ul>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onCancel} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Cancel</button>
        {/* Always pass delays to onSave */}
        <button onClick={() => onSave(delays)} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Save</button>
      </div>
    </div>
  );
}
