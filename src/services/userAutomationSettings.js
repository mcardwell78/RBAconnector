// User automation settings and preferences
import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, addDoc } from 'firebase/firestore';

// Default automation settings
const DEFAULT_AUTOMATION_SETTINGS = {
  enableTaskCreation: false,
  enableEscalationAlerts: true,
  enableHeatScoring: true,
  maxTasksPerDay: 5,
  workingHours: { start: '09:00', end: '17:00' },
  excludeWeekends: true,
  hotLeadActions: true,
  warmLeadActions: true,
  coldLeadActions: false,
  emailTrackingEnabled: true,
  automationPreviewMode: true, // Show what would happen before doing it
  notificationPreferences: {
    email: true,
    inApp: true,
    criticalOnly: false
  },
  automationRules: {
    hotLeadPhoneCall: {
      enabled: true,
      delayDays: 1,
      description: 'Create phone call task for hot leads'
    },
    warmLeadFollowUp: {
      enabled: true,
      delayDays: 2,
      description: 'Create follow-up task for warm leads'
    },
    coldLeadReheat: {
      enabled: false,
      delayDays: 7,
      description: 'Suggest reheat campaign for cold leads'
    },
    overdueContactAlert: {
      enabled: true,
      delayDays: 14,
      description: 'Alert when contact not reached in 14+ days'
    }
  }
};

// Get user automation settings
export async function getUserAutomationSettings(userId) {
  try {
    const settingsRef = doc(db, 'userSettings', userId);
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      // Merge with defaults to ensure all settings exist
      return {
        ...DEFAULT_AUTOMATION_SETTINGS,
        ...data.automationSettings,
        lastUpdated: data.lastUpdated
      };
    } else {
      // Create default settings for new user
      await setDoc(settingsRef, {
        automationSettings: DEFAULT_AUTOMATION_SETTINGS,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });
      return DEFAULT_AUTOMATION_SETTINGS;
    }
  } catch (error) {
    console.error('Error fetching user automation settings:', error);
    return DEFAULT_AUTOMATION_SETTINGS;
  }
}

// Update user automation settings
export async function updateUserAutomationSettings(userId, settings) {
  try {
    const settingsRef = doc(db, 'userSettings', userId);
    
    await updateDoc(settingsRef, {
      automationSettings: settings,
      lastUpdated: serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating user automation settings:', error);
    return { success: false, error: error.message };
  }
}

// Check if automation is allowed at current time
export function isAutomationAllowed(settings) {
  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Check working hours
  if (currentTime < settings.workingHours.start || currentTime > settings.workingHours.end) {
    return { allowed: false, reason: 'Outside working hours' };
  }
  
  // Check weekends
  if (settings.excludeWeekends && (currentDay === 0 || currentDay === 6)) {
    return { allowed: false, reason: 'Weekend exclusion enabled' };
  }
  
  return { allowed: true };
}

// Get automation preview - what would happen if automation ran
export async function getAutomationPreview(userId) {
  try {
    const settings = await getUserAutomationSettings(userId);
    
    if (!settings.automationPreviewMode) {
      return { enabled: false };
    }
    
    // Import heat score service
    const { getContactsNeedingAttention } = await import('./contactHeatScore');
    const needsAttention = await getContactsNeedingAttention(userId);
    
    const preview = {
      enabled: true,
      timestamp: new Date().toISOString(),
      actions: []
    };
    
    // Hot lead actions
    if (settings.automationRules.hotLeadPhoneCall.enabled) {
      needsAttention.critical.forEach(contact => {
        if (contact.heatCategory.key === 'HOT') {
          preview.actions.push({
            type: 'phone_call',
            contactId: contact.id,
            contactName: `${contact.firstName} ${contact.lastName}`,
            reason: 'Hot lead with no contact in 30+ days',
            priority: 'critical'
          });
        }
      });
    }
    
    // Warm lead follow-ups
    if (settings.automationRules.warmLeadFollowUp.enabled) {
      needsAttention.high.forEach(contact => {
        if (contact.heatCategory.key === 'WARM') {
          preview.actions.push({
            type: 'email_follow_up',
            contactId: contact.id,
            contactName: `${contact.firstName} ${contact.lastName}`,
            reason: 'Warm lead with no contact in 14+ days',
            priority: 'high'
          });
        }
      });
    }
    
    // Overdue contact alerts
    if (settings.automationRules.overdueContactAlert.enabled) {
      const overdueCount = needsAttention.critical.length + needsAttention.high.length;
      if (overdueCount > 0) {
        preview.actions.push({
          type: 'alert',
          reason: `${overdueCount} contacts overdue for follow-up`,
          priority: 'medium',
          data: { overdueCount, critical: needsAttention.critical.length }
        });
      }
    }
    
    // Limit actions based on daily limit
    if (preview.actions.length > settings.maxTasksPerDay) {
      preview.actions = preview.actions
        .sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, medium: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        })
        .slice(0, settings.maxTasksPerDay);
      
      preview.limitReached = true;
      preview.totalActions = preview.actions.length;
    }
    
    return preview;
  } catch (error) {
    console.error('Error generating automation preview:', error);
    return { enabled: false, error: error.message };
  }
}

// Execute automation actions (with user approval)
export async function executeAutomationActions(userId, approvedActions) {
  try {
    const settings = await getUserAutomationSettings(userId);
    
    if (!settings.enableTaskCreation) {
      return { success: false, error: 'Task creation not enabled' };
    }
    
    const automationCheck = isAutomationAllowed(settings);
    if (!automationCheck.allowed) {
      return { success: false, error: automationCheck.reason };
    }
    
    const results = {
      success: true,
      tasksCreated: 0,
      alertsSent: 0,
      errors: []
    };
    
    // Import task service
    const { addDoc, collection } = await import('firebase/firestore');
    
    for (const action of approvedActions) {
      try {
        if (action.type === 'phone_call' || action.type === 'email_follow_up') {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 1); // Due tomorrow
          
          await addDoc(collection(db, 'tasks'), {
            contactId: action.contactId,
            type: action.type,
            description: `Automated: ${action.reason}`,
            dueDate: dueDate.toISOString(),
            completed: false,
            automated: true,
            priority: action.priority,
            userId: userId,
            createdAt: serverTimestamp(),
            createdBy: 'automation'
          });
          
          results.tasksCreated++;
        } else if (action.type === 'alert') {
          // Handle alerts (could send email, create notification, etc.)
          results.alertsSent++;
        }
      } catch (actionError) {
        results.errors.push({
          action: action.type,
          contactId: action.contactId,
          error: actionError.message
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error executing automation actions:', error);
    return { success: false, error: error.message };
  }
}

// Get automation statistics
export async function getAutomationStats(userId, timeFrame = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeFrame);
    
    // Query automated tasks
    const { getDocs, query, where, collection, orderBy } = await import('firebase/firestore');
    
    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', userId),
      where('automated', '==', true),
      where('createdAt', '>=', startDate),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const automatedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const stats = {
      totalAutomatedTasks: automatedTasks.length,
      completedTasks: automatedTasks.filter(t => t.completed).length,
      pendingTasks: automatedTasks.filter(t => !t.completed).length,
      tasksByType: {},
      tasksByPriority: {},
      completionRate: 0
    };
    
    // Group by type and priority
    automatedTasks.forEach(task => {
      stats.tasksByType[task.type] = (stats.tasksByType[task.type] || 0) + 1;
      stats.tasksByPriority[task.priority] = (stats.tasksByPriority[task.priority] || 0) + 1;
    });
    
    // Calculate completion rate
    if (stats.totalAutomatedTasks > 0) {
      stats.completionRate = Math.round((stats.completedTasks / stats.totalAutomatedTasks) * 100);
    }
    
    return stats;
  } catch (error) {
    console.error('Error fetching automation stats:', error);
    return null;
  }
}

// Create an automation trigger
export async function createAutomationTrigger(userId, triggerData) {
  try {
    const trigger = {
      ...triggerData,
      userId,
      createdAt: serverTimestamp(),
      status: 'active'
    };
    
    const triggersRef = collection(db, 'automationTriggers');
    const docRef = await addDoc(triggersRef, trigger);
    return { id: docRef.id, ...trigger };
  } catch (error) {
    console.error('Error creating automation trigger:', error);
    throw error;
  }
}

// Get active triggers for a user
export async function getActiveTriggers(userId) {
  try {
    const triggersRef = collection(db, 'automationTriggers');
    const q = query(
      triggersRef,
      where('userId', '==', userId),
      where('status', '==', 'active')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching active triggers:', error);
    return [];
  }
}

// Delete a trigger
export async function deleteTrigger(triggerId) {
  try {
    const triggerRef = doc(db, 'automationTriggers', triggerId);
    await deleteDoc(triggerRef);
    return true;
  } catch (error) {
    console.error('Error deleting trigger:', error);
    throw error;
  }
}
