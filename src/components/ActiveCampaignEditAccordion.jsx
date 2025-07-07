import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getTemplates } from '../services/email';

export default function ActiveCampaignEditAccordion({ campaign, onSave, onCancel, onWithdraw }) {
  const steps = Array.isArray(campaign.steps) ? campaign.steps : [];
  const enrollmentId = campaign.enrollment?.id;
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [stepStates, setStepStates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);

  // Fetch templates for subject lookup
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const t = await getTemplates();
        setTemplates(t);
      } catch (e) {
        setTemplates([]);
      }
    }
    fetchTemplates();
  }, []);

  // Fetch scheduled emails for this enrollment
  useEffect(() => {
    async function fetchScheduled() {
      if (!enrollmentId) return setScheduledEmails([]);
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return setScheduledEmails([]);
      const q = query(
        collection(db, 'scheduledEmails'),
        where('campaignEnrollmentId', '==', enrollmentId),
        where('userId', '==', user.uid)
      );
      console.log('[ActiveCampaignEditAccordion] scheduledEmails query:', q);
      try {
        const snap = await getDocs(q);
        console.log('[ActiveCampaignEditAccordion] scheduledEmails snapshot:', snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setScheduledEmails(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      } catch (err) {
        console.error('[ActiveCampaignEditAccordion] scheduledEmails error:', err);
        setScheduledEmails([]);
      }
      setLoading(false);
    }
    fetchScheduled();
  }, [enrollmentId]);

  // Map scheduled emails to steps
  useEffect(() => {
    if (!steps.length) return;
    // Map: stepIndex -> scheduledEmail
    const emailMap = {};
    scheduledEmails.forEach(e => {
      if (typeof e.stepIndex === 'number') emailMap[e.stepIndex] = e;
    });
    // Find first unsent step index
    let firstUnsentIdx = 0;
    for (let i = 0; i < steps.length; i++) {
      const email = emailMap[i];
      if (!email || email.status !== 'sent') {
        firstUnsentIdx = i;
        break;
      }
    }
    setStepStates(
      steps.map((step, idx) => {
        let scheduledDate = null;
        // For the first unsent step, always use enrollment.nextSend if available
        if (
          idx === firstUnsentIdx &&
          campaign.enrollment && campaign.enrollment.nextSend
        ) {
          if (typeof campaign.enrollment.nextSend === 'object' && typeof campaign.enrollment.nextSend.seconds === 'number') {
            scheduledDate = new Date(campaign.enrollment.nextSend.seconds * 1000);
          } else {
            scheduledDate = new Date(campaign.enrollment.nextSend);
          }
        } else {
          const email = emailMap[idx];
          if (email?.scheduledFor && typeof email.scheduledFor === 'object' && email.scheduledFor.seconds) {
            scheduledDate = new Date(email.scheduledFor.seconds * 1000);
          } else if (email?.scheduledFor) {
            scheduledDate = new Date(email.scheduledFor);
          }
        }
        // Support both array and object for enrollment steps
        let enrollmentStep = null;
        if (campaign.enrollment && campaign.enrollment.steps) {
          if (Array.isArray(campaign.enrollment.steps)) {
            if (step.id) {
              enrollmentStep = campaign.enrollment.steps.find(s => s.id === step.id);
            }
            if (!enrollmentStep && campaign.enrollment.steps[idx]) {
              enrollmentStep = campaign.enrollment.steps[idx];
            }
          } else if (typeof campaign.enrollment.steps === 'object') {
            enrollmentStep = campaign.enrollment.steps[String(idx)];
          }
        }
        let delayValue = 1;
        let delayUnit = 'days';
        if (enrollmentStep && enrollmentStep.delay) {
          delayValue = enrollmentStep.delay.value || 1;
          delayUnit = enrollmentStep.delay.unit || 'days';
        } else if (step.delay) {
          delayValue = step.delay.value || 1;
          delayUnit = step.delay.unit || 'days';
        }
        // Debug logging
        console.log('[ActiveCampaignEditAccordion] step', idx, {
          step,
          enrollmentStep,
          delayValue,
          delayUnit,
          enrollmentSteps: campaign.enrollment?.steps
        });
        let localDate = '', localTime = '';
        if (scheduledDate) {
          // Use timezone-safe date formatting
          const year = scheduledDate.getFullYear();
          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
          const day = String(scheduledDate.getDate()).padStart(2, '0');
          localDate = `${year}-${month}-${day}`;
          localTime = scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        } else if (idx === 0) {
          // For the first step with no existing schedule, default to current date
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          localDate = `${year}-${month}-${day}`;
          localTime = '09:00'; // Default to 9 AM
        }
        return {
          date: localDate,
          time: localTime,
          delay: delayValue,
          delayUnit: delayUnit,
          sent: emailMap[idx]?.status === 'sent',
        };
      })
    );
  }, [scheduledEmails, steps, campaign.enrollment?.nextSend, campaign.enrollment?.currentStep]);

  // Find first unsent step
  const firstUnsentIdx = stepStates.findIndex(s => !s.sent);

  // Helper to determine editability for each step
  const getEditMode = idx => {
    if (idx < firstUnsentIdx) return 'readonly'; // Sent steps
    if (idx === firstUnsentIdx) return 'date';   // First unsent step: edit date/time
    if (idx > firstUnsentIdx) return 'delay';    // Later steps: edit delay only
    return 'readonly';
  };

  // Helper to get subject for a step
  const getStepSubject = (step) => {
    if (step.subject && step.subject !== '(no subject)') return step.subject;
    if (step.templateId && templates.length > 0) {
      const template = templates.find(t => t.id === step.templateId);
      return template?.subject || template?.name || '(no subject)';
    }
    return '(no subject)';
  };

  // Helper to calculate scheduled date for delay-only steps
  const getCalculatedDate = idx => {
    // If previous step has a date/time, add delay to it
    if (idx === 0 || !stepStates[idx - 1]?.date || !stepStates[idx - 1]?.time) return '';
    const prevDate = stepStates[idx - 1].date;
    const prevTime = stepStates[idx - 1].time;
    const delay = parseInt(stepStates[idx]?.delay || 1, 10);
    const delayUnit = stepStates[idx]?.delayUnit || 'days';
    const prev = new Date(`${prevDate}T${prevTime}`);
    if (isNaN(prev.getTime())) return '';
    let ms = prev.getTime();
    if (delayUnit === 'minutes') ms += delay * 60 * 1000;
    if (delayUnit === 'days') ms += delay * 24 * 60 * 60 * 1000;
    if (delayUnit === 'weeks') ms += delay * 7 * 24 * 60 * 60 * 1000;
    if (delayUnit === 'months') ms += delay * 30 * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return d.toLocaleString();
  };

  const handleFieldChange = (idx, field, value) => {
    setStepStates(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (!enrollmentId) throw new Error('Missing enrollment ID');
      if (firstUnsentIdx === -1) throw new Error('No unsent steps to edit');
      const { date, time, delay, delayUnit } = stepStates[firstUnsentIdx];
      await onSave({ date, time, delay, delayUnit, stepIdx: firstUnsentIdx, enrollmentIds: [enrollmentId], stepStates });

      // --- Update scheduledEmails for this enrollment and step ---
      // Find the scheduledEmail doc for this step
      const q = query(
        collection(db, 'scheduledEmails'),
        where('campaignEnrollmentId', '==', enrollmentId),
        where('stepIndex', '==', firstUnsentIdx)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docRef = doc(db, 'scheduledEmails', snap.docs[0].id);
        // Compose new scheduledFor date
        let newDate = null;
        if (date && time) {
          newDate = new Date(`${date}T${time}`);
        } else if (delay && delayUnit && firstUnsentIdx > 0) {
          // Calculate from previous step
          const prev = stepStates[firstUnsentIdx - 1];
          if (prev.date && prev.time) {
            let ms = new Date(`${prev.date}T${prev.time}`).getTime();
            if (delayUnit === 'minutes') ms += parseInt(delay) * 60 * 1000;
            if (delayUnit === 'days') ms += parseInt(delay) * 24 * 60 * 60 * 1000;
            if (delayUnit === 'weeks') ms += parseInt(delay) * 7 * 24 * 60 * 60 * 1000;
            if (delayUnit === 'months') ms += parseInt(delay) * 30 * 24 * 60 * 60 * 1000;
            newDate = new Date(ms);
          }
        }
        if (newDate) {
          await updateDoc(docRef, { scheduledFor: newDate });
        }
      }
    } catch (e) {
      setError(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 24 }}>Loading schedule...</div>;

  return (
    <div style={{ background: '#f6f6f6', borderRadius: 8, border: '1px solid #eee', boxShadow: '0 1px 4px #0001', padding: '18px 28px', margin: '12px 0', fontFamily: 'Arial, sans-serif', color: '#222', minWidth: 600, maxWidth: 900, boxSizing: 'border-box' }}>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 12 }}>{campaign.campaignName || campaign.name}</div>
      <div>
        {steps.map((step, idx) => {
          const editMode = getEditMode(idx);
          return (
            <div key={idx} style={{ marginBottom: 18, opacity: editMode === 'readonly' ? 0.6 : 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Step {idx + 1}: {getStepSubject(step)}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {editMode === 'date' && (
                  <>
                    <label>Date:
                      <input
                        type="date"
                        value={stepStates[idx]?.date || ''}
                        onChange={e => handleFieldChange(idx, 'date', e.target.value)}
                        style={{ marginLeft: 8, marginRight: 8 }}
                      />
                    </label>
                    <label>Time:
                      <input
                        type="time"
                        value={stepStates[idx]?.time || ''}
                        onChange={e => handleFieldChange(idx, 'time', e.target.value)}
                        style={{ marginLeft: 8, marginRight: 8 }}
                      />
                    </label>
                  </>
                )}
                {editMode === 'delay' && (
                  <>
                    <label>Delay:
                      <input
                        type="number"
                        min={0}
                        value={stepStates[idx]?.delay || 1}
                        onChange={e => handleFieldChange(idx, 'delay', e.target.value)}
                        style={{ width: 60, marginLeft: 8, marginRight: 8 }}
                      />
                    </label>
                    <select
                      value={stepStates[idx]?.delayUnit || 'days'}
                      onChange={e => handleFieldChange(idx, 'delayUnit', e.target.value)}
                      style={{ marginLeft: 8 }}
                    >
                      <option value="minutes">minutes</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                    </select>
                    <span style={{ color: '#888', marginLeft: 12 }}>Scheduled: {getCalculatedDate(idx)}</span>
                  </>
                )}
                {editMode === 'readonly' && (
                  <span style={{ color: '#888', marginLeft: 12 }}>
                    {stepStates[idx]?.sent ? `Sent: ${stepStates[idx]?.date} ${stepStates[idx]?.time}` : `Scheduled: ${stepStates[idx]?.date} ${stepStates[idx]?.time}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
        <button onClick={onCancel} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Cancel</button>
        <button onClick={onWithdraw} style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Withdraw</button>
        <button onClick={handleSave} disabled={saving} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Save</button>
      </div>
    </div>
  );
}
