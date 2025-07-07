import React, { useState } from 'react';

/**
 * EmailLogsSection
 * Displays paginated email logs for a contact.
 * Always ensure all map/conditional blocks are closed with matching braces/parentheses.
 */
export function EmailLogsSection({
  emailLogs = [],
  emailLogError = '',
  emailLogPage = 1,
  setEmailLogPage = () => {},
  emailLogPageSize = 10,
  setEmailLogPageSize = () => {},
  totalEmailLogPages = 1,
  flat = false,
}) {
  // Sort email logs by sent date (descending)
  const sortedLogs = (emailLogs || []).slice().sort((a, b) => {
    const aDate = a.sentAt?.seconds || 0;
    const bDate = b.sentAt?.seconds || 0;
    return bDate - aDate;
  });
  const paginatedEmailLogs = sortedLogs.slice((emailLogPage-1)*emailLogPageSize, emailLogPage*emailLogPageSize);
  return (
    <div style={{ marginTop: 32, marginBottom: 48 }}>
      {/* Email Logs Section START */}
      {emailLogError && <div style={{ color: 'red', marginBottom: 8 }}>{emailLogError}</div>}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <span>Show</span>
        <select value={emailLogPageSize} onChange={e => { setEmailLogPageSize(Number(e.target.value)); setEmailLogPage(1); }}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
        <span>per page</span>
        {totalEmailLogPages > 1 && (
          <>
            <button onClick={() => setEmailLogPage(p => Math.max(1, p-1))} disabled={emailLogPage === 1}>Prev</button>
            <span>Page {emailLogPage} of {totalEmailLogPages}</span>
            <button onClick={() => setEmailLogPage(p => Math.min(totalEmailLogPages, p+1))} disabled={emailLogPage === totalEmailLogPages}>Next</button>
          </>
        )}
      </div>
      <div style={flat ? { padding: 0, background: 'none', boxShadow: 'none', borderRadius: 0 } : { background: '#f9f9f9', padding: 16, borderRadius: 8, boxShadow: '0 2px 4px #0001' }}>
        {paginatedEmailLogs.length === 0 ? (
          <div>No email logs found for this contact.</div>
        ) : (
          // Email logs map START
          paginatedEmailLogs.map(log => (
            <div key={log.id} style={{ borderBottom: '1px solid #ddd', paddingBottom: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 500 }}>{log.subject}</div>
                <div style={{ fontSize: 12, color: '#666', marginLeft: 16 }}>
                  {log.sentAt && log.sentAt.seconds ? `Date Sent: ${new Date(log.sentAt.seconds * 1000).toLocaleDateString()}` : '-'}
                </div>
              </div>
              <div style={{ fontSize: 13, color: log.openedAt ? '#388e3c' : '#888', marginTop: 2 }}>
                {log.campaignId
                  ? log.stepIndex !== undefined && log.stepIndex !== null
                    ? `Campaign Email (Step ${log.stepIndex + 1})`
                    : 'Campaign Email'
                  : 'One-off Email'}
              </div>
            </div>
          ))
          // Email logs map END
        )}
      </div>
      {/* Email Logs Section END */}
    </div>
  );
}

/**
 * HistoricalEmailsAccordion
 * Collapsible section that shows 'Historical Emails' title and a link to view the email logs.
 */
export function HistoricalEmailsAccordion({ emailLogs, emailLogError, emailLogPage, setEmailLogPage, emailLogPageSize, setEmailLogPageSize, totalEmailLogPages }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ width: '100%', maxWidth: 800, minWidth: 600, padding: 32, marginTop: 0, marginBottom: 16, position: 'relative', zIndex: 1, minHeight: 55, background: '#f6f6f6', borderRadius: 8, boxShadow: '0 2px 8px #0002', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, marginTop: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 22, textAlign: 'left', marginTop: 0, marginLeft: 0 }}>Historical Emails</span>
        <a href="#" style={{ fontSize: 14, color: '#1976d2', textDecoration: 'underline', cursor: 'pointer', marginLeft: 12 }} onClick={e => { e.preventDefault(); setExpanded(v => !v); }}>{expanded ? 'hide list' : 'view list'}</a>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, width: '100%' }}>
          <EmailLogsSection
            emailLogs={emailLogs}
            emailLogError={emailLogError}
            emailLogPage={emailLogPage}
            setEmailLogPage={setEmailLogPage}
            emailLogPageSize={emailLogPageSize}
            setEmailLogPageSize={setEmailLogPageSize}
            totalEmailLogPages={totalEmailLogPages}
            flat
          />
        </div>
      )}
    </div>
  );
}
