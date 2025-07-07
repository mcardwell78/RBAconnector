// IMPORTANT: When editing this file, always check that all JSX parentheses and curly braces are matched, especially after editing .map() or conditional blocks.
// If you extract or edit a section, ensure the start/end of each block is clearly commented.
// See EmailLogsSection.jsx for a robust, brace-safe template for paginated lists.

import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, deleteDoc, updateDoc, arrayUnion, addDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { getCampaign, getCampaignsSplit } from '../services/campaigns';
import { getEnrollmentsForCampaign } from '../services/campaignEnrollments';
import { getEnrollmentsForContact } from '../services/getEnrollmentsForContact';
import { useParams, useNavigate } from 'react-router-dom';
import SendOneOffEmailModal from '../components/SendOneOffEmailModal';
import { enrollContacts } from '../services/campaignEnrollments';
import { cardStyle, inputStyle, buttonOutlineStyle, modalStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';
import { updateEnrollment } from '../services/campaignEnrollments';
import Logo from './assets/Logo.png'; // <-- Fix path to assets
import { HistoricalEmailsAccordion } from './EmailLogsSection';
import CampaignAssignContacts from '../components/CampaignAssignContacts';
import CampaignAssignAccordion from '../components/CampaignAssignAccordion';
import ContactEngagementCard from '../components/ContactEngagementCard';
import { withdrawCampaignEnrollment } from '../services/email';
import ActiveCampaignEditAccordion from '../components/ActiveCampaignEditAccordion';
import { getNextScheduledEmailForEnrollment } from '../services/email';

function AddNoteButton({ contactId, onNoteAdded }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const handleAdd = async () => {
    if (!note.trim()) return;
    setLoading(true);
    const noteObj = { text: note.trim(), date: new Date().toISOString() };
    try {
      await updateDoc(doc(db, 'contacts', contactId), {
        notesList: arrayUnion(noteObj)
      });
    } catch (err) {
      console.error('[ContactDetailScreen] updateDoc notesList error', { contactId, note, err });
    }
    onNoteAdded(noteObj);
    setNote('');
    setLoading(false);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Add a note"
        style={{ ...inputStyle, width: '70%', marginRight: 8 }}
        disabled={loading}
      />
      <button onClick={handleAdd} disabled={loading || !note.trim()} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>
        Add Note
      </button>
    </div>
  );
}

function StatusDropdown({ contact, setContact, id }) {
  if (!contact) return <span>-</span>;
  const [updating, setUpdating] = useState(false);
  const handleChange = async (e) => {
    const newStatus = e.target.value;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'contacts', id), { status: newStatus });
    } catch (err) {
      console.error('[ContactDetailScreen] updateDoc status error', { id, status: newStatus, err });
    }
    setContact(c => ({ ...c, status: newStatus }));
    setUpdating(false);
  };
  return (
    <select value={contact.status || 'prospect'} onChange={handleChange} disabled={updating} style={{ padding: 6, borderRadius: 4, border: '1px solid #ccc' }}>
      <option value="prospect">Prospect</option>
      <option value="client">Client</option>
      <option value="do_not_contact">Do Not Contact</option>
    </select>
  );
}

// Add Phone Call Button (improved)
function AddPhoneCallButton({ contactId, onCallAdded, onTaskCreated }) {
  const [show, setShow] = useState(false);
  const [type, setType] = useState('Outbound');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState('No Answer');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [createTaskType, setCreateTaskType] = useState('Phone Call');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    setLoading(true);
    let followUpISO = followUp;
    if (followUp && !followUp.includes('T')) {
      // If only a date string (yyyy-mm-dd), convert to ISO string at midnight local
      followUpISO = new Date(followUp + 'T00:00:00').toISOString();
    }
    const call = {
      type,
      reason,
      result,
      outcomeNotes,
      date: new Date().toISOString(),
      followUp: followUpISO || null,
    };
    try {
      await updateDoc(doc(db, 'contacts', contactId), {
        phoneCalls: arrayUnion(call),
        phoneCallCount: window.firebase && window.firebase.firestore ? window.firebase.firestore.FieldValue.increment(1) : undefined
      });
    } catch (err) {
      console.error('[ContactDetailScreen] updateDoc phoneCalls error', { contactId, call, err });
    }
    onCallAdded(call);
    if (createTask && followUpISO) {
      try {
        await addDoc(collection(db, 'tasks'), {
          contactId,
          type: createTaskType || 'Phone Call',
          dueDate: followUpISO,
          completed: false,
          notes: `Follow up call for ${type} (${reason})`,
          userId: JSON.parse(localStorage.getItem('user'))?.uid || null,
          createdAt: new Date(),
        });
        if (onTaskCreated) onTaskCreated();
      } catch (err) {
        console.error('[ContactDetailScreen] addDoc follow-up task error', { contactId, followUpISO, err });
      }
    }
    setShow(false);
    setLoading(false);
  };

  // Adjust result options based on type
  const resultOptions = type === 'Outbound'
    ? ['No Answer', 'Made Contact', 'Left Voicemail']
    : ['Answered', 'Missed', 'Made Contact'];

  if (!show) return <button style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', marginBottom: 8, fontWeight: 600 }} onClick={() => setShow(true)}>Add Phone Call</button>;
  return (
    <div style={{ marginBottom: 8, background: '#f6f6f6', padding: 12, borderRadius: 8, boxShadow: '0 1px 4px #0001' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ marginRight: 8 }}>
          <option value="Outbound">Outbound</option>
          <option value="Inbound">Inbound</option>
        </select>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for Call" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #ccc' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={result} onChange={e => setResult(e.target.value)} style={{ marginRight: 8 }}>
          {resultOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <input value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} placeholder="Outcome Notes" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #ccc' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ marginRight: 8 }}>Follow Up Date:</label>
        <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} style={{ padding: 4, borderRadius: 4, border: '1px solid #ccc' }} />
        <select value={createTaskType} onChange={e => setCreateTaskType(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="Phone Call">Phone Call</option>
          <option value="Email">Email</option>
          <option value="In Person Visit">In Person Visit</option>
          <option value="Other">Other</option>
        </select>
        <label style={{ marginLeft: 8 }}>
          <input type="checkbox" checked={createTask} onChange={e => setCreateTask(e.target.checked)} /> Create Task
        </label>
      </div>
      <button onClick={handleAdd} disabled={loading} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 600 }}>Save</button>
      <button onClick={() => setShow(false)} style={{ marginLeft: 8 }}>Cancel</button>
    </div>
  );
}

export default function ContactDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [campaignEnrollment, setCampaignEnrollment] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [campaignStep, setCampaignStep] = useState(null);
  const [nextSend, setNextSend] = useState(null);
  const [endingDate, setEndingDate] = useState(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [emailLogError, setEmailLogError] = useState('');
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [privateCampaigns, setPrivateCampaigns] = useState([]);
  const [publicCampaigns, setPublicCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [activeEnrollments, setActiveEnrollments] = useState([]);
  const [historicalEnrollments, setHistoricalEnrollments] = useState([]);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [notes, setNotes] = useState([]);
  // State for notes editing
  const [editingNoteIdx, setEditingNoteIdx] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  // State for campaign accordion
  const [showCampaignAccordion, setShowCampaignAccordion] = useState(false);
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [historicalCampaigns, setHistoricalCampaigns] = useState([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  // State for editing delays
  const [editingDelaysIdx, setEditingDelaysIdx] = useState(null);
  // State for contact details visibility
  const [showContactDetails, setShowContactDetails] = useState(false);
  // State for historical campaigns visibility
  const [showHistoricalCampaigns, setShowHistoricalCampaigns] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // Add this with other useState hooks at the top of the component
  const [showHistoricalEmails, setShowHistoricalEmails] = useState(false);
  // --- Task state ---
  const [activeTasks, setActiveTasks] = useState([]);
  const [historicalTasks, setHistoricalTasks] = useState([]);
  const [showActiveTasks, setShowActiveTasks] = useState(false);
  const [showHistoricalTasks, setShowHistoricalTasks] = useState(false);
  // --- Add state for Add Task/Email accordions ---
  const [showAddTaskAccordion, setShowAddTaskAccordion] = useState(false);
  const [showAddEmailAccordion, setShowAddEmailAccordion] = useState(false);
  // --- Add state for active scheduled emails ---
  const [activeEmails, setActiveEmails] = useState([]);
  // --- Add state for editing active task ---
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskLoading, setEditTaskLoading] = useState(false);
  const [editTaskError, setEditTaskError] = useState('');
  // --- Add state for Assign to Campaign modal ---
  const [showAssignCampaignModal, setShowAssignCampaignModal] = useState(false);
  const [openCampaignIdx, setOpenCampaignIdx] = useState(null);
  // --- Add state for next scheduled email dates for active enrollments ---
  const [nextSendDates, setNextSendDates] = useState({}); // enrollmentId -> { date, emailDoc }
  const [completedDates, setCompletedDates] = useState({}); // enrollmentId -> sendAt
  // --- Show/hide state for each section ---
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [showPhoneCalls, setShowPhoneCalls] = useState(false);
  const [showActiveCampaigns, setShowActiveCampaigns] = useState(false);
  const [showHistoricalCampaignsSection, setShowHistoricalCampaignsSection] = useState(false);
  const [showActiveTasksSection, setShowActiveTasksSection] = useState(false);
  const [showHistoricalTasksSection, setShowHistoricalTasksSection] = useState(false);  const [showEmailsSection, setShowEmailsSection] = useState(false);  // Add state for showing/hiding campaigns section
  const [showCampaignsSection, setShowCampaignsSection] = useState(false);  // Add state for showing/hiding contact edit accordion
  const [showContactEdit, setShowContactEdit] = useState(false);
  const [editContactLoading, setEditContactLoading] = useState(false);
  // Add state for inline editing contact info (Contact Details modal)
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContactData, setEditContactData] = useState({});
  // Add state for inline main card editing (basic info)
  const [isEditingMainCard, setIsEditingMainCard] = useState(false);
  const [editMainCardData, setEditMainCardData] = useState({});

  // --- Show All / Hide All functions ---
  function showAll() {
    setShowContactInfo(true);
    setShowNotesSection(true);
    setShowPhoneCalls(true);
    setShowActiveCampaigns(true);
    setShowHistoricalCampaignsSection(true);
    setShowActiveTasksSection(true);
    setShowHistoricalTasksSection(true);
    setShowEmailsSection(true);
    setShowCampaignsSection(true);
  }
  function hideAll() {
    setShowContactInfo(false);
    setShowNotesSection(false);
    setShowPhoneCalls(false);
    setShowActiveCampaigns(false);
    setShowHistoricalCampaignsSection(false);
    setShowActiveTasksSection(false);
    setShowHistoricalTasksSection(false);
    setShowEmailsSection(false);
    setShowCampaignsSection(false);
  }
  // Render log for debugging
  console.log('ContactDetailScreen render', { assignStatus, assignLoading });

  // Move fetchAllCampaignEnrollments to component scope
  async function fetchAllCampaignEnrollments() {
    try {
      const enrollments = await getEnrollmentsForContact(id);
      console.log('[fetchAllCampaignEnrollments] ALL ENROLLMENTS FOR CONTACT:', enrollments);
      // Optionally fetch campaign names for display
      const campaignMap = {};
      const campaignDetailsMap = {};
      for (const e of enrollments) {
        if (!campaignMap[e.campaignId]) {
          try {
            const campaign = await getCampaign(e.campaignId);
            campaignMap[e.campaignId] = campaign?.name || e.campaignId;
            campaignDetailsMap[e.campaignId] = campaign || { id: e.campaignId, name: e.campaignId };
          } catch {
            campaignMap[e.campaignId] = e.campaignId;
            campaignDetailsMap[e.campaignId] = { id: e.campaignId, name: e.campaignId };
          }
        }
      }
      // No deduplication: show all enrollments
      setActiveEnrollments(
        enrollments.filter(e => e.status === 'active').map(e => ({ ...e, campaignName: campaignMap[e.campaignId] }))
      );      setHistoricalEnrollments(
        enrollments.filter(e => e.status === 'withdrawn' || e.status === 'completed' || e.status === 'paused').map(e => ({ ...e, campaignName: campaignMap[e.campaignId] }))
      );
      
      // Create maps for active and historical campaigns - FIXED: only set state once
      const mappedActive = enrollments
        .filter(e => e.status === 'active')
        .map(e => {
          const campaign = campaignDetailsMap[e.campaignId] || { id: e.campaignId, name: e.campaignId };
          return { ...campaign, enrollment: e };
        });
      
      const mappedHistorical = enrollments
        .filter(e => e.status === 'withdrawn' || e.status === 'completed' || e.status === 'paused')
        .map(e => {
          const campaign = campaignDetailsMap[e.campaignId] || { id: e.campaignId, name: e.campaignId };
          return { ...campaign, enrollment: e };
        });
      
      // FIXED: Only set state once with all campaigns properly mapped
      setActiveCampaigns(mappedActive);
      setHistoricalCampaigns(mappedHistorical);
    } finally {
      setCampaignLoading(false);
    }
  }

  // Move fetchContact to component scope so it can be used by the Refresh button
  async function fetchContact() {
    try {
      const docSnap = await getDoc(doc(db, 'contacts', id));
      if (docSnap.exists()) {
        setContact({ id, ...docSnap.data() });
        // Load notesList as array of objects, sort newest first
        const notesArr = Array.isArray(docSnap.data().notesList)
          ? [...docSnap.data().notesList].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          : [];
        setNotes(notesArr);
        console.log('[fetchContact] contact:', { id, ...docSnap.data() });
      }
    } catch (e) {
      console.error('[fetchContact] error:', e);
    }
    // Fetch email logs for this contact (only user's logs)
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user?.uid) return setEmailLogs([]);
    try {
      const q = query(collection(db, 'emailLogs'), where('userId', '==', user.uid), where('contactId', '==', id));
      console.log('[ContactDetailScreen] emailLogs query', { userId: user.uid, contactId: id });
      const logsSnap = await getDocs(q);
      setEmailLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setEmailLogError('');
    } catch (err) {
      console.error('[ContactDetailScreen] getDocs emailLogs error', { userId: user?.uid, contactId: id, err });
      if (err.message && err.message.includes('Missing or insufficient permissions')) {
        setEmailLogError('Some email logs are missing user information or you do not have permission to view them. Please contact support if this persists.');
      } else {
        setEmailLogError('An error occurred loading email logs: ' + (err.message || err.code || err));
      }
      setEmailLogs([]);
    }
  }
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    fetchContact();
    fetchAllCampaignEnrollments();
  }, [id]);

  const fetchCampaignsForModal = async () => {
    const { privateCampaigns, publicCampaigns } = await getCampaignsSplit();
    setPrivateCampaigns(privateCampaigns);
    setPublicCampaigns(publicCampaigns);
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this contact? This cannot be undone.')) {
      await deleteDoc(doc(db, 'contacts', id));
      navigate('/contacts');
    }
  };

  const handleFunctionSelect = (action) => {
    switch (action) {
      case 'sendEmail':
        setShowEmailModal(true); // Open the SendOneOffEmailModal
        break;
      case 'edit':
        navigate(`/contacts/${id}/edit`);
        break;
      case 'delete':
        handleDelete();
        break;
      default:
        break;
    }
  };

  // Helper to get last contact attempt (last phone call or email)
  function getLastContactAttempt(contact) {
    if (!contact) return '';
    if (contact.lastContacted) {
      if (contact.lastContacted.seconds) return new Date(contact.lastContacted.seconds * 1000).toLocaleString();
      return new Date(contact.lastContacted).toLocaleString();
    }
    return '';
  }
  // Helper to get last customer contact (appt date, last opened email, or phone call marked as made contact)
  function getLastCustomerContact(contact) {
    // Placeholder: use appointmentDate or lastOpenedContact
    if (contact.lastCustomerContact) {
      if (contact.lastCustomerContact.seconds) return new Date(contact.lastCustomerContact.seconds * 1000).toLocaleString();
      return new Date(contact.lastCustomerContact).toLocaleString();
    }
    if (contact.appointmentDate) {
      if (contact.appointmentDate.seconds) return new Date(contact.appointmentDate.seconds * 1000).toLocaleString();
      return new Date(contact.appointmentDate).toLocaleString();
    }
    return '';
  }

  const handleAssignToCampaign = async () => {
    if (!selectedCampaign) return;
    setAssignLoading(true);
    setAssignStatus('Assigning...');
    try {
      const result = await enrollContacts(selectedCampaign, [id]);
      console.log('[ContactDetailScreen] enrollContacts result:', result);
      // After campaign assignment attempt, handle result
      if (result.error) {
        setAssignStatus('Error assigning contact: ' + (result.error.message || result.error.code || result.error));
      } else if ((result.enrolled?.length === 0 && result.skipped?.length === 0) && result.reEnrollInfo) {
        // Defensive: treat as re-enrollment, not error
        setAssignStatus('Contact already enrolled in this campaign.');
      } else {
        setAssignStatus('Contact assigned to campaign successfully!');
        fetchAllCampaignEnrollments();
      }
      setAssignLoading(false);
    } catch (e) {
      setAssignStatus('Error assigning contact: ' + (e.message || e));
      setAssignLoading(false);
    }
  };

  const handleCompleteCampaign = async (enrollmentId) => {
    if (window.confirm('Mark this campaign as completed?')) {
      try {
        await updateDoc(doc(db, 'campaignEnrollments', enrollmentId), { status: 'completed' });
        setCampaignEnrollment(c => ({ ...c, status: 'completed' }));
        setCampaignStep(null);
        setNextSend(null);
        setEndingDate(null);
        setAssignStatus('Campaign marked as completed.');
        fetchAllCampaignEnrollments();
      } catch (e) {
        setAssignStatus('Error completing campaign: ' + (e.message || e));
      }
    }
  };

  // New: handle unenrollment
  const handleUnenroll = async (enrollmentId) => {
    if (window.confirm('Are you sure you want to withdraw from this campaign?')) {
      try {
        const result = await withdrawCampaignEnrollment({ enrollmentId });
        if (result.data && result.data.success) {
          setAssignStatus(`You have been withdrawn from the campaign. ${result.data.deleted || 0} unsent scheduled emails have been deleted.`);
        } else {
          setAssignStatus('Withdrawn, but could not confirm scheduled email deletion.');
        }
        await fetchAllCampaignEnrollments(); // Refresh UI
      } catch (e) {
        setAssignStatus('Error withdrawing from campaign: ' + (e.message || e));
        alert('Permission error or failed to withdraw: ' + (e.message || e));
      }
    }
  };

  // New: handle resending last email
  const handleResendEmail = async (log) => {
    if (window.confirm('Resend this email?')) {
      setAssignStatus('');
      try {
        // Find the campaign and enrollment for this email log
        const enrollment = historicalEnrollments.find(e => e.id === log.campaignEnrollmentId);
        const campaign = enrollment ? await getCampaign(enrollment.campaignId) : null;
        if (!campaign) throw new Error('Campaign not found');
        // Send the email using the campaign's email template
        await addDoc(collection(db, 'emailLogs'), {
          to: log.to,
          subject: log.subject,
          body: log.body,
          sentAt: new Date(),
          userId: JSON.parse(localStorage.getItem('user'))?.uid || null,
          contactId: id,
          campaignId: campaign.id,
          campaignEnrollmentId: enrollment.id,
        });
        setAssignStatus('Email resent successfully!');
        fetchContact(); // Refresh email logs
      } catch (e) {
        setAssignStatus('Error resending email: ' + (e.message || e));
      }
    }
  };

  // --- Email Logs Section ---
  const [emailLogPage, setEmailLogPage] = useState(1);
  const [emailLogPageSize, setEmailLogPageSize] = useState(10);
  const paginatedEmailLogs = emailLogs.slice((emailLogPage-1)*emailLogPageSize, emailLogPage*emailLogPageSize);
  const totalEmailLogPages = Math.ceil(emailLogs.length / emailLogPageSize);

  // Add note handler
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    const noteObj = { text: newNote.trim(), date: new Date().toLocaleDateString('en-US') };
    await updateDoc(doc(db, 'contacts', id), {
      notesList: arrayUnion(noteObj)
    });
    setNotes([...notes, noteObj]);
    setNewNote('');
    setShowAddNote(false);
  };

  // --- Save Note Handler ---
  const handleSaveNote = async (idx) => {
    if (editingNoteText.trim() === '') return;
    const updatedNotes = notes.map((n, i) =>
      i === idx ? { ...n, text: editingNoteText.trim(), date: new Date().toLocaleDateString('en-US') } : n
    );
    setNotes(updatedNotes);
    setEditingNoteIdx(null);
    setEditingNoteText('');
    // Update Firestore
    await updateDoc(doc(db, 'contacts', id), { notesList: updatedNotes });
  };

  // --- Delete Note Handler ---
  const handleDeleteNote = async (idx) => {
    const updatedNotes = notes.filter((_, i) => i !== idx);
    setNotes(updatedNotes);
    setEditingNoteIdx(null);
    setEditingNoteText('');
    // Update Firestore
    await updateDoc(doc(db, 'contacts', id), { notesList: updatedNotes });
  };
  // REMOVED: Duplicate campaign loading logic
  // This was causing the issue by overriding the state set by fetchAllCampaignEnrollments
  useEffect(() => {
    if (!campaignsLoaded && id) {
      // Simply mark as loaded since we're using fetchAllCampaignEnrollments as the single source of truth
      setCampaignsLoaded(true);
    }
  }, [campaignsLoaded, id]);

  // --- Fetch next scheduled email for each active campaign enrollment ---
  useEffect(() => {
    async function fetchNextSends() {
      console.log('[ContactDetailScreen] Fetching next send dates for active campaigns:', activeCampaigns.length);
      const mapping = {};
      for (const campaign of activeCampaigns) {
        const enrollmentId = campaign.enrollment?.id;
        if (!enrollmentId) {
          console.log('[ContactDetailScreen] Skipping campaign without enrollment ID:', campaign);
          continue;
        }
        console.log(`[ContactDetailScreen] Fetching next email for enrollment ${enrollmentId}`);
        try {
          const nextEmail = await getNextScheduledEmailForEnrollment(enrollmentId);
          if (nextEmail && nextEmail.scheduledFor && nextEmail.scheduledFor.seconds) {
            const date = new Date(nextEmail.scheduledFor.seconds * 1000);
            mapping[enrollmentId] = {
              date: date,
              emailDoc: nextEmail
            };
            console.log(`[ContactDetailScreen] Found next email for ${enrollmentId}:`, date.toLocaleString());
          } else {
            mapping[enrollmentId] = null;
            console.log(`[ContactDetailScreen] No next email found for ${enrollmentId}`);
          }
        } catch (error) {
          console.error(`[ContactDetailScreen] Error fetching next email for ${enrollmentId}:`, error);
          mapping[enrollmentId] = null;
        }
      }
      console.log('[ContactDetailScreen] Setting nextSendDates:', mapping);
      setNextSendDates(mapping);
    }
    if (activeCampaigns.length > 0) fetchNextSends();
    else setNextSendDates({});
  }, [activeCampaigns]);

  // Fetch completed dates for completed enrollments missing completedAt
  useEffect(() => {
    async function fetchCompletedDates() {
      const updates = {};
      for (const campaign of historicalCampaigns) {
        const enrollment = campaign.enrollment;
        if (enrollment.status === 'completed' && !enrollment.completedAt) {
          try {
            // FIX: Use campaignEnrollmentId instead of enrollmentId
            const q = query(
              collection(db, 'scheduledEmails'),
              where('campaignEnrollmentId', '==', enrollment.id),
              orderBy('sentAt', 'desc'),
              limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const lastEmail = snap.docs[0].data();
              updates[enrollment.id] = lastEmail.sentAt || lastEmail.scheduledFor;
            }
          } catch (e) {
            console.warn('Failed to fetch scheduledEmails for completed campaign', enrollment.id, e);
          }
        }
      }
      setCompletedDates(updates);
    }
    if (historicalCampaigns.length > 0) fetchCompletedDates();
  }, [historicalCampaigns]);

  // Helper to safely format Firestore timestamp fields
  function safeFormatDate(ts) {
    if (ts && typeof ts === 'object' && typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000).toLocaleString();
    }
    return '-';
  }

  // Helper to format phone numbers as (XXX)XXX-XXXX
  function formatPhone(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0,3)})${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return phone;
  }

  // --- Accordion Item Component for Historical Emails ---
  function HistoricalEmailAccordionItem({ log }) {
    const [open, setOpen] = React.useState(false);
    // Show 'Public/Private Campaign' or 'Public/Private One-off Email' based on log.type and log.public
    let displayTo = log.to;
    if (typeof log.public === 'boolean' && typeof log.type === 'string') {
      if (log.type === 'campaign') {
        displayTo = log.public ? 'Public Campaign' : 'Private Campaign';
      } else if (log.type === 'oneoff') {
        displayTo = log.public ? 'Public One-off Email' : 'Private One-off Email';
      }
    } else if (typeof log.public === 'boolean') {
      displayTo = log.public ? 'Public' : 'Private';
    }

    // --- Mail merge replacement logic ---
    function doMerge(str) {
      if (!str) return str;
      // Prefer mailMergeData from the log, fallback to log.contact, then contact
      const merge = log.mailMergeData || log.contact || contact || {};
      return str
        .replace(/\{\{firstName\}\}/gi, merge.firstName || '')
        .replace(/\{\{lastName\}\}/gi, merge.lastName || '')
        .replace(/\{\{quoteAmount\}\}/gi, merge.quoteAmount || '')
        .replace(/\{\{repName\}\}/gi, merge.repName || '')
        .replace(/\{\{appointmentDate\}\}/gi, merge.appointmentDate || '')
        .replace(/\{\{lastContacted\}\}/gi, merge.lastContacted || '')
        .replace(/\{\{signature\}\}/gi, merge.signature || '')
        .replace(/\{\{unsubscribeLink\}\}/gi, merge.unsubscribeLink || (log.to ? `<a href=\"https://rbaconnector.com/unsubscribe?email=${encodeURIComponent(log.to)}\">Unsubscribe</a>` : ''));
    }

    // --- Campaign name lookup ---
    const [campaignName, setCampaignName] = React.useState(null);
    React.useEffect(() => {
      if (log.campaignId) {
        import('../services/campaigns').then(mod => {
          mod.getCampaign(log.campaignId).then(camp => {
            setCampaignName(camp?.name || log.campaignId);
          }).catch(() => setCampaignName(log.campaignId));
        });
      }
    }, [log.campaignId]);

    return (
      <li style={{
        background: '#f6f6f6',
        borderRadius: 8,        border: '1px solid #eee',
        marginBottom: 12,
        minWidth: 600,
        maxWidth: 800,
        cursor: 'pointer',
        boxShadow: open ? '0 2px 8px #0002' : 'none',
        transition: 'box-shadow 0.2s',
        padding: open ? '18px 28px' : '18px 28px',
      }} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{log.subject || '(No Subject)'}</span>
            <span style={{ fontSize: 14, color: '#888' }}>{displayTo}</span>
            <span style={{ fontSize: 13, color: '#888' }}>{log.sentAt ? new Date(log.sentAt.seconds ? log.sentAt.seconds * 1000 : log.sentAt).toLocaleString() : ''}</span>
          </div>
          <span style={{ color: '#1976d2', fontWeight: 600, fontSize: 18 }}>{open ? '▲' : '▼'}</span>
        </div>
        {open && (
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 6, padding: 16, boxShadow: '0 1px 4px #0001', width: '100%' }}>
            <div style={{ marginBottom: 8 }}><b>Body:</b></div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, color: '#222', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: doMerge(log.body) || '(No Body)' }} />
            {log.campaignId && <div style={{ fontSize: 13, color: '#888' }}><b>Campaign:</b> {campaignName || log.campaignId}</div>}
            {log.campaignEnrollmentId && <div style={{ fontSize: 13, color: '#888' }}><b>Enrollment ID:</b> {log.campaignEnrollmentId}</div>}
          </div>
        )}
      </li>
    );
  }

  // Fetch tasks for this contact
  useEffect(() => {
    let ignore = false;
    async function fetchTasks() {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid || !id) {
        setActiveTasks([]);
        setHistoricalTasks([]);
        return;
      }
      const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('contactId', '==', id));
      const snapshot = await getDocs(q);
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (ignore) return;
      setActiveTasks(all.filter(t => !t.completed));
      setHistoricalTasks(all.filter(t => t.completed));
    }
    fetchTasks();
    return () => { ignore = true; };
  }, [id]);

  // --- InlineSendOneOffEmailForm component ---
  function InlineSendOneOffEmailForm({ contact, onSent, onCancel }) {
    const [templates, setTemplates] = React.useState([]);
    const [selectedTemplate, setSelectedTemplate] = React.useState('');
    const [subject, setSubject] = React.useState('');
    const [body, setBody] = React.useState('');
    const [sendTime, setSendTime] = React.useState('now');
    const [scheduledDate, setScheduledDate] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [success, setSuccess] = React.useState('');

    React.useEffect(() => {
      async function fetchTemplates() {
        let privateTemplates = [];
        let publicTemplates = [];
        try {
          const user = JSON.parse(localStorage.getItem('user'));
          if (user?.uid) {
            const qPrivate = window.firebase && window.firebase.firestore
              ? window.firebase.firestore().collection('emailTemplates').where('userId', '==', user.uid).where('public', '==', false)
              : null;
            if (qPrivate) {
              const snapPrivate = await qPrivate.get();
              privateTemplates = snapPrivate.docs.map(d => ({ id: d.id, ...d.data(), category: 'Private' }));
            }
          }
          const qPublic = window.firebase && window.firebase.firestore
            ? window.firebase.firestore().collection('emailTemplates').where('public', '==', true)
            : null;
          if (qPublic) {
            const snapPublic = await qPublic.get();
            publicTemplates = snapPublic.docs.map(d => ({ id: d.id, ...d.data(), category: 'Public' }));
          }
          const privateIds = new Set(privateTemplates.map(t => t.id));
          publicTemplates = publicTemplates.filter(t => !privateIds.has(t.id));
          setTemplates([
            { id: 'custom', name: 'Custom Email', subject: '', body: '', category: 'Custom' },
            ...privateTemplates,
            ...publicTemplates
          ]);
        } catch (err) {
          setTemplates([{ id: 'custom', name: 'Custom Email', subject: '', body: '', category: 'Custom' }]);
        }
      }
      fetchTemplates();
    }, []);

    React.useEffect(() => {
      if (selectedTemplate && selectedTemplate !== 'custom') {
        const t = templates.find(t => t.id === selectedTemplate);
        if (t) {
          setSubject(t.subject || '');
          setBody(t.body || '');
        }
      } else if (selectedTemplate === 'custom') {
        setSubject('');
        setBody('');
      }
    }, [selectedTemplate, templates]);

    const handleSend = async () => {
      setLoading(true);
      setError('');
      setSuccess('');
      try {
        if (sendTime === 'schedule' && scheduledDate) {
          const { Timestamp } = await import('firebase/firestore');
          const scheduledFor = Timestamp.fromDate(new Date(scheduledDate));
          await addDoc(collection(db, 'scheduledEmails'), {
            to: contact.email,
            subject,
            body,
            contactId: contact.id,
            templateId: selectedTemplate || null,
            userId: contact.userId || null,
            scheduledFor,
            createdAt: Timestamp.now(),
            status: 'pending',
          });
          setSuccess('Email scheduled!');
        } else {
          await import('../services/email').then(mod =>
            mod.sendOneOffEmail({
              to: contact.email,
              subject,
              body,
              contactId: contact.id,
              templateId: selectedTemplate || null
            })
          );
          setSuccess('Email sent!');
        }
        if (onSent) onSent();
        setTimeout(() => {
          setSelectedTemplate('');
          setSubject('');
          setBody('');
          setSendTime('now');
          setScheduledDate('');
          setSuccess('');
          setError('');
          if (onCancel) onCancel();
        }, 1200);
      } catch (e) {
        setError(e.message || 'Failed to send email.');
      }
      setLoading(false);
    };

    return (
      <div style={{ background: '#f6f6f6', borderRadius: 8, padding: 18, border: '1px solid #eee', marginBottom: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <b>To:</b> {contact.email} ({contact.firstName} {contact.lastName})
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Email Template: </label>
          <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={{ width: '100%' }}>
            <option value="">-- Select Template --</option>
            <option value="custom" style={{ fontWeight: 700, fontSize: 16 }}>Custom Email</option>
            {['Private', 'Public'].map(cat => [
              <optgroup key={cat} label={cat + ' Templates'}>
                {templates.filter(t => t.category === cat).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.subject} {t.category ? `(${t.category})` : ''}
                  </option>
                ))}
              </optgroup>
            ])}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Subject: </label>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Body: </label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} style={{ width: '100%' }} placeholder="You can use mail merge fields like {{firstName}}, {{lastName}}, {{currentPromotion}}, {{unsubscribeLink}}..." />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Send: </label>
          <select value={sendTime} onChange={e => setSendTime(e.target.value)}>
            <option value="now">Now</option>
            <option value="schedule">Schedule for Later</option>
          </select>
          {sendTime === 'schedule' && (
            <input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} style={{ marginLeft: 8 }} />
          )}
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        {success && <div style={{ color: 'green', marginBottom: 8 }}>{success}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onCancel} disabled={loading}>Cancel</button>
          <button onClick={handleSend} disabled={loading || !subject || !body}>Send</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
          <b>Mail Merge Fields:</b> {'{{firstName}}, {{lastName}}, {{currentPromotion}}, {{unsubscribeLink}}, etc.'}
        </div>
      </div>
    );
  }

  // --- Task Creation Form for Tasks section ---
  function InlineAddTaskForm({ contactId, onTaskAdded, onCancel }) {
    const [type, setType] = useState('Phone Call');
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError('');
      try {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user?.uid) throw new Error('Not logged in');
        const data = {
          contactId,
          type,
          dueDate: new Date(dueDate),
          notes,
          completed: false,
          createdAt: new Date(),
          userId: user.uid,
        };
        await addDoc(collection(db, 'tasks'), data);
        setType('Phone Call');
        setDueDate('');
        setNotes('');
        if (onTaskAdded) onTaskAdded();
        if (onCancel) onCancel();
      } catch (err) {
        setError(err.message || 'Failed to add task');
      }
      setLoading(false);
    };

    return (
      <form onSubmit={handleSubmit} style={{ background: '#f6f6f6', borderRadius: 8, padding: 18, border: '1px solid #eee', marginBottom: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <label>Type: </label>
          <select value={type} onChange={e => setType(e.target.value)} style={{ marginBottom: 8, width: '100%' }}>
            <option value="Phone Call">Phone Call</option>
            <option value="Email">Email</option>
            <option value="In Person Visit">In Person Visit</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Due Date: </label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required style={{ marginBottom: 8, width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Notes: </label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" style={{ marginBottom: 8, width: '100%' }} />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={onCancel} disabled={loading}>Cancel</button>
          <button type="submit" disabled={loading || !dueDate || !type}>Add Task</button>
        </div>
      </form>
    );
  }

  // Fetch active scheduled emails for this contact
  useEffect(() => {
    let ignore = false;
    async function fetchActiveEmails() {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid || !id) {
        setActiveEmails([]);
        return;
      }
      const q = query(
        collection(db, 'scheduledEmails'),
        where('userId', '==', user.uid),
        where('contactId', '==', id),
        where('status', 'in', ['pending', 'scheduled'])
      );
      const snapshot = await getDocs(q);
      if (ignore) return;
      setActiveEmails(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
    fetchActiveEmails();
    return () => { ignore = true; };
  }, [id, showAddEmailAccordion]);

  // --- Inline Edit Task Form ---
  function InlineEditTaskForm({ task, onSave, onCancel, onDelete, onComplete }) {
    const [type, setType] = useState(task.type || 'Phone Call');
    const [dueDate, setDueDate] = useState(task.dueDate ? (task.dueDate.seconds ? new Date(task.dueDate.seconds * 1000).toISOString().slice(0,10) : new Date(task.dueDate).toISOString().slice(0,10)) : '');
    const [notes, setNotes] = useState(task.notes || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
      setLoading(true);
      setError('');
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          type,
          dueDate: new Date(dueDate),
          notes,
        });
        if (onSave) onSave();
      } catch (err) {
        setError(err.message || 'Failed to update task');
      }
      setLoading(false);
    };

    const handleDelete = async () => {
      if (!window.confirm('Delete this task?')) return;
      setLoading(true);
      setError('');
      try {
        await deleteDoc(doc(db, 'tasks', task.id));
        if (onDelete) onDelete();
      } catch (err) {
        setError(err.message || 'Failed to delete task');
      }
      setLoading(false);
    };

    const handleComplete = async () => {
      setLoading(true);
      setError('');
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          completed: true,
          completedAt: new Date(),
        });
        if (onComplete) onComplete();
      } catch (err) {
        setError(err.message || 'Failed to complete task');
      }
      setLoading(false);
    };

    return (
      <div style={{ background: '#f6f6f6', borderRadius: 8, padding: 18, border: '1px solid #eee', margin: '12px 0 0 0' }}>
        <div style={{ marginBottom: 12 }}>
          <label>Type: </label>
          <select value={type} onChange={e => setType(e.target.value)} style={{ marginBottom: 8, width: '100%' }}>
            <option value="Phone Call">Phone Call</option>
            <option value="Email">Email</option>
            <option value="In Person Visit">In Person Visit</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Due Date: </label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required style={{ marginBottom: 8, width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Notes: </label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" style={{ marginBottom: 8, width: '100%' }} />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={onCancel} disabled={loading}>Cancel</button>
          <button type="button" onClick={handleDelete} disabled={loading} style={{ color: '#d32f2f' }}>Delete</button>
          <button type="button" onClick={handleComplete} disabled={loading}>Complete</button>
          <button type="button" onClick={handleSave} disabled={loading || !dueDate || !type}>Save</button>
        </div>
      </div>
    );
  }
  // --- Phone Calls Card State ---
  const [showAddPhoneCallAccordion, setShowAddPhoneCallAccordion] = useState(false);
  const [phoneCallNotes, setPhoneCallNotes] = useState('');
  const [phoneCallDueDate, setPhoneCallDueDate] = useState('');
  const [phoneCallDueTime, setPhoneCallDueTime] = useState('');
  const [phoneCallLoading, setPhoneCallLoading] = useState(false);
  const [phoneCallError, setPhoneCallError] = useState('');
  const [openCallIdx, setOpenCallIdx] = useState(null); // for accordion
  const [editingCallNotes, setEditingCallNotes] = useState('');
  const [editingCallDueDate, setEditingCallDueDate] = useState('');
  const [editingCallDueTime, setEditingCallDueTime] = useState('');

  // --- In Person Visits Card State ---
  const [showAddInPersonVisitAccordion, setShowAddInPersonVisitAccordion] = useState(false);
  const [inPersonVisitNotes, setInPersonVisitNotes] = useState('');
  const [inPersonVisitDueDate, setInPersonVisitDueDate] = useState('');
  const [inPersonVisitDueTime, setInPersonVisitDueTime] = useState('');
  const [inPersonVisitLoading, setInPersonVisitLoading] = useState(false);
  const [inPersonVisitError, setInPersonVisitError] = useState('');
  const [openVisitIdx, setOpenVisitIdx] = useState(null); // for accordion
  const [editingVisitNotes, setEditingVisitNotes] = useState('');
  const [editingVisitDueDate, setEditingVisitDueDate] = useState('');
  const [editingVisitDueTime, setEditingVisitDueTime] = useState('');

  // Helper to get a sortable date for a call (future first, then current, then past)
  function getSortableCallDate(call) {
    let d = call.dueDate || call.createdAt;
    if (d && typeof d === 'object' && d.seconds) d = new Date(d.seconds * 1000);
    else if (d) d = new Date(d);
    else d = new Date(0);
    return d;
  }

  function formatDateMMDDYYYY(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return '-';
    return d.toLocaleDateString('en-US');
  }

  function getCallStatusAndDate(call) {
    const now = new Date();
    let status = 'Active';
    let date = call.dueDate || call.createdAt;
    if (call.completed) {
      status = 'Completed';
      date = call.completedDate || call.dueDate || call.createdAt;
    } else if (call.dueDate && new Date(call.dueDate) < now) {
      status = 'Overdue';
    }
    return { status, date: formatDateMMDDYYYY(date) };
  }

  const phoneCallsFromTasks = activeTasks
    .concat(historicalTasks)
    .filter(t => t.type === 'Phone Call')
    .sort((a, b) => {
      const dateA = new Date(a.dueDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.dueDate || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  const handleSavePhoneCall = async (idx) => {
    if (editingCallNotes.trim() === '' || !editingCallDueDate) return;
    try {
      const updatedCall = {
        ...phoneCallsFromTasks[idx],
        notes: editingCallNotes.trim(),
        dueDate: editingCallDueDate,
      };
      await updateDoc(doc(db, 'tasks', phoneCallsFromTasks[idx].id), {
        notes: updatedCall.notes,
        dueDate: updatedCall.dueDate,
      });
      // Update local state for immediate UI feedback
      if (!phoneCallsFromTasks[idx].completed) {
        const updatedTasks = activeTasks.map((t) =>
          t.id === updatedCall.id ? { ...t, notes: updatedCall.notes, dueDate: updatedCall.dueDate } : t
        );
        setActiveTasks(updatedTasks);
      }
      setOpenCallIdx(null);
      setEditingCallNotes('');
      setEditingCallDueDate('');
    } catch (e) {
      setPhoneCallError('Error saving phone call: ' + (e.message || e));
    }
  };

  const handleDeletePhoneCall = async (idx) => {
    if (window.confirm('Are you sure you want to delete this phone call task?')) {
      try {
        const callToDelete = phoneCallsFromTasks[idx];
        await deleteDoc(doc(db, 'tasks', callToDelete.id));
        
        // Update local state for immediate UI feedback
        if (!callToDelete.completed) {
          const updatedTasks = activeTasks.filter(t => t.id !== callToDelete.id);
          setActiveTasks(updatedTasks);
        } else {
          const updatedTasks = historicalTasks.filter(t => t.id !== callToDelete.id);
          setHistoricalTasks(updatedTasks);
        }
        
        setOpenCallIdx(null);
        setEditingCallNotes('');
        setEditingCallDueDate('');
      } catch (e) {
        setPhoneCallError('Error deleting phone call: ' + (e.message || e));
      }
    }
  };

  const handleLogPhoneCall = async () => {
    if (!phoneCallNotes.trim() || !phoneCallDueDate || !phoneCallDueTime) return;
    setPhoneCallLoading(true);
    setPhoneCallError('');
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const dueDateTime = new Date(phoneCallDueDate + 'T' + phoneCallDueTime);
      await addDoc(collection(db, 'tasks'), {
        contactId: id,
        type: 'Phone Call',
        notes: phoneCallNotes,
        dueDate: dueDateTime,
        completed: false,
        userId: user?.uid || null,
        createdAt: new Date(),
      });
      setPhoneCallNotes('');
      setPhoneCallDueDate('');
      setPhoneCallDueTime('');
      setShowAddPhoneCallAccordion(false);
    } catch (e) {
      setPhoneCallError('Error logging call: ' + (e.message || e));
    }    setPhoneCallLoading(false);
  };

  // --- In Person Visit handlers ---
  const inPersonVisitsFromTasks = activeTasks
    .concat(historicalTasks)
    .filter(t => t.type === 'In Person Visit');

  const handleSaveInPersonVisit = async (idx) => {
    try {
      const updatedVisit = {
        ...inPersonVisitsFromTasks[idx],
        notes: editingVisitNotes,
        dueDate: new Date(editingVisitDueDate + 'T' + editingVisitDueTime),
      };
      
      await updateDoc(doc(db, 'tasks', updatedVisit.id), {
        notes: updatedVisit.notes,
        dueDate: updatedVisit.dueDate,
      });
      // Update local state for immediate UI feedback
      if (!inPersonVisitsFromTasks[idx].completed) {
        const updatedTasks = activeTasks.map((t) =>
          t.id === updatedVisit.id ? { ...t, notes: updatedVisit.notes, dueDate: updatedVisit.dueDate } : t
        );
        setActiveTasks(updatedTasks);
      }
      setOpenVisitIdx(null);
      setEditingVisitNotes('');
      setEditingVisitDueDate('');
    } catch (e) {
      setInPersonVisitError('Error saving in person visit: ' + (e.message || e));
    }
  };

  const handleDeleteInPersonVisit = async (idx) => {
    if (window.confirm('Are you sure you want to delete this in person visit task?')) {
      try {
        const visitToDelete = inPersonVisitsFromTasks[idx];
        await deleteDoc(doc(db, 'tasks', visitToDelete.id));
        
        // Update local state for immediate UI feedback
        if (!visitToDelete.completed) {
          const updatedTasks = activeTasks.filter(t => t.id !== visitToDelete.id);
          setActiveTasks(updatedTasks);
        } else {
          const updatedTasks = historicalTasks.filter(t => t.id !== visitToDelete.id);
          setHistoricalTasks(updatedTasks);
        }
        
        setOpenVisitIdx(null);
        setEditingVisitNotes('');
        setEditingVisitDueDate('');
      } catch (e) {
        setInPersonVisitError('Error deleting in person visit: ' + (e.message || e));
      }
    }
  };

  // --- Phone Calls Section ---
  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div className="contact-detail-container" style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* --- TOP CARD: Contact Header --- */}
        <div style={{
          width: '98vw',
          maxWidth: 800,
          minWidth: 320,
          marginLeft: 'auto',
          marginRight: 'auto',
          marginTop: 0,
          marginBottom: 16,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          position: 'relative',
          zIndex: 2,
          padding: 32,
          display: 'flex',
          gap: 32,
          alignItems: 'center',
        }}>
          <img src={Logo} alt="Logo" style={{ width: 80, height: 80, objectFit: 'contain', marginRight: 16 }} />
          <div style={{ flex: 1, minWidth: 200 }}>            <div style={{ fontSize: 28, fontWeight: 800, color: '#222', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              {!isEditingMainCard ? (
                <>
                  {contact?.firstName} {contact?.lastName}
                  <a href="#" onClick={e => { 
                    e.preventDefault(); 
                    setIsEditingMainCard(true);
                    setEditMainCardData({
                      firstName: contact?.firstName || '',
                      lastName: contact?.lastName || '',
                      email: contact?.email || '',
                      mobilePhone: contact?.mobilePhone || '',
                      homePhone: contact?.homePhone || '',
                      emailOptOut: contact?.emailOptOut || false,
                      phoneOptOut: contact?.phoneOptOut || false
                    });
                  }} style={{ fontSize: 15, color: '#1976d2', textDecoration: 'underline', fontWeight: 500, marginLeft: 4, cursor: 'pointer' }}>edit</a>
                </>
              ) : (                <div style={{ width: '100%' }}>
                  {/* Name Fields */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={editMainCardData.firstName}
                      onChange={e => setEditMainCardData(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="First Name"
                      style={{ ...inputStyle, fontSize: 18, fontWeight: 600, padding: '6px 10px', flex: 1 }}
                    />
                    <input
                      type="text"
                      value={editMainCardData.lastName}
                      onChange={e => setEditMainCardData(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Last Name"
                      style={{ ...inputStyle, fontSize: 18, fontWeight: 600, padding: '6px 10px', flex: 1 }}
                    />
                  </div>
                  
                  {/* Email Field */}
                  <div style={{ marginBottom: 12 }}>
                    <input
                      type="email"
                      value={editMainCardData.email}
                      onChange={e => setEditMainCardData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Email"
                      style={{ ...inputStyle, padding: '6px 10px', width: '100%' }}
                    />
                  </div>
                  
                  {/* Phone Fields */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      type="tel"
                      value={editMainCardData.mobilePhone}
                      onChange={e => setEditMainCardData(prev => ({ ...prev, mobilePhone: e.target.value }))}
                      placeholder="Mobile Phone"
                      style={{ ...inputStyle, padding: '6px 10px', flex: 1 }}
                    />
                    <input
                      type="tel"
                      value={editMainCardData.homePhone}
                      onChange={e => setEditMainCardData(prev => ({ ...prev, homePhone: e.target.value }))}
                      placeholder="Home Phone"
                      style={{ ...inputStyle, padding: '6px 10px', flex: 1 }}
                    />
                  </div>
                  
                  {/* Checkboxes */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editMainCardData.emailOptOut}
                        onChange={e => setEditMainCardData(prev => ({ ...prev, emailOptOut: e.target.checked }))}
                        style={{ marginRight: 6 }}
                      />
                      Do Not Email
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editMainCardData.phoneOptOut}
                        onChange={e => setEditMainCardData(prev => ({ ...prev, phoneOptOut: e.target.checked }))}
                        style={{ marginRight: 6 }}
                      />
                      Do Not Call
                    </label>
                  </div>
                  
                  {/* Save/Cancel Buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'contacts', id), {
                            firstName: editMainCardData.firstName,
                            lastName: editMainCardData.lastName,
                            email: editMainCardData.email,
                            mobilePhone: editMainCardData.mobilePhone,
                            homePhone: editMainCardData.homePhone,
                            emailOptOut: editMainCardData.emailOptOut,
                            phoneOptOut: editMainCardData.phoneOptOut,
                            unsubscribed: editMainCardData.emailOptOut,
                            doNotCall: editMainCardData.phoneOptOut
                          });
                          setContact(prev => ({ 
                            ...prev, 
                            ...editMainCardData,
                            unsubscribed: editMainCardData.emailOptOut,
                            doNotCall: editMainCardData.phoneOptOut
                          }));
                          setIsEditingMainCard(false);
                        } catch (err) {
                          console.error('Error updating contact:', err);
                        }
                      }}
                      style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingMainCard(false)}
                      style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!isEditingMainCard && (
              <>
                {/* Show mobile or home number as clickable link, with label */}
                {contact?.mobilePhone ? (
                  <div style={{ fontSize: 17, color: '#1976d2', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#555', marginRight: 6 }}>Mobile:</span>
                    <a href={`tel:${contact.mobilePhone}`} onClick={e => { e.preventDefault(); window.open(`tel:${contact.mobilePhone}`); }} style={{ color: '#1976d2', textDecoration: 'underline', fontWeight: 500 }}>
                      {formatPhone(contact.mobilePhone)}
                    </a>
                  </div>
                ) : contact?.homePhone ? (
                  <div style={{ fontSize: 17, color: '#1976d2', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#555', marginRight: 6 }}>Home:</span>
                    <a href={`tel:${contact.homePhone}`} onClick={e => { e.preventDefault(); window.open(`tel:${contact.homePhone}`); }} style={{ color: '#1976d2', textDecoration: 'underline', fontWeight: 500 }}>
                      {formatPhone(contact.homePhone)}
                    </a>
                  </div>                ) : null}
                {/* Email as clickable link, opens enroll/send logic */}                {contact?.email && (
                  <div style={{ fontSize: 17, color: '#1976d2', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#555', marginRight: 6 }}>Email:</span>
                    <a href="#" onClick={e => { e.preventDefault(); setShowEmailModal(true); }} style={{ color: '#1976d2', textDecoration: 'underline', fontWeight: 500 }}>
                      {contact.email}
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', alignItems: 'center', height: '100%' }}>
            {[
              showContactInfo,
              showNotesSection,
              showPhoneCalls,
              showActiveCampaigns,
              showHistoricalCampaignsSection,              showActiveTasksSection,
              showHistoricalTasksSection,
              showEmailsSection
            ].some(v => !v) ? (
              <button onClick={showAll} style={{ ...buttonOutlineStyle, fontWeight: 700, fontSize: 16 }}>Show All</button>
            ) : (
              <button onClick={hideAll} style={{ ...buttonOutlineStyle, fontWeight: 700, fontSize: 16 }}>Hide All</button>
            )}
          </div>
        </div>        {/* --- MAIN CARDS --- */}
        <section className="contact-info-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8, minHeight: 44, marginTop: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'left', marginTop: 0, marginLeft: 0 }}>Contact Details</span>
              <button 
                onClick={() => setShowContactInfo(v => !v)} 
                style={{ marginLeft: 16, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}
              >
                {showContactInfo ? 'Hide' : 'Show'}
              </button>              {showContactInfo && !isEditingContact && (
                <button                  onClick={() => {
                    setIsEditingContact(true);
                    setEditContactData({
                      appointmentDate: contact?.appointmentDate ? (contact.appointmentDate.seconds ? new Date(contact.appointmentDate.seconds * 1000).toISOString().slice(0,10) : new Date(contact.appointmentDate).toISOString().slice(0,10)) : '',
                      area: contact?.area || contact?.zipCode || '',
                      quoteAmount: contact?.quoteAmount || '',
                      numDoors: contact?.numDoors || '',
                      numWindows: contact?.numWindows || '',
                      status: contact?.status || 'prospect',
                      prospect: contact?.prospect || false,
                      willPurchaseFuture: contact?.willPurchaseFuture || '',
                      allOwnersPresent: contact?.allOwnersPresent || false,
                      reasonNoSale: contact?.reasonNoSale || ''
                    });
                  }}
                  style={{ marginLeft: 8, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}
                >
                  Edit
                </button>
              )}
              {showContactInfo && isEditingContact && (
                <div style={{ marginLeft: 8, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setIsEditingContact(false)}
                    style={{ fontSize: 13, background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>                  <button
                    onClick={async () => {
                      try {
                        // Prepare update data for contact details
                        const updateData = {};
                        
                        // Handle appointment date
                        if (editContactData.appointmentDate) {
                          updateData.appointmentDate = new Date(editContactData.appointmentDate);
                        }
                        
                        // Handle basic fields
                        updateData.area = editContactData.area || '';
                        updateData.quoteAmount = editContactData.quoteAmount ? parseFloat(editContactData.quoteAmount) : null;
                        updateData.numDoors = editContactData.numDoors ? parseInt(editContactData.numDoors) : null;
                        updateData.numWindows = editContactData.numWindows ? parseInt(editContactData.numWindows) : null;
                        updateData.status = editContactData.status || 'prospect';
                        updateData.prospect = editContactData.prospect;
                        updateData.willPurchaseFuture = editContactData.willPurchaseFuture || '';
                        updateData.allOwnersPresent = editContactData.allOwnersPresent;
                        updateData.reasonNoSale = editContactData.reasonNoSale || '';
                        
                        // Update Firestore
                        await updateDoc(doc(db, 'contacts', id), updateData);
                        
                        // Update local state
                        setContact(prevContact => ({
                          ...prevContact,
                          ...updateData
                        }));
                        
                        // Exit edit mode
                        setIsEditingContact(false);
                        
                      } catch (error) {
                        console.error('Error updating contact:', error);
                        alert('Error saving changes: ' + (error.message || error));
                      }
                    }}
                    style={{ fontSize: 13, background: 'none', border: 'none', color: '#5BA150', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>            {showContactInfo && !isEditingContact && (
              <div style={{ padding: '0 16px' }}>
                {/* Row 1: Appointment Date */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Appointment Date: </span>
                      <span>{contact?.appointmentDate ? (contact.appointmentDate.seconds ? new Date(contact.appointmentDate.seconds * 1000).toLocaleDateString() : new Date(contact.appointmentDate).toLocaleDateString()) : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Area and Quote Amount */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Area: </span>
                      <span>{contact?.area || contact?.zipCode || '-'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Quote Amount: </span>
                      <span>{contact?.quoteAmount != null ? `$${contact.quoteAmount}` : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Row 3: Number of Doors and Windows */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Number of Doors: </span>
                      <span>{contact?.numDoors !== undefined ? contact.numDoors : '-'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Number of Windows: </span>
                      <span>{contact?.numWindows !== undefined ? contact.numWindows : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Row 4: Status and Prospect */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Status: </span>
                      <span>{contact?.status ? contact.status.charAt(0).toUpperCase() + contact.status.slice(1).replace(/_/g, ' ') : '-'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Prospect: </span>
                      <span>{contact?.prospect ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>

                {/* Row 5: Will Purchase in Future and All Owners Present */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>Will Purchase in Future: </span>
                      <span>{contact?.willPurchaseFuture !== undefined ? contact.willPurchaseFuture : '-'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: '#555' }}>All Owners Present: </span>
                      <span>{contact?.allOwnersPresent !== undefined ? (contact.allOwnersPresent ? 'Yes' : 'No') : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Row 6: Reason No Sale */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, color: '#555', marginBottom: 4 }}>Reason No Sale:</span>
                    <span>{contact?.reasonNoSale || '-'}</span>
                  </div>
                </div>
              </div>
            )}            {showContactInfo && isEditingContact && (
              <div style={{ padding: '0 16px' }}>
                {/* Contact Details Edit Form */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Appointment Date:</label>
                  <input 
                    type="date" 
                    value={editContactData.appointmentDate || ''}
                    onChange={(e) => setEditContactData({...editContactData, appointmentDate: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Area:</label>
                    <input 
                      type="text" 
                      value={editContactData.area || ''}
                      onChange={(e) => setEditContactData({...editContactData, area: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Quote Amount:</label>
                    <input 
                      type="number" 
                      value={editContactData.quoteAmount || ''}
                      onChange={(e) => setEditContactData({...editContactData, quoteAmount: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Number of Doors:</label>
                    <input 
                      type="number" 
                      value={editContactData.numDoors || ''}
                      onChange={(e) => setEditContactData({...editContactData, numDoors: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Number of Windows:</label>
                    <input 
                      type="number" 
                      value={editContactData.numWindows || ''}
                      onChange={(e) => setEditContactData({...editContactData, numWindows: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Status:</label>
                    <select 
                      value={editContactData.status || 'prospect'}
                      onChange={(e) => setEditContactData({...editContactData, status: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                    >
                      <option value="prospect">Prospect</option>
                      <option value="lead">Lead</option>
                      <option value="customer">Customer</option>
                      <option value="closed_won">Closed Won</option>
                      <option value="closed_lost">Closed Lost</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Will Purchase in Future:</label>
                    <input 
                      type="text" 
                      value={editContactData.willPurchaseFuture || ''}
                      onChange={(e) => setEditContactData({...editContactData, willPurchaseFuture: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={editContactData.prospect || false}
                        onChange={(e) => setEditContactData({...editContactData, prospect: e.target.checked})}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ fontWeight: 600 }}>Prospect</span>
                    </label>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={editContactData.allOwnersPresent || false}
                        onChange={(e) => setEditContactData({...editContactData, allOwnersPresent: e.target.checked})}
                        style={{ marginRight: 8 }}
                      />
                      <span style={{ fontWeight: 600 }}>All Owners Present</span>
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Reason No Sale:</label>
                  <textarea 
                    value={editContactData.reasonNoSale || ''}
                    onChange={(e) => setEditContactData({...editContactData, reasonNoSale: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, minHeight: 80, resize: 'vertical' }}
                    placeholder="Enter reason if no sale..."
                  />
                </div>
              </div>
            )}
          </div>
        </section>
        {/* Notes Section */}
        <section className="notes-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8, minHeight: 44, marginTop: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'left', marginTop: 0, marginLeft: 0 }}>Notes</span>
              <button onClick={() => setShowNotesSection(v => !v)} style={{ marginLeft: 16, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}>{showNotesSection ? 'Hide' : 'Show'}</button>
            </div>
            {showNotesSection && (
              <div style={{ width: '100%' }}>                {/* Add Note input and button, visible when card is unhidden */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, width: '100%', gap: 8 }}>
                  <input
                    type="text"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Add a note"
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px', 
                      border: '1px solid #ccc', 
                      borderRadius: 4, 
                      fontSize: 14,
                      height: '36px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    style={{ 
                      background: '#5BA150', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: 4, 
                      padding: '8px 16px', 
                      fontWeight: 600,
                      height: '36px',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      opacity: !newNote.trim() ? 0.6 : 1
                    }}
                  >
                    Add Note
                  </button>
                </div>
                {/* Notes List - match Historical Emails list style */}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, width: '100%' }}>
                  {[...notes]
                    .sort((a, b) => {
                      // Parse dates as MM/DD/YYYY or ISO, fallback to string compare
                      const dateA = a.date ? new Date(a.date) : new Date(0);
                      const dateB = b.date ? new Date(b.date) : new Date(0);
                      return dateB - dateA;
                    })
                    .map((note, idx, arr) => {
                      // idx here is the index in the sorted array, not the original notes array
                      // To get the original index for edit/delete, find it in the original notes array
                      const origIdx = notes.findIndex(n => n === note);
                      return (
                        <li
                          key={origIdx}
                          style={{
                            background: '#f6f6f6',
                            borderRadius: 8,
                            border: '1px solid #eee',                            marginBottom: 12,
                            padding: editingNoteIdx === origIdx ? '18px 28px' : '18px 28px',
                            cursor: 'pointer',
                            boxShadow: editingNoteIdx === origIdx ? '0 2px 8px #0002' : 'none',
                            transition: 'box-shadow 0.2s',
                            width: '100%',
                            minWidth: 600,
                            maxWidth: 800,
                            boxSizing: 'border-box',
                          }}
                          onClick={() => {
                            if (editingNoteIdx !== origIdx) {
                              setEditingNoteIdx(origIdx);
                              setEditingNoteText(note.text);
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            {editingNoteIdx === origIdx ? (
                              <input
                                type="text"
                                value={editingNoteText}
                                onChange={e => setEditingNoteText(e.target.value)}
                                placeholder="Edit note text"
                                style={{ ...inputStyle, flex: 1, fontSize: 16, marginRight: 8 }}
                                autoFocus
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span style={{ fontWeight: 500, fontSize: 16, flex: 1 }}>{note.text}</span>
                            )}
                            <span style={{ fontSize: 13, color: '#888', marginLeft: 16, whiteSpace: 'nowrap' }}>{note.date ? new Date(note.date).toLocaleDateString('en-US') : '-'}</span>
                          </div>
                          {/* Accordion-style edit form under the note */}
                          {editingNoteIdx === origIdx && (
                            <div style={{ marginTop: 16, background: '#fff', borderRadius: 6, padding: 16, boxShadow: '0 1px 4px #0001', width: '100%' }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setEditingNoteIdx(null); setEditingNoteText(''); }}
                                  style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleSaveNote(origIdx); }}
                                  style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}
                                  disabled={!editingNoteText.trim()}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteNote(origIdx); }}
                                  style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}          </div>
        </section>

        {/* Contact Engagement & Heat Score Section */}
        <section className="contact-engagement-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>
            <ContactEngagementCard contactId={id} />
          </div>
        </section>

        {/* Phone Calls Section */}
        <section className="phone-calls-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8, minHeight:  44, marginTop: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'left', marginTop: 0, marginLeft:  0 }}>Phone Calls</span>
              <button onClick={() => setShowPhoneCalls(v => !v)} style={{ marginLeft: 16, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}>{showPhoneCalls ? 'Hide' : 'Show'}</button>
            </div>
            {showPhoneCalls && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, width: '100%' }}>
                  <div style={{ width: '100%' }}>
                    <button
                      style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 600, marginBottom: 8 }}
                      onClick={() => setShowAddPhoneCallAccordion(v => !v)}
                    >
                      Add Phone Call

                    </button>
                    {showAddPhoneCallAccordion && (
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
                        <form onSubmit={async e => {
                          e.preventDefault();
                          if (!phoneCallNotes?.trim() || !phoneCallDueDate || !phoneCallDueTime) return;
                          setPhoneCallLoading(true);
                          setPhoneCallError('');
                          try {
                            const user = JSON.parse(localStorage.getItem('user'));
                            const dueDateTime = new Date(phoneCallDueDate + 'T' + phoneCallDueTime);
                            await addDoc(collection(db, 'tasks'), {
                              contactId: id,
                              type: 'Phone Call',
                              notes: phoneCallNotes,
                              dueDate: dueDateTime,
                              completed: false,
                              userId: user?.uid || null,
                              createdAt: new Date(),
                            });
                            setPhoneCallNotes('');
                            setPhoneCallDueDate('');
                            setPhoneCallDueTime('');
                            setShowAddPhoneCallAccordion(false);
                            // Refresh tasks so new call appears
                            let ignore = false;
                            async function fetchTasks() {
                              const user = JSON.parse(localStorage.getItem('user'));
                              if (!user?.uid || !id) {
                                setActiveTasks([]);
                                setHistoricalTasks([]);
                                return;
                              }
                              const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('contactId', '==', id));
                              const snapshot = await getDocs(q);
                              const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                              if (ignore) return;
                              setActiveTasks(all.filter(t => !t.completed));
                              setHistoricalTasks(all.filter(t => t.completed));
                            }
                            fetchTasks();
                          } catch (e) {
                            setPhoneCallError('Error logging call: ' + (e.message || e));
                          }
                          setPhoneCallLoading(false);
                        }}>
                          <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                            <label style={{ fontWeight: 600, minWidth: 80 }}>Due Date:</label>
                            <input type="date" value={phoneCallDueDate || ''} onChange={e => setPhoneCallDueDate(e.target.value)} required style={{ marginRight: 8, fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                            <input type="time" value={phoneCallDueTime || ''} onChange={e => setPhoneCallDueTime(e.target.value)} required style={{ fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc', minWidth: 100 }} />
                          </div>
                          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                            <label style={{ fontWeight: 600, minWidth: 80 }}>Notes:</label>
                            <input type="text" value={phoneCallNotes || ''} onChange={e => setPhoneCallNotes(e.target.value)} required style={{ flex: 1, fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                          </div>
                          {phoneCallError && <div style={{ color: 'red', marginBottom: 8 }}>{phoneCallError}</div>}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                            <button type="button" onClick={() => setShowAddPhoneCallAccordion(false)} disabled={phoneCallLoading} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Cancel</button>
                            <button type="submit" disabled={phoneCallLoading || !phoneCallNotes?.trim() || !phoneCallDueDate || !phoneCallDueTime} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Save</button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, width: '100%' }}>
                  {activeTasks.concat(historicalTasks)
                    .filter(t => t.type === 'Phone Call')
                    .sort((a, b) => {
                      // Sort: furthest future at top, then current, then past (furthest past at bottom)
                      const now = new Date();
                      now.setHours(0,0,0,0);
                      const dateA = getSortableCallDate(a);
                      const dateB = getSortableCallDate(b);
                      // Both future
                      if (dateA > now && dateB > now) return dateB - dateA;
                      // Both past or today
                      if (dateA <= now && dateB <= now) return dateB - dateA;
                      // One future, one not
                      if (dateA > now) return -1;
                      if (dateB > now) return 1;
                      return 0;
                    })
                    .map((call, idx, arr) => {
                      let status = '';
                      let dateVal = '';
                      if (call.completed) {
                        status = 'Completed';
                        dateVal = call.completedDate || call.dueDate || call.createdAt;
                      } else if (call.dueDate) {
                        const due = new Date(call.dueDate);
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        if (due < today) {
                          status = 'Overdue';
                          dateVal = call.dueDate;
                        } else {
                          status = 'Active';
                          dateVal = call.dueDate;
                        }
                      } else {
                        status = 'Active';
                        dateVal = call.createdAt;
                      }
                      let dateStr = '';
                      if (dateVal) {
                        if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
                          // Parse as local date, not UTC
                          const [y, m, d] = dateVal.split('T')[0].split('-');
                          const localDate = new Date(Number(y), Number(m) - 1, Number(d));
                          dateStr = localDate.toLocaleDateString();
                        } else if (typeof dateVal === 'object' && dateVal.seconds) {
                          const d = new Date(dateVal.seconds * 1000);
                          dateStr = d.toLocaleDateString();
                        } else {
                          const d = new Date(dateVal);
                          dateStr = d.toLocaleDateString();
                        }
                      }
                      const isEditable = status === 'Active' || status === 'Overdue';
                      const isOpen = openCallIdx === idx;
                      return (
                        <li
                          key={call.id || idx}
                          style={{
                            background: '#f6f6f6',
                            borderRadius: 8,
                            border: '1px solid #eee',
                            marginBottom: 12,
                            padding: '18px 28px',
                            minWidth: 600,
                            maxWidth: 900,
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            cursor: isEditable ? 'pointer' : 'default',
                            boxShadow: isOpen ? '0 2px 8px #0002' : 'none',
                            transition: 'box-shadow 0.2s',
                            flexDirection: 'column',
                          }}
                          onClick={() => {
                            if (isEditable) {
                              setOpenCallIdx(isOpen ? null : idx);
                              setEditingCallNotes(call.notes || call.outcomeNotes || call.reason || '');
                              setEditingCallDueDate(call.dueDate ? (typeof call.dueDate === 'object' && call.dueDate.seconds ? new Date(call.dueDate.seconds * 1000).toISOString().slice(0,10) : new Date(call.dueDate).toISOString().slice(0,10)) : '');
                              setEditingCallDueTime(call.dueDate ? (typeof call.dueDate === 'object' && call.dueDate.seconds ? new Date(call.dueDate.seconds * 1000).toISOString().slice(11,16) : new Date(call.dueDate).toISOString().slice(11,16)) : '');
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <span style={{ fontWeight: 500, fontSize: 16, flex: 1 }}>{call.notes || call.outcomeNotes || call.reason || '(No Notes)'}</span>
                            <span style={{ fontSize: 15, color: '#444', marginLeft: 24, minWidth: 120, textAlign: 'right' }}>{dateStr}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#888', marginTop: 4, width: '100%', textAlign: 'left' }}>{status}</div>
                          {/* Accordion-style edit form for active/overdue */}
                          {isEditable && isOpen && (
                            <div style={{ marginTop: 16, background: '#fff', borderRadius: 6, padding: 16, boxShadow: '0 1px 4px #0001', width: '100%' }} onClick={e => e.stopPropagation()}>
                              <form onSubmit={e => { e.preventDefault(); handleSavePhoneCall(idx); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                  <label style={{ fontWeight: 600, minWidth: 80 }}>Due Date:</label>
                                  <input type="date" value={editingCallDueDate || ''} onChange={e => setEditingCallDueDate(e.target.value)} required style={{ fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                                  <input type="time" value={editingCallDueTime || ''} onChange={e => setEditingCallDueTime(e.target.value)} required style={{ fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc', minWidth: 100 }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                  <label style={{ fontWeight: 600, minWidth: 80 }}>Notes:</label>
                                  <input type="text" value={editingCallNotes || ''} onChange={e => setEditingCallNotes(e.target.value)} required style={{ flex: 1, fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                                </div>
                                {phoneCallError && <div style={{ color: 'red', marginBottom: 8 }}>{phoneCallError}</div>}                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                  <button 
                                    type="button" 
                                    onClick={() => handleDeletePhoneCall(idx)} 
                                    style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}
                                  >
                                    Delete
                                  </button>
                                  <div style={{ display: 'flex', gap: 16 }}>
                                    <button type="button" onClick={() => setOpenCallIdx(null)} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Cancel</button>
                                    <button type="submit" style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Save</button>
                                  </div>
                                </div>
                              </form>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  {activeTasks.concat(historicalTasks).filter(t => t.type === 'Phone Call').length === 0 && (
                    <li style={{ color: '#888', fontStyle: 'italic' }}>No phone calls yet.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </section>
        {/* Consolidated Campaigns Section */}
        <section className="campaigns-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8, minHeight: 44, marginTop: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'left', marginTop: 0, marginLeft:  0 }}>Campaigns</span>
              <button
                onClick={() => setShowCampaignsSection(v => !v)}
                style={{ marginLeft: 16, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}
              >
                {showCampaignsSection ? 'Hide' : 'Show'}
              </button>
              {showCampaignsSection && (
                <button
                  style={{ marginLeft: 'auto', background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                  onClick={() => setShowAssignCampaignModal(v => !v)}
                >
                  {showAssignCampaignModal ? 'Cancel' : 'Enroll Contact'}
                </button>
              )}
            </div>
            {showCampaignsSection && (
              <>
                {showAssignCampaignModal && (
                  <div style={{ margin: '18px 0', width: '100%' }}>
                    <CampaignAssignAccordion
                      contactId={id}
                      onSave={async (campaign, contactId, reEnrollChoice, stepDelays) => {
                        try {
                          const result = await enrollContacts(campaign.id, [contactId], reEnrollChoice);
                          if (result && result.enrolled && result.enrolled.length > 0) {
                            const enrollmentId = result.enrolled[0];
                            await import('../services/email').then(mod => mod.createCampaignScheduledEmails({ enrollmentIds: [enrollmentId], customDelaysByEnrollment: { [enrollmentId]: stepDelays } }));
                          }
                        } catch (e) {
                          alert('Failed to enroll in campaign: ' + (e.message || e));
                        }
                        setShowAssignCampaignModal(false);
                        fetchAllCampaignEnrollments();
                      }}
                      onCancel={() => setShowAssignCampaignModal(false)}
                      allowStepDelayEdit={true}
                    />
                  </div>
                )}
                {/* Unified Campaign List */}                {activeCampaigns.length === 0 && historicalCampaigns.length === 0 ? (
                  <div style={{ color: '#888', padding: '12px 18px', borderRadius: 4, background: '#fff', border: '1px solid #eee', textAlign: 'center' }}>
                    No campaigns found for this contact.
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>                    {/* FIXED: Use Object.values + Map to ensure unique campaigns by enrollment.id */}
                    {(() => {
                      const combinedCampaigns = [...activeCampaigns, ...historicalCampaigns];
                      
                      const uniqueCampaigns = Object.values(combinedCampaigns.reduce((acc, campaign) => {
                        // Use enrollment.id as the unique key
                        if (campaign.enrollment && campaign.enrollment.id) {
                          acc[campaign.enrollment.id] = campaign;
                        }
                        return acc;
                      }, {}));
                      
                      return uniqueCampaigns;
                    })()
                      .sort((a, b) => {
                        // Sort: active first, then by most recent completed date (descending)
                        const getCompleted = (c) => {
                          const e = c.enrollment;
                          if (e.status === 'completed') {
                            if (e.completedAt && typeof e.completedAt.seconds === 'number') return e.completedAt.seconds;
                            if (e.completedAt) return new Date(e.completedAt).getTime() / 1000;
                            if (completedDates[e.id] && typeof completedDates[e.id].seconds === 'number') return completedDates[e.id].seconds;
                            if (completedDates[e.id]) return new Date(completedDates[e.id]).getTime() / 1000;
                          }
                          return 0;
                        };
                        if (a.enrollment.status === 'active' && b.enrollment.status !== 'active') return -1;
                        if (a.enrollment.status !== 'active' && b.enrollment.status === 'active') return 1;
                        // Both completed: sort by completed date descending
                        if (a.enrollment.status === 'completed' && b.enrollment.status === 'completed') {
                          return getCompleted(b) - getCompleted(a);
                        }
                        return 0;
                      })
                      .map((campaign, idx) => {
                        const enrollment = campaign.enrollment;
                        const status = (enrollment?.status || '').charAt(0).toUpperCase() + (enrollment?.status || '').slice(1);
                        const isActive = enrollment?.status === 'active';
                        let rightLabel = null;
                        if (isActive) {
                          const enrollmentId = campaign.enrollment?.id;
                          // Use nextSendDates from fetched scheduled emails instead of enrollment document
                          let nextSendDate = null;
                          if (enrollmentId && nextSendDates[enrollmentId]) {
                            nextSendDate = nextSendDates[enrollmentId].date;
                          } else if (campaign.enrollment?.nextSend) {
                            // Fallback to enrollment document if nextSendDates not available
                            if (typeof campaign.enrollment.nextSend === 'object' && typeof campaign.enrollment.nextSend.seconds === 'number') {
                              nextSendDate = new Date(campaign.enrollment.nextSend.seconds * 1000);
                            } else if (typeof campaign.enrollment.nextSend === 'string' || campaign.enrollment.nextSend instanceof Date) {
                              nextSendDate = new Date(campaign.enrollment.nextSend);
                            }
                          }
                          rightLabel = (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 500, fontSize: 15, color: '#1976d2' }}>
                                Current Step: Waiting to Send Step {typeof campaign.enrollment?.currentStep === 'number' ? campaign.enrollment.currentStep + 1 : 1}
                              </div>
                              <div style={{ fontSize: 14, color: '#444' }}>
                                Next Send: {nextSendDate ? nextSendDate.toLocaleString() : '-'}
                              </div>
                            </div>
                          );
                        } else if (enrollment?.status === 'completed') {
                          // Robust completed date logic
                          let completedDate = null;
                          if (enrollment.completedAt) {
                            if (typeof enrollment.completedAt === 'object' && typeof enrollment.completedAt.seconds === 'number') {
                              completedDate = new Date(enrollment.completedAt.seconds * 1000);
                            } else if (typeof enrollment.completedAt === 'string' || enrollment.completedAt instanceof Date) {
                              completedDate = new Date(enrollment.completedAt);
                            }
                          } else if (completedDates[enrollment.id]) {
                            const sendAt = completedDates[enrollment.id];
                            if (typeof sendAt === 'object' && typeof sendAt.seconds === 'number') {
                              completedDate = new Date(sendAt.seconds * 1000);
                            } else if (typeof sendAt === 'string' || sendAt instanceof Date) {
                              completedDate = new Date(sendAt);
                            }
                          } else if (enrollment.lastSend) {
                            if (typeof enrollment.lastSend === 'object' && typeof enrollment.lastSend.seconds === 'number') {
                              completedDate = new Date(enrollment.lastSend.seconds * 1000);
                            } else if (typeof enrollment.lastSend === 'string' || enrollment.lastSend instanceof Date) {
                              completedDate = new Date(enrollment.lastSend);
                            }
                          }
                          rightLabel = (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 500, fontSize: 15, color: '#5BA150' }}>Completed On:</div>
                              <div style={{ fontSize: 14, color: '#444' }}>{completedDate ? completedDate.toLocaleString() : '-'}</div>
                              <div style={{ fontSize: 14, color: '#888' }}>Last Step Sent: {typeof campaign.enrollment?.currentStep === 'number' ? campaign.enrollment.currentStep + 1 : '-'}</div>
                            </div>
                          );                        } else if (enrollment?.status === 'withdrawn' || enrollment?.status === 'paused') {
                          rightLabel = (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 500, fontSize: 15, color: '#d32f2f' }}>{status} On:</div>
                              <div style={{ fontSize: 14, color: '#444' }}>{enrollment.withdrawnAt ? new Date(enrollment.withdrawnAt.seconds * 1000).toLocaleString() : (enrollment.lastSend ? new Date(enrollment.lastSend.seconds * 1000).toLocaleString() : '-')}</div>
                              <div style={{ fontSize: 14, color: '#888' }}>Last Step Sent: {typeof campaign.enrollment?.currentStep === 'number' ? campaign.enrollment.currentStep + 1 : '-'}</div>
                            </div>
                          );
                        }
                        return (
                          <React.Fragment key={enrollment?.id}>
                            <li
                              key={enrollment?.id}
                              style={{
                                padding: 16,
                                borderRadius: 4,
                                background: isActive ? '#f6fff6' : '#fff',
                                border: '1px solid #eee',
                                marginBottom: 8,
                                cursor: isActive ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 0.2s',
                                boxShadow: isActive ? '0 2px 8px #5BA15022' : 'none',
                                minWidth: 600,
                                maxWidth: 900,
                                boxSizing: 'border-box',
                              }}
                              onClick={() => isActive ? setOpenCampaignIdx(idx) : null}
                            >                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 2, color: '#222', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{campaign.campaignName || campaign.name}</div>
                                <div style={{ fontSize: 14, color: isActive ? '#1976d2' : (enrollment?.status === 'completed' ? '#5BA150' : '#d32f2f'), fontWeight: 600 }}>{status}</div>
                              </div>
                              <div style={{ marginLeft: 24, minWidth: 180 }}>{rightLabel}</div>
                            </li>
                            {openCampaignIdx === idx && enrollment?.status === 'active' && (
                              <li key={enrollment?.id + '_edit'} style={{ padding: 0, border: 'none', background: 'none' }}>
                                <ActiveCampaignEditAccordion
                                  key={enrollment?.id + '_' + (enrollment?.nextSend?.seconds || enrollment?.nextSend || '')}
                                  campaign={campaign}
                                  onSave={async ({ date, time, delay, delayUnit, stepIdx, stepStates }) => {
                                    try {
                                      const enrollmentId = campaign.enrollment?.id;
                                      if (!enrollmentId) throw new Error('Missing enrollment ID');
                                      // Build new steps array for Firestore
                                      const newSteps = stepStates.map((s, i) => ({
                                        ...((campaign.enrollment?.steps && Array.isArray(campaign.enrollment.steps) && campaign.enrollment.steps[i]) || {}),
                                        delay: {
                                          value: Number(s.delay) || 1,
                                          unit: s.delayUnit || 'days',
                                        },
                                      }));
                                      // --- Recalculate nextSend: find the soonest unsent step with a scheduled date ---
                                      let nextSend = null;
                                      for (let i = 0; i < stepStates.length; i++) {
                                        if (!stepStates[i].sent) {
                                          if (stepStates[i].date && stepStates[i].time) {
                                            nextSend = new Date(`${stepStates[i].date}T${stepStates[i].time}`);
                                          } else if (i > 0 && stepStates[i].delay && stepStates[i].delayUnit && stepStates[i-1].date && stepStates[i-1].time) {
                                            let ms = new Date(`${stepStates[i-1].date}T${stepStates[i-1].time}`).getTime();
                                            const delay = parseInt(stepStates[i].delay);
                                            const unit = stepStates[i].delayUnit;
                                            if (unit === 'minutes') ms += delay * 60 * 1000;
                                            if (unit === 'days') ms += delay * 24 * 60 * 60 * 1000;
                                            if (unit === 'weeks') ms += delay * 7 * 24 * 60 * 60 * 1000;
                                            if (unit === 'months') ms += delay * 30 * 24 * 60 * 60 * 1000;
                                            nextSend = new Date(ms);
                                          }
                                          break;
                                        }
                                      }
                                      const updateObj = { steps: newSteps, nextSend: nextSend ? nextSend : null };
                                      console.log('[ActiveCampaignEditAccordion] updateEnrollment updateObj:', updateObj);
                                      const updateResult = await updateEnrollment(enrollmentId, updateObj);
                                      console.log('[ActiveCampaignEditAccordion] updateEnrollment result:', updateResult);
                                      if (enrollmentId) {
                                        // Validate initial date/time is in the future (same logic as ContactsScreen)
                                        if (stepStates[0]?.date && stepStates[0]?.time) {
                                          const [year, month, day] = stepStates[0].date.split('-').map(Number);
                                          const scheduledTime = new Date(year, month - 1, day); // month is 0-based
                                          const [hours, minutes] = stepStates[0].time.split(':');
                                          scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                          
                                          const now = new Date();
                                          const bufferTime = new Date(now.getTime() + 60000); // 1 minute buffer
                                          
                                          console.log('[ContactDetailScreen] Validating schedule time:', {
                                            scheduled: scheduledTime.toISOString(),
                                            current: now.toISOString(),
                                            buffer: bufferTime.toISOString(),
                                            isFuture: scheduledTime > bufferTime
                                          });
                                          
                                          if (scheduledTime <= bufferTime) {
                                            alert(`First step time must be at least 1 minute in the future.\nScheduled: ${scheduledTime.toLocaleString()}\nCurrent: ${now.toLocaleString()}`);
                                            return; // Stop execution
                                          }
                                        }
                                        
                                        const timezoneOffsetMinutes = new Date().getTimezoneOffset();
                                        await import('../services/email').then(mod =>
                                          mod.createCampaignScheduledEmails({
                                            enrollmentIds: [enrollmentId],
                                            initialDate: stepStates[0]?.date,
                                            initialTime: stepStates[0]?.time,
                                            customDelaysByEnrollment: { [enrollmentId]: stepStates.reduce((acc, s, i) => {
                                              acc[i] = { value: s.delay, unit: s.delayUnit };
                                              return acc;
                                            }, {}) },
                                            timezoneOffsetMinutes,
                                          })
                                        );
                                      }
                                    } catch (e) {
                                      alert('Failed to save changes: ' + (e.message || e));
                                    }
                                    setOpenCampaignIdx(null);
                                    fetchAllCampaignEnrollments();
                                  }}
                                  onCancel={() => setOpenCampaignIdx(null)}
                                  onWithdraw={async () => {
                                    try {
                                      const enrollmentId = campaign.enrollment?.id;
                                      if (!enrollmentId) throw new Error('Missing enrollment ID');
                                      await withdrawCampaignEnrollment({ enrollmentId });
                                    } catch (e) {
                                      alert('Failed to withdraw: ' + (e.message || e));
                                    }
                                    setOpenCampaignIdx(null);
                                    fetchAllCampaignEnrollments();
                                  }}
                                />
                              </li>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </ul>
                )}
                {/* Inline edit for active campaigns - REMOVED DUPLICATE RENDERING */}
                {/*
                {[...activeCampaigns, ...historicalCampaigns].map((campaign, idx) => (
                  openCampaignIdx === idx && campaign.enrollment?.status === 'active' && (
                    <ActiveCampaignEditAccordion
                      key={campaign.id || idx}
                      campaign={campaign}
                      onSave={async ({ date, time, delay, delayUnit, stepIdx }) => {
                        try {
                          const enrollmentId = campaign.enrollment?.id;
                          if (!enrollmentId) throw new Error('Missing enrollment ID');
                          let nextSend = null;
                          if (date && time) {
                            nextSend = new Date(`${date}T${time}`);
                          }
                          await updateEnrollment(enrollmentId, {
                            nextSend: nextSend ? nextSend : null,
                            [`steps.${stepIdx}.delay`]: { value: delay, unit: delayUnit },
                          });
                          if (enrollmentId) {
                            await import('../services/email').then(mod => mod.createCampaignScheduledEmails({ enrollmentId }));
                          }
                        } catch (e) {
                          alert('Failed to save changes: ' + (e.message || e));
                        }
                        setOpenCampaignIdx(null);
                        fetchAllCampaignEnrollments();
                      }}
                      onCancel={() => setOpenCampaignIdx(null)}
                      onWithdraw={async () => {
                        try {
                          const enrollmentId = campaign.enrollment?.id;
                          if (!enrollmentId) throw new Error('Missing enrollment ID');
                          await withdrawCampaignEnrollment({ enrollmentId });
                        } catch (e) {
                          alert('Failed to withdraw: ' + (e.message || e));
                        }
                        setOpenCampaignIdx(null);
                        fetchAllCampaignEnrollments();
                      }}
                    />
                  )
                ))}
                */}
              </>
            )}
          </div>
        </section>
        {/* Historical Tasks Section */}
        <section className="historical-tasks-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8, minHeight: 44, marginTop: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'left', marginTop: 0, marginLeft:  0 }}>In Person Visits</span>
              <button onClick={() => setShowHistoricalTasksSection(v => !v)} style={{ marginLeft: 16, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}>{showHistoricalTasksSection ? 'Hide' : 'Show'}</button>
            </div>
            {showHistoricalTasksSection && (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, width: '100%' }}>
                  <div style={{ width: '100%' }}>
                    <button
                      style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 600, marginBottom: 8 }}
                      onClick={() => setShowAddInPersonVisitAccordion(v => !v)}
                    >
                      Add In Person Visit
                    </button>
                    {showAddInPersonVisitAccordion && (
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
                        <form onSubmit={async e => {
                          e.preventDefault();
                          if (!inPersonVisitNotes?.trim() || !inPersonVisitDueDate || !inPersonVisitDueTime) return;
                          setInPersonVisitLoading(true);
                          setInPersonVisitError('');
                          try {
                            const user = JSON.parse(localStorage.getItem('user'));
                            const dueDateTime = new Date(inPersonVisitDueDate + 'T' + inPersonVisitDueTime);
                            await addDoc(collection(db, 'tasks'), {
                              contactId: id,
                              type: 'In Person Visit',
                              notes: inPersonVisitNotes,
                              dueDate: dueDateTime,
                              completed: false,
                              userId: user?.uid || null,
                              createdAt: new Date(),
                            });
                            setInPersonVisitNotes('');
                            setInPersonVisitDueDate('');
                            setInPersonVisitDueTime('');
                            setShowAddInPersonVisitAccordion(false);
                            // Refresh tasks so new visit appears
                            let ignore = false;
                            async function fetchTasks() {
                              const user = JSON.parse(localStorage.getItem('user'));
                              if (!user?.uid || !id) {
                                setActiveTasks([]);
                                setHistoricalTasks([]);
                                return;
                              }
                              const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('contactId', '==', id));
                              const snapshot = await getDocs(q);
                              const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                              if (ignore) return;
                              setActiveTasks(all.filter(t => !t.completed));
                              setHistoricalTasks(all.filter(t => t.completed));
                            }
                            fetchTasks();
                          } catch (e) {
                            setInPersonVisitError('Error logging visit: ' + (e.message || e));
                          }
                          setInPersonVisitLoading(false);
                        }}>
                          <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                            <label style={{ fontWeight: 600, minWidth: 80 }}>Due Date:</label>
                            <input type="date" value={inPersonVisitDueDate || ''} onChange={e => setInPersonVisitDueDate(e.target.value)} required style={{ marginRight: 8, fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                            <input type="time" value={inPersonVisitDueTime || ''} onChange={e => setInPersonVisitDueTime(e.target.value)} required style={{ fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc', minWidth: 100 }} />
                          </div>
                          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                            <label style={{ fontWeight: 600, minWidth: 80 }}>Notes:</label>
                            <input type="text" value={inPersonVisitNotes || ''} onChange={e => setInPersonVisitNotes(e.target.value)} required style={{ flex: 1, fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                          </div>
                          {inPersonVisitError && <div style={{ color: 'red', marginBottom: 8 }}>{inPersonVisitError}</div>}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                            <button type="button" onClick={() => setShowAddInPersonVisitAccordion(false)} disabled={inPersonVisitLoading} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Cancel</button>
                            <button type="submit" disabled={inPersonVisitLoading || !inPersonVisitNotes?.trim() || !inPersonVisitDueDate || !inPersonVisitDueTime} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Save</button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, width: '100%' }}>
                  {activeTasks.concat(historicalTasks)
                    .filter(t => t.type === 'In Person Visit')
                    .sort((a, b) => {
                      // Sort: furthest future at top, then current, then past (furthest past at bottom)
                      const now = new Date();
                      now.setHours(0,0,0,0);
                      const dateA = getSortableCallDate(a);
                      const dateB = getSortableCallDate(b);
                      // Both future
                      if (dateA > now && dateB > now) return dateB - dateA;
                      // Both past or today
                      if (dateA <= now && dateB <= now) return dateB - dateA;
                      // One future, one not
                      if (dateA > now) return -1;
                      if (dateB > now) return 1;
                      return 0;
                    })
                    .map((visit, idx, arr) => {
                      let status = '';
                      let dateVal = '';
                      if (visit.completed) {
                        status = 'Completed';
                        dateVal = visit.completedDate || visit.dueDate || visit.createdAt;
                      } else if (visit.dueDate) {
                        const due = new Date(visit.dueDate);
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        if (due < today) {
                          status = 'Overdue';
                          dateVal = visit.dueDate;
                        } else {
                          status = 'Active';
                          dateVal = visit.dueDate;
                        }
                      } else {
                        status = 'Active';
                        dateVal = visit.createdAt;
                      }
                      let dateStr = '';
                      if (dateVal) {
                        if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
                          // Parse as local date, not UTC
                          const [y, m, d] = dateVal.split('T')[0].split('-');
                          const localDate = new Date(Number(y), Number(m) - 1, Number(d));
                          dateStr = localDate.toLocaleDateString();
                        } else if (typeof dateVal === 'object' && dateVal.seconds) {
                          const d = new Date(dateVal.seconds * 1000);
                          dateStr = d.toLocaleDateString();
                        } else {
                          const d = new Date(dateVal);
                          dateStr = d.toLocaleDateString();
                        }
                      }
                      const isEditable = status === 'Active' || status === 'Overdue';
                      const isOpen = openVisitIdx === idx;
                      return (
                        <li
                          key={visit.id || idx}
                          style={{
                            background: '#f6f6f6',
                            borderRadius: 8,
                            border: '1px solid #eee',
                            marginBottom: 12,
                            padding: '18px 28px',
                            minWidth: 600,
                            maxWidth: 900,
                            boxSizing: 'border-box',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            cursor: isEditable ? 'pointer' : 'default',
                            boxShadow: isOpen ? '0 2px 8px #0002' : 'none',
                            transition: 'box-shadow 0.2s',
                            flexDirection: 'column',
                          }}
                          onClick={() => {
                            if (isEditable) {
                              setOpenVisitIdx(isOpen ? null : idx);
                              setEditingVisitNotes(visit.notes || visit.outcomeNotes || visit.reason || '');
                              setEditingVisitDueDate(visit.dueDate ? (typeof visit.dueDate === 'object' && visit.dueDate.seconds ? new Date(visit.dueDate.seconds * 1000).toISOString().slice(0,10) : new Date(visit.dueDate).toISOString().slice(0,10)) : '');
                              setEditingVisitDueTime(visit.dueDate ? (typeof visit.dueDate === 'object' && visit.dueDate.seconds ? new Date(visit.dueDate.seconds * 1000).toISOString().slice(11,16) : new Date(visit.dueDate).toISOString().slice(11,16)) : '');
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <span style={{ fontWeight: 500, fontSize: 16, flex: 1 }}>{visit.notes || visit.outcomeNotes || visit.reason || '(No Notes)'}</span>
                            <span style={{ fontSize: 15, color: '#444', marginLeft: 24, minWidth: 120, textAlign: 'right' }}>{dateStr}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#888', marginTop: 4, width: '100%', textAlign: 'left' }}>{status}</div>
                          {/* Accordion-style edit form for active/overdue */}
                          {isEditable && isOpen && (
                            <div style={{ marginTop: 16, background: '#fff', borderRadius: 6, padding: 16, boxShadow: '0 1px 4px #0001', width: '100%' }} onClick={e => e.stopPropagation()}>
                              <form onSubmit={e => { e.preventDefault(); handleSaveInPersonVisit(idx); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                  <label style={{ fontWeight: 600, minWidth: 80 }}>Due Date:</label>
                                  <input type="date" value={editingVisitDueDate || ''} onChange={e => setEditingVisitDueDate(e.target.value)} required style={{ fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                                  <input type="time" value={editingVisitDueTime || ''} onChange={e => setEditingVisitDueTime(e.target.value)} required style={{ fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc', minWidth: 100 }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                  <label style={{ fontWeight: 600, minWidth: 80 }}>Notes:</label>
                                  <input type="text" value={editingVisitNotes || ''} onChange={e => setEditingVisitNotes(e.target.value)} required style={{ flex: 1, fontSize: 15, padding: 6, borderRadius: 4, border: '1px solid #ccc' }} />
                                </div>
                                {inPersonVisitError && <div style={{ color: 'red', marginBottom: 8 }}>{inPersonVisitError}</div>}
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                  <button 
                                    type="button" 
                                    onClick={() => handleDeleteInPersonVisit(idx)} 
                                    style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}
                                  >
                                    Delete
                                  </button>
                                  <div style={{ display: 'flex', gap: 16 }}>
                                    <button type="button" onClick={() => setOpenVisitIdx(null)} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Cancel</button>
                                    <button type="submit" style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Save</button>
                                  </div>
                                </div>
                              </form>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  {activeTasks.concat(historicalTasks).filter(t => t.type === 'In Person Visit').length === 0 && (
                    <li style={{ color: '#888', fontStyle: 'italic' }}>No in person visits yet.</li>
                  )}
                </ul>              </div>
            )}
          </div>
        </section>
        {/* Emails Section */}
        <section className="emails-section">
          <div style={{
            width: '98vw',
            maxWidth: 800,
            minWidth: 320,
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 16,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative',
            zIndex: 1,
            padding: 32,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 8, minHeight: 44, marginTop: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'left', marginTop: 0, marginLeft:  0 }}>Emails</span>
              <button onClick={() => setShowEmailsSection(v => !v)} style={{ marginLeft: 16, fontSize: 13, background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}>{showEmailsSection ? 'Hide' : 'Show'}</button>
            </div>
            {showEmailsSection && (
              <>
                {emailLogs.length === 0 ? (
                  <div style={{ color: '#888', padding: '12px 18px', borderRadius: 4, background: '#fff', border: '1px solid #eee', textAlign: 'center' }}>
                    No email logs found.
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {paginatedEmailLogs.map((log, idx) => (
                      <HistoricalEmailAccordionItem key={log.id} log={log} />
                    ))}
                  </ul>
                )}
                {totalEmailLogPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                    <button onClick={() => setEmailLogPage(p => Math.max(p - 1, 1))} disabled={emailLogPage === 1} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                      Previous
                    </button>
                    <button onClick={() => setEmailLogPage(p => Math.min(p + 1, totalEmailLogPages))} disabled={emailLogPage === totalEmailLogPages} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                      Next
                    </button>                  </div>
                )}
                {emailLogError && <div style={{ color: 'red', marginTop: 8 }}>{emailLogError}</div>}
              </>
            )}
          </div>
        </section>
        {/* --- BOTTOM SPACER for background separation above bottom banner --- */}        <div style={{ height: 32, background: 'transparent' }} />
      </div>
    </div>
  );
}
// End of ContactDetailScreen
