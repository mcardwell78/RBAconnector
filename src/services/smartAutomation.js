// Enhanced automation service with intelligent limits and throttling
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { createAutomatedTask, AUTOMATION_TASK_TYPES, TASK_PRIORITIES } from './automationReview';
import { enrollContacts } from './campaignEnrollments';

// User tier limits for automation suggestions
export const USER_TIERS = {
  STARTER: {
    dailyEmailLimit: 100,
    maxDailyAutomationSuggestions: 3,
    maxBatchSize: 10,
    name: 'Starter'
  },
  PROFESSIONAL: {
    dailyEmailLimit: 500,
    maxDailyAutomationSuggestions: 8,
    maxBatchSize: 25,
    name: 'Professional'
  },
  BUSINESS: {
    dailyEmailLimit: 2000,
    maxDailyAutomationSuggestions: 15,
    maxBatchSize: 50,
    name: 'Business'
  },
  ENTERPRISE: {
    dailyEmailLimit: 10000,
    maxDailyAutomationSuggestions: 25,
    maxBatchSize: 100,
    name: 'Enterprise'
  }
};

// Provider-based email limits from SettingsScreen
export const PROVIDER_LIMITS = {
  Gmail: 100,
  'Google Workspace': 2000,
  Outlook: 300,
  'Microsoft 365': 10000,
  Yahoo: 500,
  Zoho: 200,
  SendGrid: 100,
};

/**
 * Get user's tier based on their email provider and custom limit
 */
export async function getUserTier(userId) {
  try {
    // Get user settings from Firestore
    const userDoc = await getDocs(query(
      collection(db, 'users'),
      where('uid', '==', userId)
    ));

    if (userDoc.empty) {
      return USER_TIERS.STARTER; // Default for new users
    }

    const userData = userDoc.docs[0].data();
    const emailProvider = userData.emailProvider || 'Gmail';
    const customLimit = userData.dailyEmailLimit || PROVIDER_LIMITS[emailProvider];

    // Determine tier based on email limit
    if (customLimit <= 100) return USER_TIERS.STARTER;
    if (customLimit <= 500) return USER_TIERS.PROFESSIONAL;
    if (customLimit <= 2000) return USER_TIERS.BUSINESS;
    return USER_TIERS.ENTERPRISE;
  } catch (error) {
    console.error('Error getting user tier:', error);
    return USER_TIERS.STARTER;
  }
}

/**
 * Check daily automation suggestion limits
 */
export async function getAutomationQuota(userId) {
  try {
    const userTier = await getUserTier(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Count automation tasks created today
    const tasksQuery = query(
      collection(db, 'automationTasks'),
      where('userId', '==', userId),
      where('createdAt', '>=', Timestamp.fromDate(today)),
      where('createdAt', '<', Timestamp.fromDate(tomorrow))
    );
    const tasksSnapshot = await getDocs(tasksQuery);
    const tasksCreatedToday = tasksSnapshot.size;

    // Count recommendations viewed/processed today
    const recsQuery = query(
      collection(db, 'automationRecommendations'),
      where('userId', '==', userId),
      where('createdAt', '>=', Timestamp.fromDate(today)),
      where('createdAt', '<', Timestamp.fromDate(tomorrow))
    );
    const recsSnapshot = await getDocs(recsQuery);
    const recommendationsToday = recsSnapshot.size;

    // Check current email usage for the day
    const emailLogsQuery = query(
      collection(db, 'emailLogs'),
      where('userId', '==', userId),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      where('timestamp', '<', Timestamp.fromDate(tomorrow)),
      where('status', '==', 'sent')
    );
    const emailLogsSnapshot = await getDocs(emailLogsQuery);
    const emailsSentToday = emailLogsSnapshot.size;

    return {
      userTier,
      tasksCreatedToday,
      recommendationsToday,
      emailsSentToday,
      maxDailyTasks: userTier.maxDailyAutomationSuggestions,
      maxBatchSize: userTier.maxBatchSize,
      dailyEmailLimit: userTier.dailyEmailLimit,
      remainingTasks: Math.max(0, userTier.maxDailyAutomationSuggestions - tasksCreatedToday),
      remainingEmails: Math.max(0, userTier.dailyEmailLimit - emailsSentToday),
      canCreateMoreTasks: tasksCreatedToday < userTier.maxDailyAutomationSuggestions,
      emailCapacityUsed: Math.round((emailsSentToday / userTier.dailyEmailLimit) * 100),
      isNearEmailLimit: emailsSentToday > (userTier.dailyEmailLimit * 0.8) // 80% threshold
    };
  } catch (error) {
    console.error('Error getting automation quota:', error);
    return {
      userTier: USER_TIERS.STARTER,
      remainingTasks: 0,
      canCreateMoreTasks: false,
      emailCapacityUsed: 100,
      isNearEmailLimit: true
    };
  }
}

/**
 * Intelligent automation recommendations with limits
 */
export async function getSmartAutomationRecommendations(userId) {
  try {
    const quota = await getAutomationQuota(userId);
    
    if (!quota.canCreateMoreTasks) {
      return {
        recommendations: [],
        quota,
        message: `Daily automation limit reached (${quota.maxDailyTasks}). Try again tomorrow.`
      };
    }

    if (quota.isNearEmailLimit) {
      return {
        recommendations: [],
        quota,
        message: `Email capacity at ${quota.emailCapacityUsed}%. Automation paused to prevent hitting spam filters.`
      };
    }

    // Get existing data
    const [contacts, campaigns, enrollments] = await Promise.all([
      getContactsWithHeatScores(userId),
      getActiveCampaigns(userId),
      getActiveEnrollments(userId)
    ]);

    if (contacts.length === 0 || campaigns.length === 0) {
      return {
        recommendations: [],
        quota,
        message: 'No contacts with heat scores or active campaigns found.'
      };
    }

    // Generate smart recommendations based on quota and limits
    const recommendations = await generateThrottledRecommendations({
      userId,
      contacts,
      campaigns,
      enrollments,
      quota
    });

    return {
      recommendations,
      quota,
      message: recommendations.length > 0 
        ? `${recommendations.length} smart recommendations generated based on your ${quota.userTier.name} plan.`
        : 'No new automation opportunities found at this time.'
    };
  } catch (error) {
    console.error('Error getting smart recommendations:', error);
    throw error;
  }
}

/**
 * Generate throttled recommendations based on user tier and current usage
 */
async function generateThrottledRecommendations({ userId, contacts, campaigns, enrollments, quota }) {
  const recommendations = [];
  const maxRecommendations = quota.remainingTasks;
  const maxBatchSize = quota.maxBatchSize;

  // Create enrollment exclusion set
  const enrollmentSet = new Set();
  enrollments.forEach(enrollment => {
    enrollmentSet.add(`${enrollment.contactId}-${enrollment.campaignId}`);
  });

  // Prioritize by heat score and engagement
  const hotContacts = contacts.filter(c => c.heatScore >= 70 && c.heatScore < 100);
  const warmContacts = contacts.filter(c => c.heatScore >= 40 && c.heatScore < 70);
  const coldContacts = contacts.filter(c => c.heatScore >= 10 && c.heatScore < 40);
  const reactivationContacts = contacts.filter(c => c.heatScore < 10 && c.heatScore > 0);

  // Generate recommendations in priority order
  const categories = [
    { contacts: hotContacts, category: 'HOT_LEAD', priority: 'high' },
    { contacts: warmContacts, category: 'WARM_LEAD', priority: 'medium' },
    { contacts: coldContacts, category: 'COLD_LEAD', priority: 'low' },
    { contacts: reactivationContacts, category: 'REACTIVATION', priority: 'medium' }
  ];

  for (const { contacts: categoryContacts, category, priority } of categories) {
    if (recommendations.length >= maxRecommendations) break;

    const availableContacts = categoryContacts.filter(contact => {
      return campaigns.some(campaign => 
        !enrollmentSet.has(`${contact.id}-${campaign.id}`) &&
        isCampaignSuitableForCategory(campaign, category)
      );
    });

    if (availableContacts.length === 0) continue;

    // Limit batch size based on user tier and remaining email capacity
    const effectiveBatchSize = Math.min(
      maxBatchSize,
      Math.floor(quota.remainingEmails / 3), // Conservative estimate: 3 emails per contact
      availableContacts.length
    );

    if (effectiveBatchSize < 5) continue; // Skip if batch would be too small

    const batchContacts = availableContacts.slice(0, effectiveBatchSize);
    const suitableCampaigns = campaigns.filter(campaign => 
      isCampaignSuitableForCategory(campaign, category)
    );

    if (suitableCampaigns.length > 0) {
      recommendations.push({
        category,
        priority,
        contacts: batchContacts,
        suggestedCampaigns: suitableCampaigns.slice(0, 3), // Limit to top 3 campaigns
        reasoning: generateReasoningForCategory(category, batchContacts.length, quota),
        estimatedEmails: batchContacts.length * 3, // Estimate 3 emails per contact
        createdAt: new Date(),
        isThrottled: true,
        userTier: quota.userTier.name
      });
    }
  }

  return recommendations.slice(0, maxRecommendations);
}

/**
 * Helper functions
 */
async function getContactsWithHeatScores(userId) {
  const contactsQuery = query(
    collection(db, 'contacts'),
    where('userId', '==', userId),
    where('heatScore', '>', 0)
  );
  const snapshot = await getDocs(contactsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getActiveCampaigns(userId) {
  const campaignsQuery = query(
    collection(db, 'campaigns'),
    where('userId', '==', userId),
    where('isActive', '==', true)
  );
  const snapshot = await getDocs(campaignsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getActiveEnrollments(userId) {
  const enrollmentsQuery = query(
    collection(db, 'campaignEnrollments'),
    where('userId', '==', userId),
    where('status', 'in', ['active', 'pending'])
  );
  const snapshot = await getDocs(enrollmentsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function isCampaignSuitableForCategory(campaign, category) {
  const purpose = campaign.purpose?.toLowerCase() || '';
  const name = campaign.name?.toLowerCase() || '';
  
  switch (category) {
    case 'HOT_LEAD':
      return purpose.includes('convert') || purpose.includes('close') || 
             name.includes('demo') || name.includes('sales');
    case 'WARM_LEAD':
      return purpose.includes('nurture') || purpose.includes('engage') ||
             name.includes('nurture') || name.includes('follow');
    case 'COLD_LEAD':
      return purpose.includes('introduce') || purpose.includes('awareness') ||
             name.includes('intro') || name.includes('welcome');
    case 'REACTIVATION':
      return purpose.includes('reactivate') || purpose.includes('win back') ||
             name.includes('comeback') || name.includes('reactivation');
    default:
      return true;
  }
}

function generateReasoningForCategory(category, contactCount, quota) {
  const tier = quota.userTier.name;
  const baseReasons = {
    'HOT_LEAD': `${contactCount} high-engagement contacts ready for conversion campaigns`,
    'WARM_LEAD': `${contactCount} engaged contacts that could benefit from nurturing`,
    'COLD_LEAD': `${contactCount} new contacts ready for introduction campaigns`,
    'REACTIVATION': `${contactCount} inactive contacts that could be re-engaged`
  };

  return `${baseReasons[category]} (${tier} plan: ${quota.remainingEmails} emails remaining today)`;
}

/**
 * OAuth Impact Assessment
 */
export function assessOAuthImpact() {
  return {
    emailSending: {
      impact: 'MINIMAL',
      reason: 'OAuth only affects authentication, not email sending through SendGrid API',
      recommendation: 'Safe to implement OAuth without affecting email limits'
    },
    userLimits: {
      impact: 'NONE', 
      reason: 'Email limits are stored in your Firestore, not dependent on auth method',
      recommendation: 'Current limit logic will work unchanged'
    },
    domainOwnership: {
      impact: 'CONSIDERATION',
      reason: 'RBA Connector domain ownership allows flexibility',
      recommendation: 'Can implement OAuth with your domain as the authority, no need for Renewal By Andersen approval initially'
    },
    timing: {
      impact: 'GOOD_TIME',
      reason: 'Automation system is stabilizing, good time for auth upgrade',
      recommendation: 'Implement OAuth now before adding more complex features'
    },
    implementation: {
      steps: [
        '1. Set up OAuth provider (Google, Microsoft) with RBA Connector domain',
        '2. Update Firebase Auth configuration',
        '3. Modify login/signup flows to use OAuth',
        '4. Test email sending still works with new auth',
        '5. Migrate existing users gradually'
      ],
      estimatedTime: '2-3 days',
      risks: 'Low - email functionality is separate from auth'
    }
  };
}

/**
 * Create automation task with quota validation
 */
export async function createQuotaValidatedTask(userId, taskData) {
  const quota = await getAutomationQuota(userId);
  
  if (!quota.canCreateMoreTasks) {
    throw new Error(`Daily automation limit reached (${quota.maxDailyTasks}). Please try again tomorrow.`);
  }

  if (quota.isNearEmailLimit) {
    throw new Error(`Email capacity at ${quota.emailCapacityUsed}%. Automation paused to prevent spam filter issues.`);
  }

  // Create task with quota metadata
  const enhancedTaskData = {
    ...taskData,
    quota: {
      tierUsed: quota.userTier.name,
      remainingTasksAtCreation: quota.remainingTasks - 1,
      emailCapacityAtCreation: quota.emailCapacityUsed
    },
    createdAt: new Date()
  };

  return createAutomatedTask(enhancedTaskData);
}
