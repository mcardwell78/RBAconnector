// Service for contact schema migration and enhancement
import { db } from './firebase';
import { collection, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';

// Enhanced contact schema with detailed subfields
export const CONTACT_SCHEMA_V2 = {
  // Core contact info
  firstName: '',
  lastName: '',
  email: '',
  mobilePhone: '',
  homePhone: '',
  address: {
    street: '',
    city: '',
    state: '',
    zip: '',
    area: '' // Legacy field compatibility
  },
  
  // Lead/prospect details
  leadSource: '', // 'referral', 'online', 'canvassing', 'advertisement', 'other'
  appointmentDate: null,
  salesRep: '',
  
  // Quote and project details
  quoteAmount: 0,
  projectDetails: {
    numWindows: 0,
    numDoors: 0,
    projectType: '', // 'windows', 'doors', 'both', 'other'
    urgency: '', // 'immediate', 'within_3_months', 'within_6_months', 'future'
  },
  
  // Decision making process
  decisionMaking: {
    allOwnersPresent: false,
    decisionMaker: '', // 'primary', 'spouse', 'both', 'other'
    influencers: [], // Array of influencer types
    timeline: '', // 'immediate', 'researching', 'comparing', 'waiting'
  },
  
  // Sales outcome and reasoning
  salesOutcome: {
    status: 'prospect', // 'prospect', 'qualified', 'quoted', 'won', 'lost', 'nurture'
    willPurchaseFuture: 0, // 1-5 scale
    reasonNoSale: {
      raw: '', // Original text
      category: '', // Categorized reason
      subcategory: '', // More specific reason
      followUpAction: '', // Recommended action
      priority: '' // 'high', 'medium', 'low' for follow-up
    }
  },
  
  // Communication preferences
  communication: {
    emailOptOut: false,
    phoneOptOut: false,
    preferredContact: '', // 'email', 'phone', 'text', 'mail'
    bestTimeToCall: '', // 'morning', 'afternoon', 'evening', 'weekends'
    timezone: ''
  },
  
  // Engagement tracking
  engagement: {
    lastContacted: null,
    totalTouchpoints: 0,
    campaignId: '',
    tags: [],
    notes: ''
  },
  
  // System fields
  userId: '',
  createdAt: null,
  updatedAt: null,
  version: 2 // Schema version for future migrations
};

// Reason No Sale categorization mapping
export const REASON_NO_SALE_CATEGORIES = {
  // Price-related objections
  'price': {
    keywords: ['expensive', 'cost', 'price', 'money', 'budget', 'afford', 'cheap', 'cheaper'],
    subcategories: {
      'too_expensive': ['too expensive', 'too much', 'too high', 'over budget'],
      'comparing_prices': ['shopping around', 'getting quotes', 'comparing', 'other estimates'],
      'budget_constraints': ['budget', 'afford', 'financial', 'cash flow'],
      'value_concern': ['not worth it', 'overpriced', 'better deal']
    },
    followUpAction: 'Provide financing options, value proposition, or competitive analysis',
    priority: 'high'
  },
  
  // Timing issues
  'timing': {
    keywords: ['time', 'timing', 'later', 'future', 'busy', 'schedule', 'rush', 'hurry'],
    subcategories: {
      'not_ready': ['not ready', 'too soon', 'thinking about it'],
      'busy_schedule': ['too busy', 'no time', 'hectic', 'schedule'],
      'seasonal': ['winter', 'summer', 'holiday', 'weather'],
      'life_events': ['moving', 'job', 'family', 'health']
    },
    followUpAction: 'Schedule follow-up, add to nurture campaign',
    priority: 'medium'
  },
  
  // Decision making process
  'decision_process': {
    keywords: ['decide', 'decision', 'think', 'discuss', 'spouse', 'family', 'partner'],
    subcategories: {
      'need_to_discuss': ['discuss with spouse', 'talk to family', 'consult'],
      'need_more_info': ['research', 'information', 'details', 'specs'],
      'decision_maker_absent': ['spouse not here', 'need both', 'partner'],
      'comparison_shopping': ['other companies', 'competitors', 'alternatives']
    },
    followUpAction: 'Provide educational materials, schedule couple consultation',
    priority: 'high'
  },
  
  // Product/service concerns
  'product_service': {
    keywords: ['quality', 'warranty', 'installation', 'service', 'company', 'experience'],
    subcategories: {
      'quality_concerns': ['quality', 'durability', 'materials', 'workmanship'],
      'warranty_issues': ['warranty', 'guarantee', 'coverage'],
      'installation_concerns': ['installation', 'disruption', 'mess', 'time'],
      'company_reputation': ['new company', 'reviews', 'references', 'experience']
    },
    followUpAction: 'Provide references, warranty details, installation process info',
    priority: 'high'
  },
  
  // External factors
  'external_factors': {
    keywords: ['hoa', 'landlord', 'permit', 'approval', 'regulation', 'code'],
    subcategories: {
      'regulatory': ['permit', 'hoa', 'approval', 'code', 'regulation'],
      'property_status': ['renting', 'landlord', 'selling', 'temporary'],
      'other_priorities': ['other projects', 'renovations', 'repairs'],
      'market_conditions': ['economy', 'market', 'uncertainty']
    },
    followUpAction: 'Assist with regulatory requirements, adjust timeline',
    priority: 'medium'
  },
  
  // No interest/need
  'no_interest': {
    keywords: ['not interested', 'satisfied', 'fine', 'good enough', 'no need'],
    subcategories: {
      'satisfied_current': ['satisfied', 'fine', 'good enough', 'recent replacement'],
      'different_priorities': ['other priorities', 'not important', 'low priority'],
      'no_perceived_need': ['no need', 'unnecessary', 'working fine'],
      'bad_experience': ['bad experience', 'previous issues', 'burned before']
    },
    followUpAction: 'Long-term nurture campaign, education on benefits',
    priority: 'low'
  }
};

// Parse and categorize reason no sale text
export function categorizeReasonNoSale(reasonText) {
  if (!reasonText || typeof reasonText !== 'string') {
    return {
      raw: reasonText || '',
      category: 'uncategorized',
      subcategory: '',
      followUpAction: 'Contact for more information',
      priority: 'medium'
    };
  }

  const lowerText = reasonText.toLowerCase().trim();
  
  // Find matching category
  for (const [category, config] of Object.entries(REASON_NO_SALE_CATEGORIES)) {
    const hasKeyword = config.keywords.some(keyword => lowerText.includes(keyword));
    
    if (hasKeyword) {
      // Find subcategory
      let subcategory = '';
      for (const [subcat, phrases] of Object.entries(config.subcategories)) {
        if (phrases.some(phrase => lowerText.includes(phrase))) {
          subcategory = subcat;
          break;
        }
      }
      
      return {
        raw: reasonText,
        category,
        subcategory: subcategory || 'general',
        followUpAction: config.followUpAction,
        priority: config.priority
      };
    }
  }
  
  return {
    raw: reasonText,
    category: 'uncategorized',
    subcategory: '',
    followUpAction: 'Review and categorize manually',
    priority: 'medium'
  };
}

// Migrate a single contact to v2 schema
export function migrateContactToV2(legacyContact) {
  const reasonNoSale = categorizeReasonNoSale(legacyContact.reasonNoSale);
  
  return {
    // Core contact info
    firstName: legacyContact.firstName || '',
    lastName: legacyContact.lastName || '',
    email: legacyContact.email || '',
    mobilePhone: legacyContact.mobilePhone || '',
    homePhone: legacyContact.homePhone || '',
    address: {
      street: legacyContact.address || '',
      city: legacyContact.city || '',
      state: legacyContact.state || '',
      zip: legacyContact.zip || '',
      area: legacyContact.area || legacyContact.zip || ''
    },
    
    // Lead details
    leadSource: legacyContact.leadSource || 'unknown',
    appointmentDate: legacyContact.appointmentDate || null,
    salesRep: legacyContact.salesRep || '',
    
    // Quote and project
    quoteAmount: legacyContact.quoteAmount || 0,
    projectDetails: {
      numWindows: legacyContact.numWindows || 0,
      numDoors: legacyContact.numDoors || 0,
      projectType: inferProjectType(legacyContact.numWindows, legacyContact.numDoors),
      urgency: inferUrgency(legacyContact.willPurchaseFuture)
    },
    
    // Decision making
    decisionMaking: {
      allOwnersPresent: legacyContact.allOwnersPresent || false,
      decisionMaker: legacyContact.allOwnersPresent ? 'both' : 'unknown',
      influencers: [],
      timeline: inferTimeline(legacyContact.willPurchaseFuture, reasonNoSale.category)
    },
    
    // Sales outcome
    salesOutcome: {
      status: legacyContact.status || 'prospect',
      willPurchaseFuture: legacyContact.willPurchaseFuture || 0,
      reasonNoSale
    },
    
    // Communication
    communication: {
      emailOptOut: legacyContact.emailOptOut || legacyContact.unsubscribed || false,
      phoneOptOut: legacyContact.phoneOptOut || legacyContact.doNotCall || false,
      preferredContact: inferPreferredContact(legacyContact),
      bestTimeToCall: '',
      timezone: ''
    },
    
    // Engagement
    engagement: {
      lastContacted: legacyContact.lastContacted || null,
      totalTouchpoints: 0,
      campaignId: legacyContact.campaignId || '',
      tags: legacyContact.tags || [],
      notes: legacyContact.notes || ''
    },
    
    // System fields
    userId: legacyContact.userId,
    createdAt: legacyContact.createdAt || new Date(),
    updatedAt: new Date(),
    version: 2
  };
}

// Helper functions for migration
function inferProjectType(numWindows, numDoors) {
  const windows = Number(numWindows) || 0;
  const doors = Number(numDoors) || 0;
  
  if (windows > 0 && doors > 0) return 'both';
  if (windows > 0) return 'windows';
  if (doors > 0) return 'doors';
  return 'unknown';
}

function inferUrgency(willPurchaseFuture) {
  const score = Number(willPurchaseFuture) || 0;
  if (score >= 4) return 'immediate';
  if (score >= 3) return 'within_3_months';
  if (score >= 2) return 'within_6_months';
  return 'future';
}

function inferTimeline(willPurchaseFuture, reasonCategory) {
  if (reasonCategory === 'timing') return 'waiting';
  if (reasonCategory === 'decision_process') return 'researching';
  if (reasonCategory === 'price') return 'comparing';
  
  const score = Number(willPurchaseFuture) || 0;
  if (score >= 4) return 'immediate';
  return 'researching';
}

function inferPreferredContact(contact) {
  if (contact.emailOptOut && !contact.phoneOptOut) return 'phone';
  if (!contact.emailOptOut && contact.phoneOptOut) return 'email';
  if (contact.email && contact.mobilePhone) return 'email'; // Default to email if both available
  if (contact.email) return 'email';
  if (contact.mobilePhone || contact.homePhone) return 'phone';
  return 'unknown';
}

// Batch migrate contacts for a user
export async function migrateUserContactsToV2(userId, batchSize = 50) {
  const contactsQuery = query(
    collection(db, 'contacts'),
    where('userId', '==', userId)
  );
  
  const snapshot = await getDocs(contactsQuery);
  const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter contacts that need migration (don't have version 2)
  const contactsToMigrate = contacts.filter(c => c.version !== 2);
  
  if (contactsToMigrate.length === 0) {
    return { migrated: 0, total: contacts.length, message: 'All contacts already migrated' };
  }
  
  const batches = [];
  for (let i = 0; i < contactsToMigrate.length; i += batchSize) {
    batches.push(contactsToMigrate.slice(i, i + batchSize));
  }
  
  let migratedCount = 0;
  
  for (const batch of batches) {
    const writeBatchObj = writeBatch(db);
    
    for (const contact of batch) {
      const migratedData = migrateContactToV2(contact);
      const contactRef = doc(db, 'contacts', contact.id);
      writeBatchObj.update(contactRef, migratedData);
    }
    
    await writeBatchObj.commit();
    migratedCount += batch.length;
  }
  
  return {
    migrated: migratedCount,
    total: contacts.length,
    message: `Successfully migrated ${migratedCount} contacts to v2 schema`
  };
}

// Get migration statistics for a user
export async function getMigrationStats(userId) {
  const contactsQuery = query(
    collection(db, 'contacts'),
    where('userId', '==', userId)
  );
  
  const snapshot = await getDocs(contactsQuery);
  const contacts = snapshot.docs.map(doc => doc.data());
  
  const stats = {
    total: contacts.length,
    v1: contacts.filter(c => c.version !== 2).length,
    v2: contacts.filter(c => c.version === 2).length,
    reasonCategories: {},
    priorityDistribution: { high: 0, medium: 0, low: 0 }
  };
  
  // Analyze reason no sale categories
  const v2Contacts = contacts.filter(c => c.version === 2);
  for (const contact of v2Contacts) {
    const category = contact.salesOutcome?.reasonNoSale?.category;
    const priority = contact.salesOutcome?.reasonNoSale?.priority;
    
    if (category) {
      stats.reasonCategories[category] = (stats.reasonCategories[category] || 0) + 1;
    }
    
    if (priority) {
      stats.priorityDistribution[priority]++;
    }
  }
  
  return stats;
}

// Get contacts by reason category for targeted follow-up
export async function getContactsByReasonCategory(userId, category, priority = null) {
  const contactsQuery = query(
    collection(db, 'contacts'),
    where('userId', '==', userId)
  );
  
  const snapshot = await getDocs(contactsQuery);
  const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  return contacts.filter(contact => {
    if (contact.version !== 2) return false;
    
    const reasonData = contact.salesOutcome?.reasonNoSale;
    if (!reasonData) return false;
    
    const matchesCategory = reasonData.category === category;
    const matchesPriority = priority ? reasonData.priority === priority : true;
    
    return matchesCategory && matchesPriority;
  });
}
