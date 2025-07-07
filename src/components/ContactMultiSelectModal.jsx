import React, { useEffect, useState } from 'react';
import { getContacts } from '../services/contacts';
import { getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function ContactMultiSelectModal({ open, onClose, onSelect, initiallySelected = [] }) {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(initiallySelected);
  const [search, setSearch] = useState('');
  const [lastContactedFilter, setLastContactedFilter] = useState('any'); // 'any', '7', '30', 'never'  const [campaignStatusFilter, setCampaignStatusFilter] = useState('any'); // 'any', 'active', 'inactive'
  const [contactLastContactedMap, setContactLastContactedMap] = useState({}); // {contactId: Date|null}
  const [contactCampaignStatusMap, setContactCampaignStatusMap] = useState({}); // {contactId: boolean}

  // Only fetch contacts and last-contacted data when modal is opened
  useEffect(() => {
    let ignore = false;
    async function fetchContactsAndLastContacted() {
      const contacts = await getContacts();
      if (ignore) return;
      setContacts(contacts);
      setSelected(initiallySelected);
      // Fetch last completed task for each contact
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) {
        setContactLastContactedMap({});
        return;
      }      // Get all contact IDs
      const contactIds = contacts.map(c => c.id);
      // Fetch all completed tasks for these contacts
      let lastContactedMap = {};
      let campaignStatusMap = {};
      
      if (contactIds.length > 0) {
        // Get last contacted dates from tasks
        const q = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('completed', '==', true));
        const snapshot = await getDocs(q);
        // Map contactId to latest completed task date
        snapshot.docs.forEach(doc => {
          const d = doc.data();
          if (!d.contactId) return;
          const completedDate = d.completedAt ? new Date(d.completedAt) : (d.updatedAt ? new Date(d.updatedAt) : (d.dueDate ? new Date(d.dueDate) : null));
          if (!completedDate || isNaN(completedDate.getTime())) return;
          if (!lastContactedMap[d.contactId] || completedDate > lastContactedMap[d.contactId]) {
            lastContactedMap[d.contactId] = completedDate;
          }
        });
          // Get active campaign enrollments
        const enrollmentsQuery = query(collection(db, 'campaignEnrollments'), where('userId', '==', user.uid), where('status', '==', 'active'));
        const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
        enrollmentsSnapshot.docs.forEach(doc => {
          const d = doc.data();
          if (d.contactId) {
            campaignStatusMap[d.contactId] = true;
          }
        });
        
        // Also get email logs for more accurate last-contacted dates
        const emailLogsQuery = query(collection(db, 'emailLogs'), where('userId', '==', user.uid));
        const emailLogsSnapshot = await getDocs(emailLogsQuery);
        emailLogsSnapshot.docs.forEach(doc => {
          const d = doc.data();
          if (!d.contactId) return;
          const sentDate = d.sentAt ? new Date(d.sentAt) : (d.createdAt ? new Date(d.createdAt) : null);
          if (!sentDate || isNaN(sentDate.getTime())) return;
          if (!lastContactedMap[d.contactId] || sentDate > lastContactedMap[d.contactId]) {
            lastContactedMap[d.contactId] = sentDate;
          }
        });
      }
      // Merge with contact.lastContacted (from emails)
      const merged = {};
      contacts.forEach(c => {
        let emailDate = null;
        if (c.lastContacted) {
          if (c.lastContacted.seconds) emailDate = new Date(c.lastContacted.seconds * 1000);
          else emailDate = new Date(c.lastContacted);
        }        const taskDate = lastContactedMap[c.id] || null;
        let mostRecent = null;
        
        // Find the most recent date from all sources
        const dates = [emailDate, taskDate].filter(d => d && !isNaN(d.getTime()));
        if (dates.length > 0) {
          mostRecent = dates.reduce((latest, current) => current > latest ? current : latest);
        }
        
        merged[c.id] = mostRecent;
      });
      setContactLastContactedMap(merged);
      setContactCampaignStatusMap(campaignStatusMap);
    }
    if (open) {
      fetchContactsAndLastContacted();
    }
    return () => { ignore = true; };
  }, [open, initiallySelected]);

  // Helper: get display name
  function getName(c) {
    return (c.firstName || c.lastName) ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : c.email || c.id;
  }
  // Helper: is in active campaign (placeholder, needs real logic)
  function isInActiveCampaign(c) {
    return contactCampaignStatusMap[c.id] || false;
  }

  // Filtering logic
  let filtered = contacts.filter(c => {
    const name = getName(c).toLowerCase();
    const email = (c.email || '').toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
    // Last contacted filter (robust: NOT contacted in last X days)
    let matchesLastContacted = true;
    const last = contactLastContactedMap[c.id] || null;
    if (lastContactedFilter === '7') {
      matchesLastContacted = !last || (Date.now() - last.getTime() >= 7 * 24 * 60 * 60 * 1000);
    } else if (lastContactedFilter === '30') {
      matchesLastContacted = !last || (Date.now() - last.getTime() >= 30 * 24 * 60 * 60 * 1000);
    } else if (lastContactedFilter === 'never') {
      matchesLastContacted = !last;
    }
    // Campaign status filter
    let matchesCampaign = true;
    if (campaignStatusFilter === 'active') {
      matchesCampaign = isInActiveCampaign(c);
    } else if (campaignStatusFilter === 'inactive') {
      matchesCampaign = !isInActiveCampaign(c);
    }
    return matchesSearch && matchesLastContacted && matchesCampaign;
  });

  // Alphabetical sort (by name, fallback to email)
  filtered = filtered.sort((a, b) => {
    const an = getName(a).toLowerCase();
    const bn = getName(b).toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  const handleSelect = id => {
    setSelected(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0008', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 650, maxWidth: 800, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3>Select Contacts</h3>        {/* Filter section */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 2, minWidth: 160, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
          />          <select value={lastContactedFilter} onChange={e => setLastContactedFilter(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="any">Any time</option>
            <option value="7">Not contacted in last 7 days</option>
            <option value="30">Not contacted in last 30 days</option>
            <option value="never">Never contacted</option>
          </select>
          <select value={campaignStatusFilter} onChange={e => setCampaignStatusFilter(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="any">Any campaign status</option>
            <option value="active">In active campaign</option>
            <option value="inactive">Not in active campaign</option>
          </select>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
          {filtered.length === 0 ? <div style={{ color: '#888' }}>No contacts found.</div> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filtered.map(c => (
                <li key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => handleSelect(c.id)}
                    style={{ marginRight: 8 }}
                  />
                  <span>{getName(c)}</span>
                  {c.email && <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>{c.email}</span>}                  {/* Optionally show last contacted date */}
                  {contactLastContactedMap[c.id] && <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>Last: {contactLastContactedMap[c.id].toLocaleDateString()}</span>}
                  {/* Show campaign status */}
                  {isInActiveCampaign(c) && <span style={{ color: '#5BA150', fontSize: 11, marginLeft: 8, fontWeight: 600 }}>●&nbsp;Active Campaign</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }}>Cancel</button>
          <button onClick={() => onSelect(selected)} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 24px', fontWeight: 600 }} disabled={selected.length === 0}>Next</button>
        </div>
      </div>
    </div>
  );
}
