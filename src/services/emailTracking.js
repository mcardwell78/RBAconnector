// Email tracking and engagement analytics service
import { db } from './firebase';
import { collection, addDoc, query, where, getDocs, orderBy, limit, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const emailLogsCollection = collection(db, 'emailLogs');

// Track email engagement events
export async function trackEmailEvent(data) {
  try {
    // Instead of creating new engagement records, update the existing emailLog
    if (!data.emailLogId) {
      console.error('emailLogId is required for tracking');
      return { success: false, error: 'emailLogId is required' };
    }
    
    const emailLogRef = doc(db, 'emailLogs', data.emailLogId);
    
    const updateData = {
      lastUpdated: serverTimestamp()
    };
    
    // Handle different event types
    if (data.event === 'open') {
      updateData.opens = (data.currentOpens || 0) + 1;
      updateData.lastOpenedAt = serverTimestamp();
    } else if (data.event === 'click') {
      updateData.clicks = (data.currentClicks || 0) + 1;
      updateData.lastClickedAt = serverTimestamp();
    }
    
    await updateDoc(emailLogRef, updateData);
    
    // Update contact heat score after tracking
    if (data.contactId) {
      await updateContactHeatScore(data.contactId, data.event);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error tracking email event:', error);
    return { success: false, error: error.message };
  }
}

// Get engagement history for a contact
export async function getContactEngagements(contactId, userId) {
  try {
    const q = query(
      emailLogsCollection,
      where('contactId', '==', contactId),
      where('userId', '==', userId),
      where('status', 'in', ['sent', 'delivered']),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching contact engagements:', error);
    return [];
  }
}

// Get engagement summary for dashboard
export async function getEngagementSummary(userId, timeFrame = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeFrame);
    
    const q = query(
      emailLogsCollection,
      where('userId', '==', userId),
      where('timestamp', '>=', startDate),
      where('status', 'in', ['sent', 'delivered']),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const emailLogs = snapshot.docs.map(doc => doc.data());
    
    // Aggregate statistics from emailLogs
    const summary = {
      totalEmailsSent: emailLogs.length,
      emailsOpened: emailLogs.filter(e => e.opens > 0).length,
      linksClicked: emailLogs.filter(e => e.clicks > 0).length,
      totalOpens: emailLogs.reduce((sum, e) => sum + (e.opens || 0), 0),
      totalClicks: emailLogs.reduce((sum, e) => sum + (e.clicks || 0), 0),
      uniqueContacts: new Set(emailLogs.map(e => e.contactId)).size,
      topEngagedContacts: getTopEngagedContactsFromLogs(emailLogs),
      engagementsByDay: getEngagementsByDayFromLogs(emailLogs, timeFrame)
    };
    
    return summary;
  } catch (error) {
    console.error('Error fetching engagement summary:', error);
    return null;
  }
}

// Helper: Get top engaged contacts from emailLogs
function getTopEngagedContactsFromLogs(emailLogs) {
  const contactEngagements = {};
  
  emailLogs.forEach(log => {
    if (!contactEngagements[log.contactId]) {
      contactEngagements[log.contactId] = { 
        contactId: log.contactId, 
        contactName: log.contactName || 'Unknown',
        score: 0,
        opens: 0,
        clicks: 0
      };
    }
    
    const contact = contactEngagements[log.contactId];
    contact.opens += log.opens || 0;
    contact.clicks += log.clicks || 0;
    
    // Calculate score: opens worth 3 points, clicks worth 5 points
    contact.score = (contact.opens * 3) + (contact.clicks * 5);
  });
  
  return Object.values(contactEngagements)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
// Helper: Get engagements by day for charts from emailLogs
function getEngagementsByDayFromLogs(emailLogs, days) {
  const dailyData = {};
  
  // Initialize all days
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyData[dateStr] = { sent: 0, opened: 0, clicked: 0 };
  }
  
  // Count emails and engagements by day
  emailLogs.forEach(log => {
    if (log.timestamp && log.timestamp.toDate) {
      const dateStr = log.timestamp.toDate().toISOString().split('T')[0];
      if (dailyData[dateStr]) {
        dailyData[dateStr].sent++;
        if (log.opens > 0) dailyData[dateStr].opened++;
        if (log.clicks > 0) dailyData[dateStr].clicked++;
      }
    }
  });
  
  return Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));
}

// Update contact heat score based on engagement
async function updateContactHeatScore(contactId, event) {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user?.uid) return;
    
    // Score mapping
    const scoreChanges = {
      'opened': 3,
      'clicked': 5,
      'replied': 15,
      'unsubscribed': -10,
      'bounced': -20
    };
    
    const scoreChange = scoreChanges[event] || 0;
    if (scoreChange === 0) return;
    
    // Update contact document with new heat score
    const contactRef = doc(db, 'contacts', contactId);
    
    // Get current heat score or default to 0
    const contact = await getDoc(contactRef);
    const currentScore = contact.exists() ? (contact.data().heatScore || 0) : 0;
    const newScore = Math.max(0, Math.min(100, currentScore + scoreChange)); // Keep between 0-100
    
    await updateDoc(contactRef, {
      heatScore: newScore,
      lastEngagement: serverTimestamp(),
      lastEngagementEvent: event
    });
    
    return newScore;
  } catch (error) {
    console.error('Error updating contact heat score:', error);
    return null;
  }
}

// Generate tracking pixel URL
export function generateTrackingPixelUrl(emailId, contactId, userId) {
  const baseUrl = window.location.origin; // or your domain
  return `${baseUrl}/api/track/pixel?emailId=${emailId}&contactId=${contactId}&userId=${userId}`;
}

// Generate tracked link URL
export function generateTrackedLinkUrl(originalUrl, emailId, contactId, userId) {
  const baseUrl = window.location.origin;
  const encodedUrl = encodeURIComponent(originalUrl);
  return `${baseUrl}/api/track/click?url=${encodedUrl}&emailId=${emailId}&contactId=${contactId}&userId=${userId}`;
}

// Process email content to add tracking
export function addTrackingToEmail(emailContent, emailId, contactId, userId) {
  let trackedContent = emailContent;
  
  // Add tracking pixel (invisible 1x1 image)
  const trackingPixel = `<img src="${generateTrackingPixelUrl(emailId, contactId, userId)}" width="1" height="1" style="display: none;" alt="" />`;
  
  // Add tracking pixel before closing body tag
  if (trackedContent.includes('</body>')) {
    trackedContent = trackedContent.replace('</body>', `${trackingPixel}</body>`);
  } else {
    trackedContent += trackingPixel;
  }
  
  // Wrap all links with tracking
  const linkRegex = /href="([^"]+)"/g;
  trackedContent = trackedContent.replace(linkRegex, (match, url) => {
    // Skip mailto links and tracking links
    if (url.startsWith('mailto:') || url.includes('/api/track/')) {
      return match;
    }
    
    const trackedUrl = generateTrackedLinkUrl(url, emailId, contactId, userId);
    return `href="${trackedUrl}"`;
  });
  
  return trackedContent;
}
