// Advanced AI Campaign Recommendation Engine
// Intelligent contact analysis and campaign suggestions based on multiple data points

import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';

// Campaign purposes with intelligent triggers
export const CAMPAIGN_PURPOSES = {
  'Initial Follow-Up After Appointment': {
    priority: 10, // Highest priority
    triggers: ['appointmentDate'],
    timeWindow: { min: 1, max: 7 }, // 1-7 days after appointment
    description: 'Critical follow-up within a week of appointment'
  },
  'First 6 Months Follow-Up': {
    priority: 9,
    triggers: ['appointmentDate'],
    timeWindow: { min: 30, max: 180 }, // 30-180 days after appointment
    description: 'Nurture relationship in first 6 months'
  },
  'Keep in Touch': {
    priority: 8,
    triggers: ['lastContact', 'heatScore'],
    timeWindow: { min: 30, max: 90 }, // 30-90 days since last contact
    heatScoreRange: { min: 15, max: 100 },
    description: 'Maintain engagement with warm/hot leads'
  },
  'Cold Lead - Spark Interest': {
    priority: 7,
    triggers: ['appointmentDate', 'heatScore', 'lastEngagement'],
    timeWindow: { min: 365, max: 9999 }, // 1+ years since appointment OR low engagement
    heatScoreRange: { min: 0, max: 10 },
    description: 'Reactivate old or cold contacts'
  },
  'Win-Back Campaign': {
    priority: 6,
    triggers: ['lastEngagement', 'heatScore'],
    timeWindow: { min: 180, max: 365 }, // 6 months to 1 year no engagement
    heatScoreRange: { min: 0, max: 5 },
    description: 'Re-engage contacts who went cold'
  },
  'Promotion/Special Offer': {
    priority: 5,
    triggers: ['heatScore', 'status'],
    heatScoreRange: { min: 10, max: 100 },
    statusTypes: ['prospect', 'lead', 'customer'],
    description: 'Targeted promotions for engaged contacts'
  },
  'New Product/Technology': {
    priority: 4,
    triggers: ['heatScore', 'company'],
    heatScoreRange: { min: 5, max: 100 },
    description: 'Product announcements to interested contacts'
  },
  'Referral Request': {
    priority: 3,
    triggers: ['status', 'heatScore'],
    statusTypes: ['customer', 'closed-won'],
    heatScoreRange: { min: 20, max: 100 },
    description: 'Ask happy customers for referrals'
  },
  'Educational Content': {
    priority: 2,
    triggers: ['heatScore', 'lastEngagement'],
    heatScoreRange: { min: 5, max: 100 },
    description: 'Provide value through educational content'
  },
  'Seasonal Outreach': {
    priority: 1,
    triggers: ['date'],
    description: 'Holiday and seasonal campaigns'
  }
};

// User daily limits (from settings or defaults)
export const DEFAULT_DAILY_LIMITS = {
  FREE: { maxCampaignsPerDay: 2, maxContactsPerCampaign: 10 },
  BASIC: { maxCampaignsPerDay: 5, maxContactsPerCampaign: 25 },
  PRO: { maxCampaignsPerDay: 10, maxContactsPerCampaign: 50 },
  ENTERPRISE: { maxCampaignsPerDay: 20, maxContactsPerCampaign: 100 }
};

/**
 * Advanced AI Campaign Recommendation Engine
 * Analyzes contacts across multiple dimensions to suggest optimal campaigns
 */
export class AICampaignRecommender {
  constructor(userSettings = {}) {
    this.userTier = userSettings.tier || 'BASIC';
    this.dailyLimits = userSettings.dailyLimits || DEFAULT_DAILY_LIMITS[this.userTier];
    this.currentDate = new Date();
  }

  /**
   * Generate intelligent campaign recommendations
   */
  async generateRecommendations(userId) {
    console.log('🤖 AI Campaign Recommender starting analysis...');
    
    // Load all data
    const contacts = await this.loadContacts(userId);
    const existingEnrollments = await this.loadActiveEnrollments(userId);
    const userSettings = await this.loadUserSettings(userId);
    
    console.log(`📊 Analyzing ${contacts.length} contacts for recommendations...`);
    
    // Analyze each contact across multiple dimensions
    const contactAnalysis = contacts.map(contact => this.analyzeContact(contact));
    
    // Generate recommendations based on analysis
    const recommendations = this.generateRecommendationMatrix(contactAnalysis, existingEnrollments);
    
    // Apply business rules and prioritization
    const prioritizedRecommendations = this.applyBusinessRules(recommendations);
    
    // Respect daily limits and user settings
    const finalRecommendations = this.applyDailyLimits(prioritizedRecommendations);
    
    console.log(`🎯 Generated ${finalRecommendations.length} intelligent recommendations`);
    return finalRecommendations;
  }

  /**
   * Analyze a single contact across multiple dimensions
   */
  analyzeContact(contact) {
    const analysis = {
      contact,
      scores: {},
      triggers: [],
      suggestedCampaigns: []
    };

    // Time-based analysis
    analysis.daysSinceAppointment = this.getDaysSince(contact.appointmentDate);
    analysis.daysSinceLastContact = this.getDaysSince(contact.lastContact);
    analysis.daysSinceLastEngagement = this.getDaysSince(contact.lastEngagement);
    analysis.daysSinceCreated = this.getDaysSince(contact.createdAt);

    // Heat score analysis
    analysis.heatScore = contact.heatScore || 0;
    analysis.heatCategory = this.getHeatCategory(analysis.heatScore);

    // Status analysis
    analysis.status = contact.status || 'prospect';
    analysis.isCustomer = ['customer', 'closed-won'].includes(analysis.status);

    // Engagement analysis
    analysis.hasRecentEngagement = analysis.daysSinceLastEngagement < 30;
    analysis.isStaleContact = analysis.daysSinceLastContact > 90;
    analysis.isAgedContact = analysis.daysSinceCreated > 365;

    // Generate campaign suggestions for this contact
    this.evaluateCampaignOpportunities(analysis);

    return analysis;
  }

  /**
   * Evaluate all campaign opportunities for a contact
   */
  evaluateCampaignOpportunities(analysis) {
    const { contact } = analysis;

    // 1. APPOINTMENT-BASED CAMPAIGNS (Highest Priority)
    if (contact.appointmentDate) {
      console.log(`📅 Contact ${contact.firstName} ${contact.lastName} has appointment date:`, 
        contact.appointmentDate, `(${analysis.daysSinceAppointment} days ago)`);
      
      if (analysis.daysSinceAppointment >= 1 && analysis.daysSinceAppointment <= 7) {
        console.log(`✅ Triggering "Initial Follow-Up After Appointment" for ${contact.firstName} ${contact.lastName}`);
        analysis.suggestedCampaigns.push({
          purpose: 'Initial Follow-Up After Appointment',
          priority: 10,
          reason: `${analysis.daysSinceAppointment} days since appointment - critical follow-up window`,
          urgency: 'HIGH',
          timing: 'IMMEDIATE'
        });
      }
      
      if (analysis.daysSinceAppointment >= 30 && analysis.daysSinceAppointment <= 180) {
        console.log(`✅ Triggering "First 6 Months Follow-Up" for ${contact.firstName} ${contact.lastName}`);
        analysis.suggestedCampaigns.push({
          purpose: 'First 6 Months Follow-Up',
          priority: 9,
          reason: `${analysis.daysSinceAppointment} days since appointment - nurture period`,
          urgency: 'MEDIUM',
          timing: 'THIS_WEEK'
        });
      }
      
      if (analysis.daysSinceAppointment >= 365) {
        console.log(`✅ Triggering "Cold Lead - Spark Interest" for ${contact.firstName} ${contact.lastName}`);
        analysis.suggestedCampaigns.push({
          purpose: 'Cold Lead - Spark Interest',
          priority: 7,
          reason: `${Math.floor(analysis.daysSinceAppointment / 365)} year(s) since appointment - reactivation needed`,
          urgency: 'LOW',
          timing: 'THIS_MONTH'
        });
      }
    } else {
      console.log(`❌ Contact ${contact.firstName} ${contact.lastName} has no appointment date - skipping appointment-based campaigns`);
    }

    // 2. HEAT SCORE BASED CAMPAIGNS
    if (analysis.heatScore >= 20) {
      // Hot leads - keep engaged
      if (analysis.daysSinceLastContact > 14) {
        analysis.suggestedCampaigns.push({
          purpose: 'Keep in Touch',
          priority: 8,
          reason: `Hot lead (${analysis.heatScore}) needs regular contact`,
          urgency: 'HIGH',
          timing: 'THIS_WEEK'
        });
      }
    } else if (analysis.heatScore >= 10) {
      // Warm leads - nurture
      if (analysis.daysSinceLastContact > 30) {
        analysis.suggestedCampaigns.push({
          purpose: 'Keep in Touch',
          priority: 6,
          reason: `Warm lead (${analysis.heatScore}) needs nurturing`,
          urgency: 'MEDIUM',
          timing: 'THIS_WEEK'
        });
      }
    } else {
      // Cold leads - reactivate
      if (analysis.daysSinceLastEngagement > 180) {
        analysis.suggestedCampaigns.push({
          purpose: 'Win-Back Campaign',
          priority: 5,
          reason: `Cold lead (${analysis.heatScore}) - ${Math.floor(analysis.daysSinceLastEngagement / 30)} months no engagement`,
          urgency: 'LOW',
          timing: 'THIS_MONTH'
        });
      }
    }

    // 3. CUSTOMER-SPECIFIC CAMPAIGNS
    if (analysis.isCustomer && analysis.heatScore >= 20) {
      analysis.suggestedCampaigns.push({
        purpose: 'Referral Request',
        priority: 8,
        reason: 'Happy customer - excellent referral opportunity',
        urgency: 'MEDIUM',
        timing: 'THIS_WEEK'
      });
    }

    // 4. PROMOTIONAL CAMPAIGNS
    if (analysis.heatScore >= 10 && analysis.hasRecentEngagement) {
      analysis.suggestedCampaigns.push({
        purpose: 'Promotion/Special Offer',
        priority: 5,
        reason: `Engaged contact (${analysis.heatScore}) - promotion ready`,
        urgency: 'MEDIUM',
        timing: 'THIS_MONTH'
      });
    }

    // 5. EDUCATIONAL CONTENT
    if (analysis.heatScore >= 5) {
      analysis.suggestedCampaigns.push({
        purpose: 'Educational Content',
        priority: 3,
        reason: 'Interested contact - provide value through education',
        urgency: 'LOW',
        timing: 'THIS_MONTH'
      });
    }
  }

  /**
   * Generate recommendation matrix grouped by campaign purpose
   */
  generateRecommendationMatrix(contactAnalyses, existingEnrollments) {
    const recommendations = {};
    const enrollmentMap = new Set(existingEnrollments.map(e => `${e.contactId}-${e.campaignId}`));

    // Group suggestions by campaign purpose
    contactAnalyses.forEach(analysis => {
      analysis.suggestedCampaigns.forEach(suggestion => {
        const { purpose } = suggestion;
        
        if (!recommendations[purpose]) {
          recommendations[purpose] = {
            purpose,
            priority: suggestion.priority,
            contacts: [],
            totalScore: 0,
            averageUrgency: 0,
            recommendedTiming: suggestion.timing
          };
        }

        // Add contact to this campaign recommendation
        recommendations[purpose].contacts.push({
          ...analysis.contact,
          reason: suggestion.reason,
          urgency: suggestion.urgency,
          score: this.calculateContactScore(analysis, suggestion)
        });

        recommendations[purpose].totalScore += analysis.heatScore;
      });
    });

    return Object.values(recommendations);
  }

  /**
   * Apply business rules and constraints
   */
  applyBusinessRules(recommendations) {
    return recommendations
      .filter(rec => rec.contacts.length > 0)
      .map(rec => {
        // Sort contacts by score within each campaign
        rec.contacts.sort((a, b) => b.score - a.score);
        
        // Limit contacts per campaign based on user tier
        rec.contacts = rec.contacts.slice(0, this.dailyLimits.maxContactsPerCampaign);
        
        // Calculate campaign value score
        rec.valueScore = this.calculateCampaignValue(rec);
        
        return rec;
      })
      .sort((a, b) => b.priority - a.priority || b.valueScore - a.valueScore);
  }

  /**
   * Apply daily limits
   */
  applyDailyLimits(recommendations) {
    return recommendations.slice(0, this.dailyLimits.maxCampaignsPerDay);
  }

  /**
   * Calculate individual contact score for prioritization
   */
  calculateContactScore(analysis, suggestion) {
    let score = 0;
    
    // Base heat score
    score += analysis.heatScore;
    
    // Urgency multiplier
    const urgencyMultiplier = {
      'HIGH': 3,
      'MEDIUM': 2,
      'LOW': 1
    };
    score *= urgencyMultiplier[suggestion.urgency] || 1;
    
    // Time-sensitive bonus
    if (suggestion.timing === 'IMMEDIATE') score += 50;
    if (suggestion.timing === 'THIS_WEEK') score += 25;
    
    // Customer bonus
    if (analysis.isCustomer) score += 20;
    
    // Recent engagement bonus
    if (analysis.hasRecentEngagement) score += 15;
    
    return score;
  }

  /**
   * Calculate overall campaign value
   */
  calculateCampaignValue(recommendation) {
    const avgScore = recommendation.totalScore / recommendation.contacts.length;
    const contactCount = recommendation.contacts.length;
    const priorityWeight = recommendation.priority * 10;
    
    return avgScore + contactCount + priorityWeight;
  }

  // Helper methods
  getDaysSince(date) {
    if (!date) return 9999;
    
    let dateObj;
    if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date.toDate === 'function') {
      // Firestore Timestamp object
      dateObj = date.toDate();
    } else if (date && date.seconds) {
      // Firestore Timestamp-like object with seconds
      dateObj = new Date(date.seconds * 1000);
    } else {
      // Try to parse as regular date string/number
      dateObj = new Date(date);
    }
    
    // Validate the date
    if (isNaN(dateObj.getTime())) {
      console.warn('Invalid date provided to getDaysSince:', date);
      return 9999;
    }
    
    return Math.floor((this.currentDate - dateObj) / (1000 * 60 * 60 * 24));
  }

  getHeatCategory(score) {
    if (score >= 20) return 'Hot';
    if (score >= 10) return 'Warm';
    if (score >= 5) return 'Cold';
    return 'Inactive';
  }

  async loadContacts(userId) {
    const contactsQuery = query(
      collection(db, 'contacts'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(contactsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async loadActiveEnrollments(userId) {
    const enrollmentsQuery = query(
      collection(db, 'campaignEnrollments'),
      where('userId', '==', userId),
      where('status', 'in', ['active', 'pending'])
    );
    const snapshot = await getDocs(enrollmentsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async loadUserSettings(userId) {
    // Implementation for loading user settings
    return { tier: 'BASIC' };
  }
}

/**
 * Main function to generate smart recommendations
 */
export async function generateSmartRecommendations(userId, userSettings = {}) {
  const recommender = new AICampaignRecommender(userSettings);
  return await recommender.generateRecommendations(userId);
}
