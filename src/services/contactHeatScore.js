// Contact heat scoring and engagement analytics
import { db } from './firebase';
import { collection, doc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp, addDoc } from 'firebase/firestore';

// Heat score calculation rules
const HEAT_SCORE_RULES = {
  EMAIL_OPENED: 3,
  LINK_CLICKED: 5,
  CTA_CLICKED: 10,
  EMAIL_REPLIED: 15,
  CONTENT_REVISITED: 5,
  UNSUBSCRIBED: -10,
  EMAIL_BOUNCED: -20,
  MARKED_SPAM: -20,
  NO_INTERACTION_30_DAYS: -5,
  WEEKLY_DECAY: -1
};

// Heat score categories
export const HEAT_CATEGORIES = {
  HOT: { min: 20, max: 100, label: 'Hot Lead', color: '#ff4444' },
  WARM: { min: 10, max: 19, label: 'Warm Lead', color: '#ff8800' },
  COLD: { min: 0, max: 9, label: 'Cold Lead', color: '#4444ff' }
};

// Calculate and update contact heat score
export async function updateContactHeatScore(contactId, event, metadata = {}) {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user?.uid) return null;

    const contactRef = doc(db, 'contacts', contactId);
    const contactDoc = await getDoc(contactRef);
    
    if (!contactDoc.exists()) {
      console.error('Contact not found:', contactId);
      return null;
    }

    const contact = contactDoc.data();
    const currentScore = contact.heatScore || 0;
    const scoreChange = HEAT_SCORE_RULES[event] || 0;
    
    // Calculate new score (keep between 0-100)
    const newScore = Math.max(0, Math.min(100, currentScore + scoreChange));
    
    // Determine category
    const category = getHeatCategory(newScore);
    
    // Update contact with new heat data
    const updateData = {
      heatScore: newScore,
      heatCategory: category.label,
      lastEngagement: serverTimestamp(),
      lastEngagementEvent: event,
      lastEngagementMetadata: metadata
    };

    // Update outreach tracking if it's an outbound action
    if (['EMAIL_SENT', 'PHONE_CALL_MADE', 'EMAIL_REPLIED'].includes(event)) {
      updateData.lastOutreach = serverTimestamp();
    }

    await updateDoc(contactRef, updateData);
    
    // Check if automation should be triggered
    await checkAutomationTriggers(contactId, newScore, category);
    
    return { contactId, oldScore: currentScore, newScore, category };
  } catch (error) {
    console.error('Error updating contact heat score:', error);
    return null;
  }
}

// Get heat category for a score
export function getHeatCategory(score) {
  for (const [key, category] of Object.entries(HEAT_CATEGORIES)) {
    if (score >= category.min && score <= category.max) {
      return { key, ...category };
    }
  }
  return { key: 'COLD', ...HEAT_CATEGORIES.COLD };
}

// Get contacts by heat category
export async function getContactsByHeatCategory(userId, category = null) {
  try {
    let q;
    
    if (category) {
      const categoryData = HEAT_CATEGORIES[category];
      q = query(
        collection(db, 'contacts'),
        where('userId', '==', userId),
        where('heatScore', '>=', categoryData.min),
        where('heatScore', '<=', categoryData.max),
        orderBy('heatScore', 'desc'),
        limit(50)
      );
    } else {
      q = query(
        collection(db, 'contacts'),
        where('userId', '==', userId),
        orderBy('heatScore', 'desc'),
        limit(100)
      );
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data(),
      heatCategory: getHeatCategory(doc.data().heatScore || 0)
    }));
  } catch (error) {
    console.error('Error fetching contacts by heat category:', error);
    return [];
  }
}

// Get contacts needing attention (overdue follow-up)
export async function getContactsNeedingAttention(userId) {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query for contacts with no recent outreach
    const q = query(
      collection(db, 'contacts'),
      where('userId', '==', userId),
      orderBy('lastOutreach', 'asc'),
      limit(100)
    );
    
    const snapshot = await getDocs(q);
    const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter and categorize by urgency
    const needsAttention = {
      critical: [], // No contact in 30+ days, hot/warm leads
      high: [],     // No contact in 14+ days, any heat
      medium: []    // No contact in 7+ days, hot leads only
    };
    
    contacts.forEach(contact => {
      const lastOutreach = contact.lastOutreach?.toDate() || new Date(0);
      const daysSinceOutreach = Math.floor((Date.now() - lastOutreach.getTime()) / (1000 * 60 * 60 * 24));
      const heatScore = contact.heatScore || 0;
      const category = getHeatCategory(heatScore);
      
      if (daysSinceOutreach >= 30 && category.key !== 'COLD') {
        needsAttention.critical.push({ ...contact, daysSinceOutreach, heatCategory: category });
      } else if (daysSinceOutreach >= 14) {
        needsAttention.high.push({ ...contact, daysSinceOutreach, heatCategory: category });
      } else if (daysSinceOutreach >= 7 && category.key === 'HOT') {
        needsAttention.medium.push({ ...contact, daysSinceOutreach, heatCategory: category });
      }
    });
    
    return needsAttention;
  } catch (error) {
    console.error('Error fetching contacts needing attention:', error);
    return { critical: [], high: [], medium: [] };
  }
}

// Apply weekly decay to all contact heat scores
export async function applyWeeklyDecay(userId) {
  try {
    const q = query(
      collection(db, 'contacts'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    const updatePromises = [];
    
    snapshot.docs.forEach(docSnapshot => {
      const contact = docSnapshot.data();
      const currentScore = contact.heatScore || 0;
      
      if (currentScore > 0) {
        const newScore = Math.max(0, currentScore + HEAT_SCORE_RULES.WEEKLY_DECAY);
        updatePromises.push(
          updateDoc(doc(db, 'contacts', docSnapshot.id), {
            heatScore: newScore,
            heatCategory: getHeatCategory(newScore).label,
            lastDecayApplied: serverTimestamp()
          })
        );
      }
    });
    
    await Promise.all(updatePromises);
    return { updated: updatePromises.length };
  } catch (error) {
    console.error('Error applying weekly decay:', error);
    return { updated: 0, error: error.message };
  }
}

// Initialize heat scores for existing contacts
export async function initializeHeatScoresForUser(userId) {
  try {
    // Get all contacts for the user
    const contactsQuery = query(
      collection(db, 'contacts'),
      where('userId', '==', userId)
    );
    const contactsSnap = await getDocs(contactsQuery);

    // Get existing heat scores
    const heatScoresQuery = query(
      collection(db, 'contactHeatScores'),
      where('userId', '==', userId)
    );
    const heatScoresSnap = await getDocs(heatScoresQuery);
    const existingHeatScores = new Set(heatScoresSnap.docs.map(doc => doc.data().contactId));

    // Create heat scores for contacts that don't have them
    const batch = [];
    contactsSnap.docs.forEach(contactDoc => {
      const contactId = contactDoc.id;
      const contactData = contactDoc.data();

      if (!existingHeatScores.has(contactId)) {
        const initialScore = calculateInitialScore(contactData);
        const category = categorizeScore(initialScore);

        batch.push({
          contactId,
          userId,
          score: initialScore,
          category,
          lastActivity: null,
          lastActivityType: null,
          createdAt: serverTimestamp(),
          lastDecayCheck: serverTimestamp()
        });
      }
    });

    // Create heat score documents in batches
    for (let i = 0; i < batch.length; i += 10) {
      const batchData = batch.slice(i, i + 10);
      await Promise.all(
        batchData.map(heatScoreData => 
          addDoc(collection(db, 'contactHeatScores'), heatScoreData)
        )
      );
    }

    return { initialized: batch.length };
  } catch (error) {
    console.error('Error initializing heat scores:', error);
    throw error;
  }
}

// Helper function to calculate initial score based on existing contact data
function calculateInitialScore(contactData) {
  let score = 20; // Base score

  // Add points based on contact data
  if (contactData.emailSentCount) {
    score += Math.min(contactData.emailSentCount * 2, 20); // Max 20 points
  }
  if (contactData.emailOpenCount) {
    score += Math.min(contactData.emailOpenCount * 3, 30); // Max 30 points
  }
  if (contactData.emailClickCount) {
    score += Math.min(contactData.emailClickCount * 5, 25); // Max 25 points
  }
  if (contactData.lastEmailOpenedAt) {
    const daysSinceOpen = (Date.now() - contactData.lastEmailOpenedAt.seconds * 1000) / (1000 * 60 * 60 * 24);
    if (daysSinceOpen < 7) score += 15;
    else if (daysSinceOpen < 30) score += 10;
    else if (daysSinceOpen < 90) score += 5;
  }

  return Math.min(score, 100);
}

// Check and trigger automation based on heat score changes
async function checkAutomationTriggers(contactId, newScore, category) {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user?.uid) return;

    // Get user automation settings
    const userSettingsRef = doc(db, 'userSettings', user.uid);
    const userSettingsDoc = await getDoc(userSettingsRef);
    
    if (!userSettingsDoc.exists()) return;
    
    const settings = userSettingsDoc.data().automationSettings || {};
    if (!settings.enableTaskCreation) return;

    // Hot lead automation
    if (category.key === 'HOT' && settings.hotLeadActions) {
      await createAutomatedTask(contactId, 'phone_call', 'Hot lead - immediate follow-up recommended', 1);
    }
    
    // Warm lead re-engagement
    if (category.key === 'WARM' && settings.warmLeadActions) {
      await createAutomatedTask(contactId, 'email_follow_up', 'Warm lead - schedule follow-up email', 2);
    }
    
    // Cold lead reheat campaign
    if (category.key === 'COLD' && settings.coldLeadActions) {
      await createAutomatedTask(contactId, 'reheat_campaign', 'Cold lead - consider reheat campaign', 7);
    }
    
  } catch (error) {
    console.error('Error checking automation triggers:', error);
  }
}

// Create automated task (with user approval workflow)
async function createAutomatedTask(contactId, taskType, description, dueDays) {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user?.uid) return;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);
    
    // Create task with automation flag for user review
    await addDoc(collection(db, 'tasks'), {
      contactId,
      type: taskType,
      description,
      dueDate: dueDate.toISOString(),
      completed: false,
      automated: true,
      needsApproval: true,
      userId: user.uid,
      createdAt: serverTimestamp(),
      createdBy: 'automation'
    });
    
  } catch (error) {
    console.error('Error creating automated task:', error);
  }
}

// Get heat score analytics for dashboard
export async function getHeatScoreAnalytics(userId) {
  try {
    const q = query(
      collection(db, 'contacts'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    const contacts = snapshot.docs.map(doc => doc.data());
    
    // Calculate analytics
    const totalContacts = contacts.length;
    const hotContacts = contacts.filter(c => (c.heatScore || 0) >= 20).length;
    const warmContacts = contacts.filter(c => (c.heatScore || 0) >= 10 && (c.heatScore || 0) < 20).length;
    const coldContacts = contacts.filter(c => (c.heatScore || 0) < 10).length;
    
    const averageHeatScore = totalContacts > 0 
      ? contacts.reduce((sum, c) => sum + (c.heatScore || 0), 0) / totalContacts 
      : 0;
    
    // Get engagement trends (simplified)
    const recentEngagements = contacts.filter(c => {
      const lastEngagement = c.lastEngagement?.toDate();
      if (!lastEngagement) return false;
      const daysSince = Math.floor((Date.now() - lastEngagement.getTime()) / (1000 * 60 * 60 * 24));
      return daysSince <= 7;
    }).length;
    
    return {
      totalContacts,
      hotContacts,
      warmContacts,
      coldContacts,
      averageHeatScore: Math.round(averageHeatScore * 10) / 10,
      recentEngagements,
      distribution: {
        hot: Math.round((hotContacts / totalContacts) * 100) || 0,
        warm: Math.round((warmContacts / totalContacts) * 100) || 0,
        cold: Math.round((coldContacts / totalContacts) * 100) || 0
      }
    };
  } catch (error) {
    console.error('Error fetching heat score analytics:', error);
    return null;
  }
}
