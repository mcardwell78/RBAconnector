import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { mapToContactSchema } from '../utils/parseContacts';
import { findExistingContacts, addContact, updateContact } from '../services/contacts';
import { cardStyle, inputStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';

export default function UploadScreen() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [conflictResolutions, setConflictResolutions] = useState({});
  const [showConflicts, setShowConflicts] = useState(false);
  const [uploadReport, setUploadReport] = useState(null);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);
  }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('Parsing...');
    setUploadReport(null);
    let rows = [];
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true });
      rows = parsed.data;
    } else if (file.name.endsWith('.xlsx')) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    } else {
      setStatus('Unsupported file type.');
      return;
    }
    setStatus('Checking for duplicates...');
    const user = JSON.parse(localStorage.getItem('user'));
    const userId = user?.uid || null;
    // Remove empty rows (all fields blank)
    rows = rows.filter(row => Object.values(row).some(v => v && v.toString().trim() !== ''));
    const contactsToUpload = rows.map(row => ({ ...mapToContactSchema(row), userId }));
    // Remove contacts with no email, no mobile, and no home phone
    const filteredContactsToUpload = contactsToUpload.filter(c => (c.email && c.email.trim() !== '') || (c.mobilePhone && c.mobilePhone.replace(/\D/g, '') !== '') || (c.homePhone && c.homePhone.replace(/\D/g, '') !== ''));
    // Further scrub: remove leading/trailing whitespace, normalize case, and strip non-digits from phones for all contacts in batch
    function capitalizeName(name) {
      if (!name) return '';
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
    function normalizeContact(c) {
      return {
        ...c,
        email: (c.email || '').trim().toLowerCase(),
        mobilePhone: (c.mobilePhone || '').replace(/\D/g, ''),
        homePhone: (c.homePhone || '').replace(/\D/g, ''),
        firstName: capitalizeName((c.firstName || '').trim()),
        lastName: capitalizeName((c.lastName || '').trim()),
      };
    }
    const normalizedContacts = filteredContactsToUpload.map(normalizeContact);
    // Remove contacts that match an existing contact in the upload batch (dedupe within batch, now using all normalized fields)
    const seen = new Set();
    const trulyUniqueContacts = [];
    for (const c of normalizedContacts) {
      // Use all non-empty identifiers for deduplication key
      const keyParts = [];
      if (c.email) keyParts.push(c.email);
      if (c.mobilePhone) keyParts.push(c.mobilePhone);
      if (c.homePhone) keyParts.push(c.homePhone);
      if (c.firstName) keyParts.push(c.firstName);
      if (c.lastName) keyParts.push(c.lastName);
      if (keyParts.length === 0) continue; // skip if no identifiers
      const key = keyParts.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        trulyUniqueContacts.push(c);
      }
    }
    // Find existing contacts by email or phone
    const existing = await findExistingContacts(trulyUniqueContacts);
    // Build conflict list
    const conflicts = [];
    const toCreate = [];
    let duplicateCount = 0;
    for (const contact of trulyUniqueContacts) {
      // Normalize for duplicate check: trim and lowercase emails/phones
      const normEmail = (contact.email || '').trim().toLowerCase();
      const normMobile = (contact.mobilePhone || '').replace(/\D/g, '');
      const normHome = (contact.homePhone || '').replace(/\D/g, '');
      const match = existing.find(e => {
        const eEmail = (e.email || '').trim().toLowerCase();
        const eMobile = (e.mobilePhone || '').replace(/\D/g, '');
        const eHome = (e.homePhone || '').replace(/\D/g, '');
        return (normEmail && eEmail && normEmail === eEmail) ||
               (normMobile && eMobile && normMobile === eMobile) ||
               (normHome && eHome && normHome === eHome);
      });
      if (match) {
        // Check for mismatches, but ignore 'tags' and 'appointmentDate'
        const diffs = {};
        for (const key of Object.keys(contact)) {
          if (key === 'createdAt' || key === 'userId' || key === 'tags' || key === 'appointmentDate') continue;
          if ((contact[key] || '') !== (match[key] || '')) {
            diffs[key] = { existing: match[key], incoming: contact[key] };
          }
        }
        if (Object.keys(diffs).length === 0) {
          // True duplicate, skip and count
          duplicateCount++;
          continue;
        }
        // Only add to conflicts if there are diffs
        conflicts.push({ existing: match, incoming: contact, diffs });
      } else {
        toCreate.push(contact);
      }
    }
    if (conflicts.length > 0) {
      setConflicts(conflicts);
      setShowConflicts(true);
      setStatus('Conflicts found. Please resolve.');
      return;
    }
    // No conflicts, proceed to upload
    setStatus('Uploading to Firestore...');
    let uploaded = 0;
    for (const contact of toCreate) {
      try {
        const user = JSON.parse(localStorage.getItem('user'));
        await addContact({ ...contact, userId: user?.uid || null });
        uploaded++;
      } catch (e) {
        console.error('Upload error:', e);
      }
    }
    setUploadReport({ uploaded, duplicateCount, updated: 0, skipped: 0 });
    setStatus('Upload complete!');
  };

  const handleResolveConflicts = async () => {
    setStatus('Uploading resolved contacts...');
    let updated = 0;
    let skipped = 0;
    for (let i = 0; i < conflicts.length; ++i) {
      const c = conflicts[i];
      const action = conflictResolutions[i];
      if (action === 'keep') {
        skipped++;
        continue;
      }
      if (action === 'overwrite') {
        // Never overwrite appointmentDate
        const { appointmentDate, ...rest } = c.incoming;
        await updateContact(c.existing.id, rest);
        updated++;
      }
      // skip means do nothing
      if (action === 'skip') skipped++;
    }
    setShowConflicts(false);
    setUploadReport(r => ({ ...(r || {}), updated, skipped }));
    setStatus('Upload complete!');
  };

  function renderValue(val) {
    if (val && typeof val === 'object' && val.seconds !== undefined && val.nanoseconds !== undefined) {
      // Firestore Timestamp
      try {
        return new Date(val.seconds * 1000).toLocaleString();
      } catch {
        return JSON.stringify(val);
      }
    }
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  if (showConflicts) {
    return (
      <div style={{ padding: 32 }}>
        <h2>Resolve Conflicts</h2>
        <p>Some contacts already exist. For each, choose what to do:</p>
        <ul>
          {conflicts.map((c, i) => (
            <li key={i} style={{ marginBottom: 16, background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
              <div><b>Existing:</b> {c.existing.firstName} {c.existing.lastName} ({c.existing.email || c.existing.mobilePhone || c.existing.homePhone})</div>
              <div><b>Incoming:</b> {c.incoming.firstName} {c.incoming.lastName} ({c.incoming.email || c.incoming.mobilePhone || c.incoming.homePhone})</div>
              {Object.keys(c.diffs).length > 0 && (
                <div style={{ color: 'red', marginTop: 4 }}>
                  <b>Differences:</b>
                  <ul>
                    {Object.entries(c.diffs).map(([k, v]) => (
                      <li key={k}>{k}: existing = "{renderValue(v.existing)}", incoming = "{renderValue(v.incoming)}"</li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <label><input type="radio" name={`conflict-${i}`} checked={conflictResolutions[i] === 'keep'} onChange={() => setConflictResolutions(r => ({ ...r, [i]: 'keep' }))} /> Keep existing</label>{' '}
                <label><input type="radio" name={`conflict-${i}`} checked={conflictResolutions[i] === 'overwrite'} onChange={() => setConflictResolutions(r => ({ ...r, [i]: 'overwrite' }))} /> Overwrite with new</label>{' '}
                <label><input type="radio" name={`conflict-${i}`} checked={conflictResolutions[i] === 'skip'} onChange={() => setConflictResolutions(r => ({ ...r, [i]: 'skip' }))} /> Skip this record</label>
              </div>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 24 }}>
          <button onClick={handleResolveConflicts} style={{ background: '#5BA150', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 600, marginRight: 16 }}>Finish Upload</button>
          <button onClick={() => { setShowConflicts(false); setStatus('Upload cancelled.'); }} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 4, padding: '8px 24px', fontWeight: 600 }}>Cancel Upload</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: RBA_GREEN, minHeight: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', paddingTop: 112 }}>
      <div style={{ ...cardStyle, marginTop: 32, width: '100%', maxWidth: 600 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Upload Contacts (CSV/XLSX)</h2>
        <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} style={{ ...inputStyle, marginBottom: 16 }} />
        <button onClick={handleUpload} disabled={!file} style={{ ...buttonOutlineStyle, width: '100%', padding: '12px 0', fontWeight: 600, marginTop: 8 }}>Upload</button>
        <div style={{ marginTop: 16, textAlign: 'center', color: '#666' }}>{status}</div>
        {uploadReport && (
          <div style={{ marginTop: 24, background: '#f6f6f6', borderRadius: 8, padding: 16 }}>
            <h4 style={{ marginTop: 0 }}>Upload Report</h4>
            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
              <li><b>Uploaded successfully:</b> {uploadReport.uploaded}</li>
              <li><b>Duplicates (not uploaded):</b> {uploadReport.duplicateCount}</li>
              <li><b>Duplicates updated (fields changed):</b> {uploadReport.updated || 0}</li>
              <li><b>Duplicates skipped (user chose keep/skip):</b> {uploadReport.skipped || 0}</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
