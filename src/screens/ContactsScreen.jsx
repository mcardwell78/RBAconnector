import React, { useEffect, useState } from 'react';
import { db, auth } from '../services/firebase';
import { collection, getDocs, deleteDoc, doc, addDoc, query, where } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { RBA_GREEN } from '../utils/rbaColors';
import { getCampaigns, getCampaignsSplit } from '../services/campaigns';
import { enrollContacts } from '../services/campaignEnrollments';
import { onAuthStateChanged } from 'firebase/auth';
import { cardStyle, inputStyle, buttonOutlineStyle, modalStyle } from '../utils/sharedStyles';
import Logo from './assets/Logo.png';
import SelectCampaignModal from '../components/SelectCampaignModal';
import { getTemplatesSplit } from '../services/email';
import { createCampaignScheduledEmails } from '../services/email';
import CampaignAssignAccordion from '../components/CampaignAssignAccordion';
import BulkCampaignAssignModal from '../components/BulkCampaignAssignModal';

function formatDate(date) {
  if (!date) return '';
  if (date.seconds) date = new Date(date.seconds * 1000);
  else date = new Date(date);
  return date.toLocaleDateString();
}

function FilterModal({ open, onClose, onApply, filter, setFilter }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 380, boxShadow: '0 2px 8px #0002' }}>
        <h3 style={{ marginBottom: 20, color: '#333' }}>Filter Contacts</h3>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Status</label>
          <select 
            value={filter.status || ''} 
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} 
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">All Statuses</option>
            <option value="prospect">Prospect</option>
            <option value="client">Client</option>
            <option value="do_not_contact">Do Not Contact</option>
          </select>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Last Activity</label>
          <select 
            value={filter.lastActivity || ''} 
            onChange={e => setFilter(f => ({ ...f, lastActivity: e.target.value }))} 
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">Any Time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="never">Never contacted</option>
          </select>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Campaign Enrollment</label>
          <select 
            value={filter.campaignEnrolled || ''} 
            onChange={e => setFilter(f => ({ ...f, campaignEnrolled: e.target.value }))} 
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">All Contacts</option>
            <option value="enrolled">In Campaign</option>
            <option value="not_enrolled">Not in Campaign</option>
          </select>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Email Activity</label>
          <select 
            value={filter.emailActivity || ''} 
            onChange={e => setFilter(f => ({ ...f, emailActivity: e.target.value }))} 
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">All Contacts</option>
            <option value="high">5+ emails sent</option>
            <option value="medium">1-4 emails sent</option>
            <option value="none">No emails sent</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ ...buttonOutlineStyle, background: '#ccc', color: '#222' }}>Cancel</button>
          <button onClick={onApply} style={{ ...buttonOutlineStyle, background: RBA_GREEN, color: '#fff' }}>Apply Filter</button>
        </div>
      </div>
    </div>
  );
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('firstName');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState([]);
  const [action, setAction] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filter, setFilter] = useState({});
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templates, setTemplates] = useState([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [privateCampaigns, setPrivateCampaigns] = useState([]);
  const [publicCampaigns, setPublicCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [contactStats, setContactStats] = useState({});
  const [campaignEnrollments, setCampaignEnrollments] = useState({});
  const navigate = useNavigate();
  // Add a flag to track if auth has been initialized
  const [authInitialized, setAuthInitialized] = useState(false);
  
  useEffect(() => {
    // Listen for Firebase Auth state
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthInitialized(true);
      if (!user && authInitialized) {
        setPermissionError('You are not logged in or your session has expired. Please log in again.');
      } else if (user) {
        setPermissionError(''); // Clear any existing errors when user logs in
      }
    });
    return () => unsubscribe();
  }, [authInitialized]);

  // Fetch campaigns for modal (split public/private)
  const fetchCampaignsForModal = async () => {
    const { privateCampaigns, publicCampaigns } = await getCampaignsSplit();
    setPrivateCampaigns(privateCampaigns);
    setPublicCampaigns(publicCampaigns);
  };

  useEffect(() => {
    if (showCampaignModal) {
      fetchCampaignsForModal();
    }
  }, [showCampaignModal]);

  // Move fetchContacts to top-level so it can be called from anywhere
  async function fetchContacts() {
    console.log('[fetchContacts] running', firebaseUser);
    if (!firebaseUser) {
      setPermissionError('You are not logged in or your session has expired. Please log in again.');
      setContacts([]);
      return;
    }    try {
      const q = query(collection(db, 'contacts'), where('userId', '==', firebaseUser.uid));
      const snapshot = await getDocs(q);
      const contactsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setContacts(contactsData);
      
      // Fetch contact stats
      await fetchContactStats(contactsData);
      
      setPermissionError('');
    } catch (err) {
      console.error('fetchContacts: error', err);
      if (err.message && err.message.includes('Missing or insufficient permissions')) {
        setPermissionError('You do not have permission to view some or all contacts. Please contact support if this persists.');
      } else {
        setPermissionError('An error occurred loading contacts: ' + (err.message || err.code || err));
      }
      setContacts([]);
    }
  }
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
    fetchContacts();
  }, [firebaseUser]);
  const filtered = contacts
    .filter(c => {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      const stats = contactStats[c.id] || { emails: 0, calls: 0, lastContacted: null };
      
      // Status filter
      if (filter.status && c.status !== filter.status) return false;
      
      // Last Activity filter
      if (filter.lastActivity) {
        const daysSinceContact = stats.lastContacted ? 
          Math.floor((new Date() - stats.lastContacted) / (1000 * 60 * 60 * 24)) : 
          null;
        
        if (filter.lastActivity === 'never' && daysSinceContact !== null) return false;
        if (filter.lastActivity === '7' && (!daysSinceContact || daysSinceContact > 7)) return false;
        if (filter.lastActivity === '30' && (!daysSinceContact || daysSinceContact > 30)) return false;
        if (filter.lastActivity === '90' && (!daysSinceContact || daysSinceContact > 90)) return false;
      }
      
      // Campaign enrollment filter
      if (filter.campaignEnrolled) {
        const isEnrolled = campaignEnrollments[c.id] || false;
        if (filter.campaignEnrolled === 'enrolled' && !isEnrolled) return false;
        if (filter.campaignEnrolled === 'not_enrolled' && isEnrolled) return false;
      }
      
      // Email activity filter
      if (filter.emailActivity) {
        if (filter.emailActivity === 'high' && stats.emails < 5) return false;
        if (filter.emailActivity === 'medium' && (stats.emails === 0 || stats.emails >= 5)) return false;
        if (filter.emailActivity === 'none' && stats.emails > 0) return false;
      }
      
      // Text search
      if (!search) return true;
      return name.toLowerCase().includes(search.toLowerCase()) || 
             (c.email && c.email.toLowerCase().includes(search.toLowerCase()));
    })
    .sort((a, b) => {
      if (a[sortBy] < b[sortBy]) return sortDir === 'asc' ? -1 : 1;
      if (a[sortBy] > b[sortBy]) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginatedContacts = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset to page 1 if perPage changes or filter/search changes
  useEffect(() => {
    setPage(1);
  }, [perPage, search, filter]);

  const handleSelectAll = e => {
    if (e.target.checked) {
      setSelected(paginatedContacts.map(c => c.id));
    } else {
      setSelected([]);
    }
  };
  const handleSelect = (id) => {
    setSelected(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };
  const handleBulkAction = async () => {
    if (action === 'delete') {
      if (window.confirm('Delete selected contacts?')) {
        // Bulk delete
        let errorCount = 0;
        await Promise.all(selected.map(async id => {
          try {
            await deleteDoc(doc(db, 'contacts', id));
            console.log('Deleted contact', id);
          } catch (err) {
            errorCount++;
            console.error('Error deleting contact', id, err);
          }
        }));
        // Refresh contacts
        try {
          const user = JSON.parse(localStorage.getItem('user'));
          const q = query(collection(db, 'contacts'), where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setSelected([]);
          if (errorCount > 0) {
            alert(`Some contacts could not be deleted. (${errorCount} errors)`);
          }
        } catch (err) {
          console.error('Error refreshing contacts after delete', err);
          setPermissionError('Error refreshing contacts after delete: ' + (err.message || err.code || err));
          setContacts([]);
        }
      }
    } else if (action === 'addTask') {
      setShowTaskModal(true);
    } else if (action === 'sendEmailTemplate') {
      // Fetch templates if not already loaded
      if (templates.length === 0) {
        try {
          const { privateTemplates, publicTemplates } = await getTemplatesSplit();
          // Remove duplicates (user's own template may also be public)
          const privateIds = new Set(privateTemplates.map(t => t.id));
          const mergedTemplates = [
            ...privateTemplates,
            ...publicTemplates.filter(t => !privateIds.has(t.id))
          ];
          setTemplates(mergedTemplates);
        } catch (err) {
          setTemplates([]);
          setPermissionError(
            err && err.message && err.message.includes('permission')
              ? 'You do not have permission to view email templates. Please check your login or contact support.'
              : 'Error loading email templates: ' + (err.message || err.code || err)
          );
        }
      }
      setShowEmailModal(true);
    } else if (action === 'addToCampaign') {
      setAssignStatus('');
      setAssignLoading(false);
      setShowBulkAssignModal(true);
    }
    setAction('');
  };

  const handleAddTaskToSelectedContacts = async (type, dueDate, notes) => {
    if (!firebaseUser) {
      setPermissionError('You are not logged in or your session has expired. Please log in again.');
      console.error('handleAddTaskToSelectedContacts: firebaseUser is null.');
      return;
    }
    const userId = firebaseUser.uid;
    try {
      await Promise.all(selected.map(async id => {
        try {
          const data = {
            contactId: id,
            type,
            dueDate: new Date(dueDate),
            notes,
            completed: false,
            createdAt: new Date(),
            userId,
          };
          if (!data.userId) {
            throw new Error('userId is missing in task data');
          }
          await addDoc(collection(db, 'tasks'), data);
          console.log('Added task for contact', id, data);
        } catch (err) {
          console.error('Error adding task for contact', id, err, {
            contactId: id,
            type,
            dueDate,
            notes,
            userId,
          });
          setPermissionError('Error adding task for contact ' + id + ': ' + (err.message || err.code || err));
        }
      }));
      setShowTaskModal(false);
    } catch (err) {
      console.error('Error in handleAddTaskToSelectedContacts', err);
      setPermissionError('Error adding tasks: ' + (err.message || err.code || err));
    }  };

  // Fetch contact statistics
  async function fetchContactStats(contactsData) {
    if (!firebaseUser) return;
    
    try {
      const stats = {};
      const enrollments = {};
      
      // Fetch email logs for sent count
      const emailLogsQuery = query(collection(db, 'emailLogs'), where('userId', '==', firebaseUser.uid));
      const emailLogsSnap = await getDocs(emailLogsQuery);
      
      // Count emails per contact
      emailLogsSnap.docs.forEach(doc => {
        const log = doc.data();
        if (log.contactId) {
          if (!stats[log.contactId]) stats[log.contactId] = { emails: 0, calls: 0, lastContacted: null };
          stats[log.contactId].emails++;
            // Track last contacted from email logs
          let logDate = null;
          if (log.sentAt) {
            logDate = log.sentAt.toDate ? log.sentAt.toDate() : new Date(log.sentAt);
          } else if (log.createdAt) {
            logDate = log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
          }
          
          if (logDate && (!stats[log.contactId].lastContacted || logDate > stats[log.contactId].lastContacted)) {
            stats[log.contactId].lastContacted = logDate;
          }
        }
      });
      
      // Fetch tasks for call count and last contacted
      const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', firebaseUser.uid));
      const tasksSnap = await getDocs(tasksQuery);
      
      tasksSnap.docs.forEach(doc => {
        const task = doc.data();
        if (task.contactId && task.completed) {
          if (!stats[task.contactId]) stats[task.contactId] = { emails: 0, calls: 0, lastContacted: null };
          
          if (task.type === 'Phone Call') {
            stats[task.contactId].calls++;
          }          // Track last contacted from completed tasks
          let taskDate = null;
          if (task.completedAt) {
            taskDate = task.completedAt.toDate ? task.completedAt.toDate() : new Date(task.completedAt);
          } else if (task.dueDate) {
            // Handle both Firestore Timestamp and regular Date/string
            if (task.dueDate.toDate && typeof task.dueDate.toDate === 'function') {
              taskDate = task.dueDate.toDate();
            } else {
              taskDate = new Date(task.dueDate);
            }
          }
          
          if (taskDate && (!stats[task.contactId].lastContacted || taskDate > stats[task.contactId].lastContacted)) {
            stats[task.contactId].lastContacted = taskDate;
          }
        }
      });
      
      // Fetch campaign enrollments
      const enrollmentsQuery = query(collection(db, 'campaignEnrollments'), where('userId', '==', firebaseUser.uid));
      const enrollmentsSnap = await getDocs(enrollmentsQuery);
      
      enrollmentsSnap.docs.forEach(doc => {
        const enrollment = doc.data();
        if (enrollment.contactId && enrollment.status === 'active') {
          enrollments[enrollment.contactId] = true;
        }
      });
      
      setContactStats(stats);
      setCampaignEnrollments(enrollments);
      
    } catch (err) {
      console.error('Error fetching contact stats:', err);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: RBA_GREEN, width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ flex: '0 0 auto' }}>
        {/* Main card/content area */}
        <div style={{ ...cardStyle, marginTop: 32, width: '98vw', maxWidth: 800, minWidth: 320, marginLeft: 'auto', marginRight: 'auto', padding: '24px 2vw 48px 2vw', boxSizing: 'border-box', position: 'relative' }}>
          {/* Logo and Title Row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            <img src={Logo} alt="Logo" style={{ height: 96, marginRight: 24 }} />
            <h2 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#222', fontFamily: 'Arial, sans-serif' }}>Contacts</h2>
          </div>
          {permissionError && (
            <div style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <b>Permission Error:</b> {permissionError}
            </div>
          )}
          <FilterModal open={filterModalOpen} onClose={() => setFilterModalOpen(false)} onApply={() => setFilterModalOpen(false)} filter={filter} setFilter={setFilter} />          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: '300px' }}>
              <input
                type="text"
                placeholder="Search contacts..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, width: '200px', height: '36px', margin: 0, padding: '8px 12px' }}
              />
              <button onClick={() => setFilterModalOpen(true)} style={{ ...buttonOutlineStyle, height: '36px', padding: '0 12px', fontSize: '14px' }}>Filter</button>
              <button onClick={() => { setFilter({}); setSearch(''); }} style={{ ...buttonOutlineStyle, background: '#ccc', color: '#222', height: '36px', padding: '0 12px', fontSize: '14px' }}>Clear</button>
              <button onClick={() => navigate('/upload')} style={{ ...buttonOutlineStyle, height: '36px', padding: '0 12px', fontSize: '14px' }}>Import</button>
              <button onClick={() => navigate('/contacts/new')} style={{ ...buttonOutlineStyle, height: '36px', padding: '0 12px', fontSize: '14px' }}>Add Contact</button>
            </div>
          </div>
          {/* Bulk actions row, now above the list */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 12 }}>
            <input type="checkbox" checked={selected.length === paginatedContacts.length && paginatedContacts.length > 0} onChange={handleSelectAll} style={{ marginRight: 8 }} />
            <select value={action} onChange={e => setAction(e.target.value)} style={{ padding: 6, borderRadius: 4, border: '1px solid #ccc', minWidth: 120 }}>
              <option value="">Bulk Actions</option>
              <option value="delete">Delete</option>
              <option value="addTask">Add Task</option>
              <option value="sendEmailTemplate">Send Email Template</option>
              <option value="addToCampaign">Add to Campaign</option>
            </select>
            <button onClick={handleBulkAction} disabled={!action || selected.length === 0} style={{ background: RBA_GREEN, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 600 }}>Go</button>
            {/* Per page dropdown */}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="perPage" style={{ fontSize: 15, color: '#444' }}>Show</label>
              <select id="perPage" value={perPage} onChange={e => setPerPage(Number(e.target.value))} style={{ padding: 6, borderRadius: 4, border: '1px solid #ccc' }}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ color: '#444', fontSize: 15 }}>per page</span>
            </span>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px #0001', padding: 0, marginBottom: 24 }}>            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', padding: '12px 16px', fontWeight: 600, background: '#F6F6F6' }}>
              <span style={{ width: 24 }}></span>
              <span style={{ flex: 1 }}>Name</span>
              <span style={{ width: 120, textAlign: 'center' }}>Status</span>
              <span style={{ width: 100, textAlign: 'center' }}>Last Activity</span>
              <span style={{ width: 80, textAlign: 'center' }}>Emails</span>
              <span style={{ width: 80, textAlign: 'center' }}>Calls</span>
              <span style={{ width: 100, textAlign: 'center' }}>Campaigns</span>
            </div>            {paginatedContacts.map(contact => {
              const stats = contactStats[contact.id] || { emails: 0, calls: 0, lastContacted: null };
              const campaignCount = campaignEnrollments[contact.id] ? 1 : 0; // Could be enhanced to count multiple campaigns
              const lastActivityStr = stats.lastContacted ? 
                Math.floor((new Date() - stats.lastContacted) / (1000 * 60 * 60 * 24)) + 'd ago' : 
                'Never';
              
              // Status badge styling
              const statusColors = {
                prospect: { bg: '#e3f2fd', color: '#1976d2', text: 'Prospect' },
                client: { bg: '#e8f5e8', color: '#2e7d32', text: 'Client' },
                do_not_contact: { bg: '#ffebee', color: '#c62828', text: 'DNC' }
              };
              const statusStyle = statusColors[contact.status] || statusColors.prospect;
              
              return (
                <div key={contact.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f0f0', padding: '12px 16px' }}>
                  <input type="checkbox" checked={selected.includes(contact.id)} onChange={() => handleSelect(contact.id)} style={{ marginRight: 12 }} />
                  <Link to={`/contacts/${contact.id}`} style={{ color: RBA_GREEN, fontWeight: 600, textDecoration: 'none', flex: 1 }}>
                    {(contact.firstName || contact.lastName) ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : 'No Name'}
                  </Link>
                  <span style={{ 
                    width: 120, 
                    textAlign: 'center',
                    background: statusStyle.bg,
                    color: statusStyle.color,
                    padding: '4px 8px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {statusStyle.text}
                  </span>
                  <span style={{ width: 100, textAlign: 'center', fontSize: 13 }}>{lastActivityStr}</span>
                  <span style={{ width: 80, textAlign: 'center' }}>{stats.emails}</span>
                  <span style={{ width: 80, textAlign: 'center' }}>{stats.calls}</span>
                  <span style={{ width: 100, textAlign: 'center' }}>{campaignCount}</span>
                </div>
              );
            })}
          </div>
          {/* Pagination controls */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, marginBottom: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ ...buttonOutlineStyle, minWidth: 80, opacity: page === 1 ? 0.5 : 1 }}>Back</button>
            <span style={{ fontSize: 16, color: '#444' }}>Page {page} of {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} style={{ ...buttonOutlineStyle, minWidth: 80, opacity: (page === totalPages || totalPages === 0) ? 0.5 : 1 }}>Next</button>
          </div>
          {/* Add modals for Add Task and Send Email Template */}
          {showTaskModal && (
            <div style={modalStyle}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 2px 8px #0002' }}>
                <h3>Add Task to Selected Contacts</h3>
                <form onSubmit={async e => {
                  e.preventDefault();
                  const form = e.target;
                  const type = form.type.value;
                  const dueDate = form.dueDate.value;
                  const notes = form.notes.value;
                  await Promise.all(selected.map(id => addDoc(collection(db, 'tasks'), {
                    contactId: id,
                    type,
                    dueDate: new Date(dueDate),
                    notes,
                    completed: false,
                    createdAt: new Date(),
                  })));
                  setShowTaskModal(false);
                }}>
                  <select name="type" style={{ marginBottom: 8, width: '100%' }}>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Email">Email</option>
                    <option value="In Person Visit">In Person Visit</option>
                    <option value="Other">Other</option>
                  </select>
                  <input name="dueDate" type="date" required style={{ marginBottom: 8, width: '100%' }} />
                  <input name="notes" placeholder="Notes" style={{ marginBottom: 8, width: '100%' }} />
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowTaskModal(false)} style={{ ...buttonOutlineStyle, background: '#ccc', color: '#222' }}>Cancel</button>
                    <button type="submit" style={{ ...buttonOutlineStyle, background: RBA_GREEN, color: '#fff' }}>Add Task</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {showEmailModal && (
            <div style={modalStyle}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 320, boxShadow: '0 2px 8px #0002' }}>                <h3>Send Email Template to Selected Contacts</h3>                <form onSubmit={async e => {
                  e.preventDefault();
                  console.log('[ContactsScreen] Email form submitted, scheduleDate:', scheduleDate, 'scheduleTime:', scheduleTime);
                    // Prevent double submission
                  if (e.target.disabled) return;
                  e.target.disabled = true;
                  
                  // Re-enable the form after 3 seconds
                  setTimeout(() => {
                    e.target.disabled = false;
                  }, 3000);
                  
                  const template = templates.find(t => t.id === selectedTemplate);
                  
                  // Check if this is a scheduled email
                  const isScheduled = scheduleDate && scheduleDate.trim() !== '';                  if (isScheduled) {
                    // Calculate scheduled send time using local timezone
                    const [year, month, day] = scheduleDate.split('-').map(Number);
                    const sendAt = new Date(year, month - 1, day); // month is 0-based
                    
                    if (scheduleTime) {
                      const [hours, minutes] = scheduleTime.split(':');
                      sendAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                    } else {
                      sendAt.setHours(9, 0, 0, 0); // Default to 9 AM
                    }
                    
                    // Add some buffer time (1 minute) to account for processing delays
                    const now = new Date();
                    const bufferTime = new Date(now.getTime() + 60000); // 1 minute buffer
                    
                    console.log('[ContactsScreen] Scheduled time:', sendAt.toISOString(), '(Local:', sendAt.toLocaleString(), ')');
                    console.log('[ContactsScreen] Current time:', now.toISOString(), '(Local:', now.toLocaleString(), ')');
                    console.log('[ContactsScreen] Buffer time:', bufferTime.toISOString());
                    console.log('[ContactsScreen] Is future?', sendAt > bufferTime);
                    
                    // Validate it's in the future (with buffer)
                    if (sendAt <= bufferTime) {
                      alert(`Scheduled time must be at least 1 minute in the future.\nScheduled: ${sendAt.toLocaleString()}\nCurrent: ${now.toLocaleString()}`);
                      e.target.disabled = false;
                      return;
                    }
                    
                    console.log('[ContactsScreen] Scheduling emails for:', sendAt.toISOString());
                      // Schedule emails
                    for (const contactId of selected) {
                      const contact = contacts.find(c => c.id === contactId);
                      if (!contact || !contact.email) continue;                      try {
                        console.log('[ContactsScreen] Scheduling email for', contact.email, 'at', sendAt);
                        const emailData = {
                          contactId: contact.id,
                          templateId: selectedTemplate,
                          sendAt: sendAt.toISOString(),
                          to: contact.email,
                          subject: template?.subject || '',
                          body: template?.body || ''
                        };
                        
                        console.log('[ContactsScreen] Email data prepared:', emailData);
                        
                        try {
                          console.log('[ContactsScreen] Attempting modified sendOneOffEmail...');
                          // Use modified sendOneOffEmail with scheduleFor parameter
                          const result = await import('../services/email').then(mod =>
                            mod.sendOneOffEmail({
                              contactId: contact.id,
                              templateId: selectedTemplate,
                              scheduleFor: sendAt.toISOString(),
                              to: contact.email,
                              subject: template?.subject || '',
                              body: template?.body || ''
                            })
                          );
                          console.log('[ContactsScreen] sendOneOffEmail success:', result);                        } catch (modifiedError) {
                          console.log('[ContactsScreen] Modified sendOneOffEmail failed, trying direct Firestore:', modifiedError.message);
                          // Final fallback: create scheduled email directly in Firestore
                          const result = await import('../services/email').then(mod =>
                            mod.createScheduledEmailDirectly(emailData)
                          );
                          console.log('[ContactsScreen] Direct Firestore success:', result);
                        }
                      } catch (err) {
                        console.error('Failed to schedule email to', contact.email, err);
                      }
                    }
                  } else {
                    // Send immediately
                    console.log('[ContactsScreen] Sending immediate emails to', selected.length, 'contacts');
                    
                    for (const contactId of selected) {
                      const contact = contacts.find(c => c.id === contactId);
                      if (!contact || !contact.email) continue;
                      try {
                        console.log('[ContactsScreen] Sending immediate email to', contact.email);
                        await import('../services/email').then(mod =>
                          mod.sendOneOffEmail({
                            to: contact.email,
                            subject: template?.subject || '',
                            body: template?.body || '',
                            contactId: contact.id,
                            templateId: selectedTemplate || null
                          })
                        );
                      } catch (err) {
                        console.error('Failed to send email to', contact.email, err);
                      }
                    }
                  }
                  setShowEmailModal(false);
                  setScheduleDate('');
                  setScheduleTime('');
                  setSelectedTemplate('');
                  setSelected([]);
                }}>                  <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} required style={{ marginBottom: 12, width: '100%', padding: '8px' }}>
                    <option value="">Select Template</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Schedule (optional):</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input 
                      type="date" 
                      value={scheduleDate} 
                      onChange={e => setScheduleDate(e.target.value)} 
                      style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} 
                      placeholder="Date"
                    />
                    <input 
                      type="time" 
                      value={scheduleTime} 
                      onChange={e => setScheduleTime(e.target.value)} 
                      style={{ width: '120px', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} 
                      placeholder="Time"
                    />
                  </div>
                  
                  {scheduleDate && (
                    <div style={{ marginBottom: 12, padding: 8, background: '#f0f8ff', borderRadius: 4, fontSize: 14 }}>
                      <strong>Will send:</strong> {new Date(scheduleDate + (scheduleTime ? `T${scheduleTime}` : 'T09:00')).toLocaleString()}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowEmailModal(false)} style={{ ...buttonOutlineStyle, background: '#ccc', color: '#222' }}>Cancel</button>
                    <button type="submit" style={{ ...buttonOutlineStyle, background: RBA_GREEN, color: '#fff' }}>Send</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          <BulkCampaignAssignModal
            open={showBulkAssignModal}
            contactIds={selected}
            onClose={() => setShowBulkAssignModal(false)}
            onComplete={() => {
              setShowBulkAssignModal(false);
              setSelected([]);
              fetchContacts();
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1 }} />
    </div>
  );
}
