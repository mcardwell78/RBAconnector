// Enhanced automation service for intelligent campaign recommendations
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createAutomatedTask, AUTOMATION_TASK_TYPES, TASK_PRIORITIES } from './automationReview';
import { enrollContacts } from './campaignEnrollments';

// Campaign recommendation categories based on contact heat scores
export const CAMPAIGN_CATEGORIES = {
  COLD_LEAD: 'Cold Lead - Spark Interest',
  WARM_LEAD: 'Warm Lead - Nurture',
  HOT_LEAD: 'Hot Lead - Convert',
  CUSTOMER: 'Customer - Retain/Upsell',
  REACTIVATION: 'Reactivation - Win Back'
};

// Heat score ranges for recommendations
export const HEAT_SCORE_RANGES = {
  COLD: { min: 0, max: 9, category: CAMPAIGN_CATEGORIES.COLD_LEAD },
  WARM: { min: 10, max: 19, category: CAMPAIGN_CATEGORIES.WARM_LEAD },
  HOT: { min: 20, max: 29, category: CAMPAIGN_CATEGORIES.HOT_LEAD },
  CUSTOMER: { min: 30, max: 49, category: CAMPAIGN_CATEGORIES.CUSTOMER },
  REACTIVATION: { min: -10, max: -1, category: CAMPAIGN_CATEGORIES.REACTIVATION }
};

/**
 * Analyze contacts and suggest campaign enrollments
 */
export async function analyzeCampaignOpportunities(userId) {
  try {
    // Get all contacts for the user
    const contactsQuery = query(
      collection(db, 'contacts'),
      where('userId', '==', userId)
    );
    const contactsSnapshot = await getDocs(contactsQuery);
    const contacts = contactsSnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data(),
      heatScore: doc.data().heatScore || 0 
    }));

    // Get all campaigns for the user
    const campaignsQuery = query(
      collection(db, 'campaigns'),
      where('userId', '==', userId)
    );
    const campaignsSnapshot = await getDocs(campaignsQuery);
    const campaigns = campaignsSnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    }));

    // Get existing enrollments to avoid duplicates
    const enrollmentsQuery = query(
      collection(db, 'campaignEnrollments'),
      where('userId', '==', userId),
      where('status', 'in', ['active', 'pending'])
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
    const activeEnrollments = new Set();
    enrollmentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      activeEnrollments.add(`${data.contactId}-${data.campaignId}`);
    });

    // Categorize contacts by heat score
    const contactsByCategory = categorizeContactsByHeatScore(contacts);

    // Generate recommendations for each category
    const recommendations = [];
    for (const [category, categoryContacts] of Object.entries(contactsByCategory)) {
      if (categoryContacts.length === 0) continue;

      // Find suitable campaigns for this category
      const suitableCampaigns = findCampaignsForCategory(campaigns, category);
      
      if (suitableCampaigns.length === 0) continue;

      // Filter out already enrolled contacts
      const availableContacts = categoryContacts.filter(contact => {
        return suitableCampaigns.some(campaign => 
          !activeEnrollments.has(`${contact.id}-${campaign.id}`)
        );
      });

      if (availableContacts.length > 0) {
        recommendations.push({
          category,
          contacts: availableContacts,
          suggestedCampaigns: suitableCampaigns,
          priority: calculateRecommendationPriority(category, availableContacts.length),
          reasoning: generateRecommendationReasoning(category, availableContacts.length)
        });
      }
    }

    return recommendations;
  } catch (error) {
    console.error('Error analyzing campaign opportunities:', error);
    throw error;
  }
}

/**
 * Categorize contacts by their heat scores
 */
function categorizeContactsByHeatScore(contacts) {
  const categories = {
    [CAMPAIGN_CATEGORIES.COLD_LEAD]: [],
    [CAMPAIGN_CATEGORIES.WARM_LEAD]: [],
    [CAMPAIGN_CATEGORIES.HOT_LEAD]: [],
    [CAMPAIGN_CATEGORIES.CUSTOMER]: [],
    [CAMPAIGN_CATEGORIES.REACTIVATION]: []
  };

  contacts.forEach(contact => {
    const heatScore = contact.heatScore || 0;
    
    for (const [key, range] of Object.entries(HEAT_SCORE_RANGES)) {
      if (heatScore >= range.min && heatScore <= range.max) {
        categories[range.category].push(contact);
        break;
      }
    }
  });

  return categories;
}

/**
 * Find campaigns suitable for a specific category
 */
function findCampaignsForCategory(campaigns, category) {
  return campaigns.filter(campaign => {
    const purpose = campaign.purpose || '';
    const name = campaign.name || '';
    const description = campaign.description || '';
    
    // Match campaigns based on their purpose, name, or description
    const searchText = `${purpose} ${name} ${description}`.toLowerCase();
    
    switch (category) {
      case CAMPAIGN_CATEGORIES.COLD_LEAD:
        return searchText.includes('cold') || 
               searchText.includes('spark') || 
               searchText.includes('interest') ||
               searchText.includes('introduction') ||
               searchText.includes('awareness');
               
      case CAMPAIGN_CATEGORIES.WARM_LEAD:
        return searchText.includes('warm') || 
               searchText.includes('nurture') || 
               searchText.includes('follow') ||
               searchText.includes('relationship') ||
               searchText.includes('engage');
               
      case CAMPAIGN_CATEGORIES.HOT_LEAD:
        return searchText.includes('hot') || 
               searchText.includes('convert') || 
               searchText.includes('close') ||
               searchText.includes('proposal') ||
               searchText.includes('demo');
               
      case CAMPAIGN_CATEGORIES.CUSTOMER:
        return searchText.includes('customer') || 
               searchText.includes('retain') || 
               searchText.includes('upsell') ||
               searchText.includes('loyalty') ||
               searchText.includes('success');
               
      case CAMPAIGN_CATEGORIES.REACTIVATION:
        return searchText.includes('reactivation') || 
               searchText.includes('win back') || 
               searchText.includes('comeback') ||
               searchText.includes('re-engage');
               
      default:
        return false;
    }
  });
}

/**
 * Calculate priority for recommendations
 */
function calculateRecommendationPriority(category, contactCount) {
  // Hot leads get highest priority
  if (category === CAMPAIGN_CATEGORIES.HOT_LEAD) return TASK_PRIORITIES.HIGH;
  
  // Many contacts = higher priority
  if (contactCount >= 10) return TASK_PRIORITIES.HIGH;
  if (contactCount >= 5) return TASK_PRIORITIES.MEDIUM;
  
  return TASK_PRIORITIES.LOW;
}

/**
 * Generate reasoning text for recommendations
 */
function generateRecommendationReasoning(category, contactCount) {
  const plural = contactCount > 1 ? 's' : '';
  
  switch (category) {
    case CAMPAIGN_CATEGORIES.COLD_LEAD:
      return `${contactCount} cold lead${plural} identified. These contacts have low engagement and could benefit from interest-sparking campaigns.`;
      
    case CAMPAIGN_CATEGORIES.WARM_LEAD:
      return `${contactCount} warm lead${plural} ready for nurturing. These contacts have shown some interest and are prime for relationship building.`;
      
    case CAMPAIGN_CATEGORIES.HOT_LEAD:
      return `${contactCount} hot lead${plural} ready to convert! These highly engaged contacts should be prioritized for closing campaigns.`;
      
    case CAMPAIGN_CATEGORIES.CUSTOMER:
      return `${contactCount} existing customer${plural} identified for retention/upselling opportunities.`;
      
    case CAMPAIGN_CATEGORIES.REACTIVATION:
      return `${contactCount} inactive contact${plural} detected. These contacts may benefit from re-engagement campaigns.`;
      
    default:
      return `${contactCount} contact${plural} identified for campaign enrollment.`;
  }
}

/**
 * Create an automation task for campaign enrollment approval
 */
export async function createCampaignEnrollmentTask(recommendation, selectedCampaignId, selectedContactIds) {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) throw new Error('User not authenticated');

  // Get campaign details
  const campaignDoc = await doc(db, 'campaigns', selectedCampaignId);
  const campaignSnap = await getDocs(query(collection(db, 'campaigns'), where('__name__', '==', selectedCampaignId)));
  const campaign = campaignSnap.docs[0]?.data();

  if (!campaign) throw new Error('Campaign not found');

  const taskData = {
    type: AUTOMATION_TASK_TYPES.CAMPAIGN_ASSIGNMENT,
    title: `Enroll ${selectedContactIds.length} contacts in "${campaign.name}"`,
    description: `Automated recommendation to enroll ${selectedContactIds.length} ${recommendation.category.toLowerCase()} contacts in the "${campaign.name}" campaign.`,
    priority: recommendation.priority,
    
    executionData: {
      campaignId: selectedCampaignId,
      contactIds: selectedContactIds,
      enrollmentType: 'automated_recommendation',
      category: recommendation.category
    },
    
    estimatedImpact: {
      contactsAffected: selectedContactIds.length,
      campaignType: campaign.purpose || 'Unknown',
      expectedEngagement: predictEngagement(recommendation.category)
    },
    
    affectedContacts: selectedContactIds,
    
    tags: ['campaign_enrollment', 'automated_recommendation', recommendation.category.toLowerCase().replace(/\s+/g, '_')],
    
    notes: recommendation.reasoning,
    
    triggerEvent: 'heat_score_analysis',
    automationRuleId: `auto_enrollment_${recommendation.category.toLowerCase().replace(/\s+/g, '_')}`
  };

  return await createAutomatedTask(taskData);
}

/**
 * Predict engagement based on category
 */
function predictEngagement(category) {
  switch (category) {
    case CAMPAIGN_CATEGORIES.HOT_LEAD:
      return 'High - contacts are highly engaged';
    case CAMPAIGN_CATEGORIES.WARM_LEAD:
      return 'Medium-High - contacts show interest';
    case CAMPAIGN_CATEGORIES.CUSTOMER:
      return 'Medium - existing relationship';
    case CAMPAIGN_CATEGORIES.COLD_LEAD:
      return 'Low-Medium - building interest';
    case CAMPAIGN_CATEGORIES.REACTIVATION:
      return 'Variable - depends on reactivation success';
    default:
      return 'Unknown';
  }
}

/**
 * Execute approved campaign enrollment
 */
export async function executeAutomatedEnrollment(taskId, executionData) {
  try {
    const { campaignId, contactIds } = executionData;
    
    // Use existing enrollment service
    const result = await enrollContacts(campaignId, contactIds);
    
    // Update task status
    const taskRef = doc(db, 'automationTasks', taskId);
    await updateDoc(taskRef, {
      status: 'executed',
      executedAt: new Date(),
      executionResult: {
        enrolled: result.enrolled?.length || 0,
        skipped: result.skipped?.length || 0,
        errors: result.error ? [result.error.message] : []
      }
    });

    return result;
  } catch (error) {
    // Update task with failure status
    const taskRef = doc(db, 'automationTasks', taskId);
    await updateDoc(taskRef, {
      status: 'failed',
      executedAt: new Date(),
      executionResult: {
        error: error.message
      }
    });
    
    throw error;
  }
}

/**
 * Generate automated recommendations and create tasks
 */
export async function generateAutomatedRecommendations(userId) {
  try {
    const recommendations = await analyzeCampaignOpportunities(userId);
    
    const createdTasks = [];
    
    // For each recommendation with a clear best campaign match, create a task
    for (const recommendation of recommendations) {
      if (recommendation.suggestedCampaigns.length === 1 && recommendation.contacts.length >= 3) {
        // Auto-suggest enrollment for clear matches with sufficient contacts
        const task = await createCampaignEnrollmentTask(
          recommendation,
          recommendation.suggestedCampaigns[0].id,
          recommendation.contacts.map(c => c.id)
        );
        createdTasks.push(task);
      }
    }
    
    return {
      recommendations,
      createdTasks,
      summary: {
        totalRecommendations: recommendations.length,
        totalContactsAnalyzed: recommendations.reduce((sum, r) => sum + r.contacts.length, 0),
        autoTasksCreated: createdTasks.length
      }
    };
  } catch (error) {
    console.error('Error generating automated recommendations:', error);
    throw error;
  }
}
