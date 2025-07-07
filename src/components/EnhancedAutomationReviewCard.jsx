import React, { useState, useEffect } from 'react';
import { cardStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';
import { db, auth } from '../services/firebase';
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import {
  getPendingTasks,
  getUserTasks,
  approveTask,
  rejectTask,
  batchApproveReject,
  getTaskStats,
  formatTaskPriority,
  formatTaskType,
  isTaskOverdue,
  TASK_STATUSES,
  TASK_PRIORITIES,
  createSampleTasks,
  AUTOMATION_TASK_TYPES
} from '../services/automationReview';
import {
  analyzeCampaignOpportunities,
  createCampaignEnrollmentTask,
  executeAutomatedEnrollment,
  generateAutomatedRecommendations,
  CAMPAIGN_CATEGORIES
} from '../services/campaignAutomation';
import {
  getSmartAutomationRecommendations,
  getAutomationQuota,
  createQuotaValidatedTask,
  assessOAuthImpact,
  USER_TIERS
} from '../services/smartAutomation';
import { generateSmartRecommendations } from '../services/aiCampaignRecommender';

function EnhancedAutomationReviewCard() {
  const [activeTab, setActiveTab] = useState('opportunities');
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [expandedTask, setExpandedTask] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // New state for campaign recommendations
  const [recommendations, setRecommendations] = useState([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [lastRecommendationDate, setLastRecommendationDate] = useState(null);
  
  // Enrollment modal state
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [availableCampaigns, setAvailableCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [delayDays, setDelayDays] = useState(0);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  // Quota and limits state
  const [quota, setQuota] = useState(null);
  const [quotaMessage, setQuotaMessage] = useState('');
  const [showQuotaDetails, setShowQuotaDetails] = useState(false);

  useEffect(() => {
    console.log('🔄 [AutomationReview] useEffect triggered, activeTab:', activeTab);
    // Load recommendations automatically once per day on first load
    checkAndLoadDailyRecommendations();
    loadData();
  }, [activeTab]);

  const checkAndLoadDailyRecommendations = async () => {
    const today = new Date().toDateString();
    const lastGenerated = localStorage.getItem('lastRecommendationDate');
    
    console.log('📅 [checkAndLoadDailyRecommendations] Today:', today);
    console.log('📅 [checkAndLoadDailyRecommendations] Last generated:', lastGenerated);
    
    // Auto-generate recommendations if it's a new day
    if (lastGenerated !== today) {
      console.log('📅 New day detected, auto-generating recommendations...');
      await loadRecommendations(true); // true = auto-generation
      localStorage.setItem('lastRecommendationDate', today);
    } else {
      // Load cached recommendations if available
      const cachedRecommendations = localStorage.getItem('dailyRecommendations');
      console.log('💾 [checkAndLoadDailyRecommendations] Cached recommendations found:', !!cachedRecommendations);
      if (cachedRecommendations) {
        try {
          const parsed = JSON.parse(cachedRecommendations);
          console.log('📊 [checkAndLoadDailyRecommendations] Loading', parsed.length, 'cached recommendations');
          setRecommendations(parsed);
        } catch (e) {
          console.error('❌ [checkAndLoadDailyRecommendations] Error parsing cached recommendations:', e);
        }
      }
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      // Load tasks based on active tab
      let taskData;
      if (activeTab === 'pending') {
        taskData = await getPendingTasks(user.uid);
      } else if (activeTab === 'opportunities') {
        // Campaign opportunities tab - only load recommendations, not tasks
        setLoading(false);
        return;
      } else {
        taskData = await getUserTasks(user.uid, activeTab === 'all' ? null : activeTab);
      }
      setTasks(taskData);

      // Load stats
      const statsData = await getTaskStats(user.uid);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading automation tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async (isAutoGeneration = false) => {
    setLoadingRecommendations(true);
    try {
      // Get current user from both Firebase auth and localStorage
      const localUser = JSON.parse(localStorage.getItem('user'));
      const firebaseUser = auth.currentUser;
      
      console.log('👤 [loadRecommendations] Local user:', localUser?.uid);
      console.log('🔥 [loadRecommendations] Firebase user:', firebaseUser?.uid);
      console.log('🔄 [loadRecommendations] Auto-generation:', isAutoGeneration);
      
      // Use Firebase auth user if available, fallback to localStorage
      const user = firebaseUser || localUser;
      if (!user?.uid) {
        console.log('❌ No user found for recommendations');
        return;
      }

      console.log('🔍 Loading recommendations for user:', user.uid);

      // Get contacts with heat scores
      console.log('📞 Querying contacts...');
      const contactsQuery = query(
        collection(db, 'contacts'),
        where('userId', '==', user.uid)
      );
      const contactsSnapshot = await getDocs(contactsQuery);
      console.log(`✅ Found ${contactsSnapshot.size} contacts`);
      
      // Get active campaigns  
      console.log('📧 Querying campaigns...');
      const campaignsQuery = query(
        collection(db, 'campaigns'),
        where('userId', '==', user.uid),
        where('status', '==', 'active')
      );
      const campaignsSnapshot = await getDocs(campaignsQuery);
      console.log(`✅ Found ${campaignsSnapshot.size} active campaigns`);
      
      // Get existing enrollments
      console.log('🔗 Querying enrollments...');
      const enrollmentsQuery = query(
        collection(db, 'campaignEnrollments'),
        where('userId', '==', user.uid),
        where('status', 'in', ['active', 'pending'])
      );
      const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
      console.log(`✅ Found ${enrollmentsSnapshot.size} active enrollments`);

      // Process data
      const contacts = contactsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        heatScore: doc.data().heatScore || 0 
      }));
      
      const campaigns = campaignsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      const enrollmentSet = new Set();
      enrollmentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        enrollmentSet.add(`${data.contactId}-${data.campaignId}`);
      });

      console.log(`📊 Data loaded: ${contacts.length} contacts, ${campaigns.length} campaigns, ${enrollmentsSnapshot.size} enrollments`);

      // Debug contact heat scores
      const contactsWithHeat = contacts.filter(c => c.heatScore > 0);
      console.log(`🔥 Contacts with heat scores: ${contactsWithHeat.length}`);
      contactsWithHeat.forEach(contact => {
        console.log(`- ${contact.firstName} ${contact.lastName}: ${contact.heatScore}`);
      });

      // Debug campaigns
      console.log(`📧 Active campaigns: ${campaigns.length}`);
      campaigns.forEach(campaign => {
        console.log(`- ${campaign.name} (${campaign.purpose || 'No purpose'})`);
      });

      // Generate simple recommendations
      const recommendations = [];
      
      // Categorize contacts by heat score
      const hotContacts = contacts.filter(c => c.heatScore >= 70);
      // Use AI Campaign Recommendation Engine
      console.log('🤖 Generating AI-powered recommendations...');
      
      // Get user settings for personalized recommendations
      const userSettings = {
        tier: 'BASIC', // TODO: Get from user settings
        dailyLimits: {
          maxCampaignsPerDay: 5,
          maxContactsPerCampaign: 25
        }
      };
      
      // Generate intelligent recommendations
      const aiRecommendations = await generateSmartRecommendations(user.uid, userSettings);
      
      console.log(`🎯 AI generated ${aiRecommendations.length} intelligent recommendations`);
      
      // Log each recommendation for debugging
      aiRecommendations.forEach((rec, index) => {
        console.log(`📋 Recommendation ${index + 1}: ${rec.purpose}`);
        console.log(`   Priority: ${rec.priority}, Contacts: ${rec.contacts.length}`);
        console.log(`   Timing: ${rec.recommendedTiming}, Value Score: ${rec.valueScore}`);
        rec.contacts.slice(0, 3).forEach(contact => {
          console.log(`   - ${contact.name || contact.firstName + ' ' + contact.lastName}: ${contact.reason}`);
        });
      });
      
      // Convert AI recommendations to UI format
      const formattedRecommendations = aiRecommendations.map(rec => ({
        id: `ai-${rec.purpose.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        category: rec.purpose.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        purpose: rec.purpose,
        priority: rec.priority >= 8 ? 'high' : rec.priority >= 5 ? 'medium' : 'low',
        urgency: rec.recommendedTiming,
        contacts: rec.contacts,
        reasoning: `${rec.contacts.length} contacts identified for ${rec.purpose}. ${rec.contacts[0]?.reason || 'Intelligent analysis suggests high conversion potential.'}`,
        valueScore: rec.valueScore,
        createdAt: new Date(),
        aiGenerated: true
      }));

      console.log(`🎯 Generated ${formattedRecommendations.length} total AI recommendations`);
      
      // Apply different algorithms based on generation type
      let finalRecommendations;
      if (isAutoGeneration) {
        // Auto-generation: Use priority-based algorithm (highest priority first)
        finalRecommendations = formattedRecommendations
          .sort((a, b) => b.priority - a.priority)
          .slice(0, 10); // Limit to top 10
      } else {
        // Manual refresh: Use variety algorithm (mix different types)
        finalRecommendations = diversifyRecommendations(formattedRecommendations);
      }
      
      setRecommendations(finalRecommendations);
      
      // Cache recommendations for the day
      if (isAutoGeneration) {
        localStorage.setItem('dailyRecommendations', JSON.stringify(finalRecommendations));
      }
      
      // Simple quota info
      setQuota({
        userTier: { name: 'Standard' },
        canCreateMoreTasks: true,
        remainingTasks: 10,
        emailCapacityUsed: 30
      });
      
      if (formattedRecommendations.length === 0) {
        if (contactsWithHeat.length === 0) {
          setQuotaMessage('🤖 AI Analysis: No contacts with engagement data found. Start sending emails with tracking to build intelligent recommendations.');
        } else {
          setQuotaMessage('🤖 AI Analysis: All contacts are optimally managed. No new campaign opportunities detected at this time.');
        }
      } else {
        setQuotaMessage(`🤖 AI generated ${formattedRecommendations.length} intelligent campaign recommendations based on contact analysis.`);
      }
      
    } catch (error) {
      console.error('❌ Error loading recommendations:', error);
      
      // Provide specific error messages based on error type
      if (error.code === 'permission-denied') {
        console.error('🚫 Firestore permission denied - check security rules');
        setQuotaMessage('Permission denied. Please check your authentication and try again.');
      } else if (error.code === 'unauthenticated') {
        console.error('🚫 User not authenticated');
        setQuotaMessage('Please log in to view recommendations.');
      } else if (error.message?.includes('Network')) {
        console.error('🌐 Network error');
        setQuotaMessage('Network error. Please check your internet connection.');
      } else {
        console.error('💥 Unknown error:', error.message);
        setQuotaMessage(`Error loading recommendations: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const getStoredRecommendations = async (userId) => {
    try {
      const recommendationsQuery = query(
        collection(db, 'automationRecommendations'),
        where('userId', '==', userId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(recommendationsQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error loading stored recommendations:', error);
      return [];
    }
  };

  const handleGenerateAutomatedTasks = async () => {
    setProcessing(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      const result = await generateAutomatedRecommendations(user.uid);
      
      // Refresh data
      await loadData();
      
      alert(`Generated ${result.createdTasks.length} automated tasks from ${result.summary.totalRecommendations} recommendations`);
    } catch (error) {
      console.error('Error generating automated tasks:', error);
      alert('Error generating automated tasks. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateCustomEnrollmentTask = async () => {
    if (!selectedRecommendation || !selectedCampaign || selectedContacts.size === 0) {
      alert('Please select a campaign and contacts');
      return;
    }

    setProcessing(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      // Create a simple automation task
      const taskData = {
        userId: user.uid,
        type: AUTOMATION_TASK_TYPES.CAMPAIGN_ASSIGNMENT,
        status: TASK_STATUSES.PENDING,
        priority: selectedRecommendation.priority === 'high' ? TASK_PRIORITIES.HIGH : 
                 selectedRecommendation.priority === 'medium' ? TASK_PRIORITIES.MEDIUM : TASK_PRIORITIES.LOW,
        title: `Enroll ${selectedContacts.size} contacts in ${selectedCampaign.name}`,
        description: `${selectedRecommendation.reasoning} - Selected ${selectedContacts.size} contacts for ${selectedCampaign.purpose || 'campaign enrollment'}`,
        executionData: {
          campaignId: selectedCampaign.id,
          contactIds: Array.from(selectedContacts),
          category: selectedRecommendation.category
        },
        estimatedImpact: {
          contactsAffected: selectedContacts.size,
          expectedEngagement: getExpectedEngagement(selectedRecommendation.category),
          estimatedEmails: selectedContacts.size * 3
        },
        createdAt: new Date()
      };

      // Add task to Firestore
      await addDoc(collection(db, 'automationTasks'), taskData);
      
      // Reset selections
      setSelectedRecommendation(null);
      setSelectedCampaign(null);
      setSelectedContacts(new Set());
      
      // Refresh data
      await loadData();
      
      alert('Enrollment task created successfully!');
    } catch (error) {
      console.error('Error creating enrollment task:', error);
      alert('Error creating enrollment task. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const getExpectedEngagement = (category) => {
    const rates = {
      'HOT_LEAD': '65-75%',
      'WARM_LEAD': '45-55%', 
      'COLD_LEAD': '25-35%',
      'REACTIVATION': '15-25%'
    };
    return rates[category] || '30-40%';
  };

  const generateSampleData = async () => {
    setProcessing(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) {
        alert('No user logged in');
        return;
      }

      // Create sample automation tasks
      const sampleTasks = [
        {
          userId: user.uid,
          type: 'CAMPAIGN_ASSIGNMENT',
          status: 'pending',
          priority: 'high',
          title: 'Enroll Hot Leads in Welcome Campaign',
          description: 'AI identified 12 hot leads (heat score >75) that should be enrolled in the welcome campaign',
          createdAt: new Date(),
          estimatedImpact: {
            contactsAffected: 12,
            expectedEngagement: '68%'
          },
          executionData: {
            campaignId: 'sample-campaign-id',
            contactIds: ['contact1', 'contact2', 'contact3'],
            category: 'HOT_LEAD'
          }
        },
        {
          userId: user.uid,
          type: 'CAMPAIGN_ASSIGNMENT',
          status: 'pending',
          priority: 'medium',
          title: 'Re-engage Warm Prospects',
          description: 'Re-engagement campaign for 8 warm prospects who haven\'t opened emails in 2 weeks',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          estimatedImpact: {
            contactsAffected: 8,
            expectedEngagement: '45%'
          },
          executionData: {
            campaignId: 'reengagement-campaign-id',
            contactIds: ['contact4', 'contact5', 'contact6'],
            category: 'WARM_LEAD'
          }
        }
      ];

      // Add tasks to Firestore
      const batch = db.batch();
      sampleTasks.forEach(task => {
        const taskRef = db.collection('automationTasks').doc();
        batch.set(taskRef, task);
      });
      await batch.commit();

      // Create sample recommendations
      const sampleRecommendations = [
        {
          userId: user.uid,
          category: 'HOT_LEAD',
          priority: 'high',
          reasoning: 'These contacts have opened 3+ emails in the last week and clicked at least one link',
          contacts: [
            { id: 'contact1', firstName: 'John', lastName: 'Doe', heatScore: 85 },
            { id: 'contact2', firstName: 'Jane', lastName: 'Smith', heatScore: 78 },
            { id: 'contact3', firstName: 'Mike', lastName: 'Johnson', heatScore: 92 }
          ],
          suggestedCampaigns: [
            {
              id: 'welcome-series',
              name: 'Welcome Series - Premium',
              purpose: 'Convert hot leads to customers',
              description: 'A 5-email series designed to convert engaged prospects into paying customers'
            }
          ],
          createdAt: new Date(),
          isActive: true
        },
        {
          userId: user.uid,
          category: 'REACTIVATION',
          priority: 'medium',
          reasoning: 'These contacts were previously engaged but haven\'t opened emails in 2+ weeks',
          contacts: [
            { id: 'contact4', firstName: 'Sarah', lastName: 'Wilson', heatScore: 25 },
            { id: 'contact5', firstName: 'Tom', lastName: 'Brown', heatScore: 18 }
          ],
          suggestedCampaigns: [
            {
              id: 'reactivation-series',
              name: 'Win-Back Campaign',
              purpose: 'Re-engage dormant contacts',
              description: 'A 3-email series to re-engage contacts who have become inactive'
            }
          ],
          createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          isActive: true
        }
      ];

      // Add recommendations to Firestore
      const recBatch = db.batch();
      sampleRecommendations.forEach(rec => {
        const recRef = db.collection('automationRecommendations').doc();
        recBatch.set(recRef, rec);
      });
      await recBatch.commit();

      // Refresh data
      await loadData();
      
      alert('Sample automation data generated successfully!');
    } catch (error) {
      console.error('Error generating sample data:', error);
      alert('Error generating sample data. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleTaskSelection = (taskId) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const handleContactSelection = (contactId) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleSingleTaskAction = async (taskId, action) => {
    setProcessing(true);
    try {
      if (action === 'approve') {
        await approveTask(taskId, reviewNotes);
        
        // If it's a campaign enrollment task, execute it
        const task = tasks.find(t => t.id === taskId);
        if (task && task.type === AUTOMATION_TASK_TYPES.CAMPAIGN_ASSIGNMENT) {
          await executeAutomatedEnrollment(taskId, task.executionData);
        }
      } else {
        await rejectTask(taskId, reviewNotes);
      }
      setReviewNotes('');
      setExpandedTask(null);
      await loadData();
    } catch (error) {
      console.error('Error processing task:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchAction = async (action) => {
    if (selectedTasks.size === 0) return;
    
    setProcessing(true);
    try {
      await batchApproveReject(Array.from(selectedTasks), action, reviewNotes);
      
      // Execute approved campaign enrollment tasks
      if (action === 'approve') {
        for (const taskId of selectedTasks) {
          const task = tasks.find(t => t.id === taskId);
          if (task && task.type === AUTOMATION_TASK_TYPES.CAMPAIGN_ASSIGNMENT) {
            try {
              await executeAutomatedEnrollment(taskId, task.executionData);
            } catch (error) {
              console.error(`Error executing task ${taskId}:`, error);
            }
          }
        }
      }
      
      setSelectedTasks(new Set());
      setReviewNotes('');
      await loadData();
    } catch (error) {
      console.error('Error processing batch action:', error);
    } finally {
      setProcessing(false);
    }
  };

  const formatRelativeTime = (date) => {
    const now = new Date();
    const past = date.toDate ? date.toDate() : new Date(date);
    const diffMs = now - past;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  };

  const getStatusColor = (status) => {
    const colors = {
      [TASK_STATUSES.PENDING]: '#f39c12',
      [TASK_STATUSES.APPROVED]: '#27ae60',
      [TASK_STATUSES.REJECTED]: '#e74c3c',
      [TASK_STATUSES.EXECUTED]: '#3498db',
      [TASK_STATUSES.FAILED]: '#8e44ad'
    };
    return colors[status] || '#95a5a6';
  };

  const getCategoryColor = (category) => {
    const colors = {
      [CAMPAIGN_CATEGORIES.HOT_LEAD]: '#e74c3c',
      [CAMPAIGN_CATEGORIES.WARM_LEAD]: '#f39c12',
      [CAMPAIGN_CATEGORIES.COLD_LEAD]: '#3498db',
      [CAMPAIGN_CATEGORIES.CUSTOMER]: '#27ae60',
      [CAMPAIGN_CATEGORIES.REACTIVATION]: '#9b59b6'
    };
    return colors[category] || '#95a5a6';
  };

  const tabs = [
    { id: 'opportunities', label: 'Campaign Opportunities', count: recommendations.length },
    { id: 'approved', label: 'Approved', count: stats?.approved || 0 },
    { id: 'all', label: 'All Tasks', count: stats?.total || 0 }
  ];

  const renderRecommendationDetails = (recommendation) => {
    const isAIGenerated = recommendation.aiGenerated;
    
    return (
      <div style={{ 
        border: `2px solid ${getCategoryColor(recommendation.category)}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        background: isAIGenerated ? '#f8fff8' : '#fafafa'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h4 style={{ 
                margin: 0, 
                color: getCategoryColor(recommendation.category),
                fontSize: 16,
                fontWeight: 600
              }}>
                {recommendation.purpose || recommendation.category}
              </h4>
              {isAIGenerated && (
                <span style={{
                  background: 'linear-gradient(45deg, #4CAF50, #2196F3)',
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 600
                }}>
                  🤖 AI
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0', fontSize: 14, color: '#666' }}>
              {recommendation.reasoning}
            </p>
            {recommendation.urgency && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                📅 Timing: {recommendation.urgency.replace('_', ' ')}
              </div>
            )}
          </div>
          <div style={{
            background: getCategoryColor(recommendation.category),
            color: 'white',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600
          }}>
            {recommendation.priority.toUpperCase()}
          </div>
        </div>

        {/* Contacts Preview */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>
            Contacts ({recommendation.contacts.length}):
          </div>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 8,
            maxHeight: 80,
            overflowY: 'auto'
          }}>
            {recommendation.contacts.slice(0, 10).map(contact => (
              <div
                key={contact.id}
                onClick={() => handleContactSelection(contact.id)}
                style={{
                  padding: '4px 8px',
                  background: selectedContacts.has(contact.id) ? RBA_GREEN : '#eee',
                  color: selectedContacts.has(contact.id) ? 'white' : '#333',
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: selectedContacts.has(contact.id) ? '2px solid #007A33' : '1px solid #ddd'
                }}
              >
                {contact.firstName} {contact.lastName} ({contact.heatScore || 0})
              </div>
            ))}
            {recommendation.contacts.length > 10 && (
              <div style={{ padding: '4px 8px', background: '#f0f0f0', borderRadius: 4, fontSize: 12 }}>
                +{recommendation.contacts.length - 10} more
              </div>
            )}
          </div>
        </div>

        {/* Campaign Purpose & Action */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>
            Recommended Action:
          </div>
          <div style={{
            padding: 12,
            background: '#f0f8ff',
            border: '1px solid #007A33',
            borderRadius: 6
          }}>
            <div style={{ fontWeight: 600, color: '#007A33' }}>
              {recommendation.purpose || recommendation.category}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              Create or assign contacts to a campaign focused on this purpose
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => openEnrollmentModal(recommendation)}
            style={{
              ...buttonOutlineStyle,
              background: RBA_GREEN,
              color: 'white',
              fontSize: 12,
              padding: '8px 16px',
              fontWeight: 600
            }}
          >
            📝 Enroll {recommendation.contacts.length} Contact{recommendation.contacts.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    );
  };

  // Algorithm to diversify recommendations for manual refresh
  const diversifyRecommendations = (recommendations) => {
    // Group recommendations by purpose/type
    const byPurpose = {};
    recommendations.forEach(rec => {
      const purpose = rec.purpose;
      if (!byPurpose[purpose]) byPurpose[purpose] = [];
      byPurpose[purpose].push(rec);
    });
    
    // Take 1-2 from each purpose type to create variety
    const diversified = [];
    Object.keys(byPurpose).forEach(purpose => {
      const recs = byPurpose[purpose].sort((a, b) => b.priority - a.priority);
      diversified.push(...recs.slice(0, 2)); // Take top 2 from each purpose
    });
    
    // Fill remaining slots with highest priority overall
    const remaining = recommendations
      .filter(rec => !diversified.find(d => d.contacts === rec.contacts))
      .sort((a, b) => b.priority - a.priority);
    
    return [...diversified, ...remaining].slice(0, 12); // Limit to 12 total
  };

  // Enhanced card style for wider layout like Top Campaigns
  const enhancedCardStyle = {
    ...cardStyle,
    width: '100%',
    maxWidth: 800,
    minWidth: 320,
    margin: '24px auto',
    padding: 24,
    boxSizing: 'border-box',
    background: '#fff',
    border: '1px solid #e0e0e0'
  };

  // Campaign enrollment functions
  const openEnrollmentModal = async (recommendation) => {
    setSelectedRecommendation(recommendation);
    
    // Load available campaigns for this purpose
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;
      
      const campaignsQuery = query(
        collection(db, 'campaigns'),
        where('userId', '==', user.uid),
        where('status', '==', 'active'),
        where('purpose', '==', recommendation.purpose)
      );
      const snapshot = await getDocs(campaignsQuery);
      const campaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setAvailableCampaigns(campaigns);
      
      // Set default delay based on recommendation urgency
      const defaultDelay = getDefaultDelayForUrgency(recommendation.urgency);
      setDelayDays(defaultDelay);
      
      setShowEnrollmentModal(true);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const getDefaultDelayForUrgency = (urgency) => {
    switch (urgency) {
      case 'HIGH': return 0; // Immediate
      case 'MEDIUM': return 1; // Next day
      case 'LOW': return 7; // Next week
      default: return 1;
    }
  };

  const enrollContactsInCampaign = async () => {
    if (!selectedCampaign || !selectedRecommendation) return;
    
    setEnrollmentLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;
      
      const contacts = selectedRecommendation.contacts;
      const campaign = availableCampaigns.find(c => c.id === selectedCampaign);
      
      console.log(`📝 Enrolling ${contacts.length} contacts in campaign: ${campaign.name}`);
      
      // Check for existing enrollments (queued logic)
      const existingEnrollmentsQuery = query(
        collection(db, 'campaignEnrollments'),
        where('userId', '==', user.uid),
        where('contactId', 'in', contacts.map(c => c.id)),
        where('status', 'in', ['active', 'pending'])
      );
      
      const existingSnapshot = await getDocs(existingEnrollmentsQuery);
      const existingEnrollments = existingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      let enrolledCount = 0;
      let queuedCount = 0;
      
      for (const contact of contacts) {
        const existingEnrollment = existingEnrollments.find(e => e.contactId === contact.id);
        
        if (existingEnrollment) {
          // Queue this contact (add to existing enrollment queue)
          console.log(`📋 Queueing contact ${contact.firstName} ${contact.lastName} (already enrolled in ${existingEnrollment.campaignId})`);
          
          // Add to queue - update existing enrollment with queue info
          await updateDoc(doc(db, 'campaignEnrollments', existingEnrollment.id), {
            queuedCampaigns: [...(existingEnrollment.queuedCampaigns || []), {
              campaignId: campaign.id,
              campaignName: campaign.name,
              delayDays: delayDays,
              queuedAt: new Date(),
              reason: selectedRecommendation.reasoning
            }]
          });
          queuedCount++;
        } else {
          // Direct enrollment
          console.log(`✅ Enrolling contact ${contact.firstName} ${contact.lastName}`);
          
          const startDate = new Date();
          startDate.setDate(startDate.getDate() + delayDays);
          
          await addDoc(collection(db, 'campaignEnrollments'), {
            userId: user.uid,
            contactId: contact.id,
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: delayDays > 0 ? 'pending' : 'active',
            startDate: startDate,
            delayDays: delayDays,
            enrolledAt: new Date(),
            enrollmentReason: selectedRecommendation.reasoning,
            aiGenerated: true,
            currentStep: 0,
            completed: false
          });
          enrolledCount++;
        }
      }
      
      alert(`✅ Campaign enrollment complete!\n\n• ${enrolledCount} contacts enrolled directly\n• ${queuedCount} contacts queued (already in active campaigns)`);
      
      setShowEnrollmentModal(false);
      setSelectedRecommendation(null);
      setSelectedCampaign('');
      setDelayDays(0);
      
    } catch (error) {
      console.error('Error enrolling contacts:', error);
      alert('Error enrolling contacts: ' + error.message);
    } finally {
      setEnrollmentLoading(false);
    }
  };

  return (
    <div style={enhancedCardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#222' }}>
          Automation Review & Approval
        </h3>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {activeTab === 'recommendations' && (
            <button
              onClick={handleGenerateAutomatedTasks}
              disabled={processing}
              style={{
                ...buttonOutlineStyle,
                background: RBA_GREEN,
                color: 'white',
                fontSize: 12,
                padding: '6px 12px'
              }}
            >
              {processing ? 'Generating...' : 'Auto-Generate Tasks'}
            </button>
          )}
          
          <button
            onClick={() => loadRecommendations(false)} // false = manual refresh with variety
            disabled={loadingRecommendations}
            style={{
              ...buttonOutlineStyle,
              background: '#3498db',
              color: 'white',
              fontSize: 12,
              padding: '6px 12px'
            }}
          >
            {loadingRecommendations ? 'Loading...' : 'Refresh Recommendations'}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && activeTab !== 'opportunities' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 12,
          marginBottom: 16,
          padding: 16,
          background: '#f8f9fa',
          borderRadius: 8
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f39c12' }}>
              {stats.pending}
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Pending
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#27ae60' }}>
              {stats.executed}
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Executed
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e74c3c' }}>
              {stats.rejected}
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Rejected
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid #eee', 
        marginBottom: 16,
        overflowX: 'auto'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: activeTab === tab.id ? RBA_GREEN : 'transparent',
              color: activeTab === tab.id ? 'white' : '#666',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label} {tab.count > 0 && `(${tab.count})`}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {loading || loadingRecommendations ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
          Loading...
        </div>
      ) : activeTab === 'opportunities' ? (
        <div>
          {recommendations.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>No campaign opportunities found</div>
              <div style={{ fontSize: 14, marginBottom: 12 }}>
                {quotaMessage || 'Your contacts may already be optimally enrolled, or there may not be suitable campaigns for their current heat scores.'}
              </div>
              <button
                onClick={() => loadRecommendations(false)}
                style={{
                  ...buttonOutlineStyle,
                  fontSize: 14,
                  padding: '8px 16px',
                  marginTop: 8
                }}
              >
                🔄 Refresh Recommendations
              </button>
            </div>
          ) : (
            <div>
              <div style={{ 
                padding: 12, 
                background: '#e8f4fd', 
                borderRadius: 6, 
                marginBottom: 16,
                fontSize: 14
              }}>
                <strong>🎯 Smart Automation Recommendations</strong><br />
                Based on your real contact data, heat scores, and {quota?.userTier.name || 'current'} plan limits. 
                {quota && !quota.canCreateMoreTasks && (
                  <span style={{ color: '#e74c3c' }}> Daily limit reached - try again tomorrow.</span>
                )}
                {quota && quota.isNearEmailLimit && (
                  <span style={{ color: '#f39c12' }}> Email capacity high - recommendations limited to prevent spam filters.</span>
                )}
              </div>
              {recommendations.map((recommendation, index) => (
                <div key={index}>
                  {renderRecommendationDetails(recommendation)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Existing task list rendering code would go here */}
          {tasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
              No {activeTab === 'pending' ? 'pending' : activeTab} tasks found
            </div>
          ) : (
            <div style={{ fontSize: 14 }}>
              {/* Batch actions for pending tasks */}
              {activeTab === 'pending' && selectedTasks.size > 0 && (
                <div style={{ 
                  display: 'flex', 
                  gap: 8, 
                  marginBottom: 16,
                  padding: 12,
                  background: '#f8f9fa',
                  borderRadius: 6
                }}>
                  <span style={{ fontSize: 13, color: '#666' }}>
                    {selectedTasks.size} task{selectedTasks.size > 1 ? 's' : ''} selected:
                  </span>
                  <button
                    onClick={() => handleBatchAction('approve')}
                    disabled={processing}
                    style={{
                      ...buttonOutlineStyle,
                      background: '#27ae60',
                      color: 'white',
                      fontSize: 12,
                      padding: '4px 8px'
                    }}
                  >
                    Approve All
                  </button>
                  <button
                    onClick={() => handleBatchAction('reject')}
                    disabled={processing}
                    style={{
                      ...buttonOutlineStyle,
                      background: '#e74c3c',
                      color: 'white',
                      fontSize: 12,
                      padding: '4px 8px'
                    }}
                  >
                    Reject All
                  </button>
                </div>
              )}

              {/* Task list */}
              {tasks.map(task => (
                <div
                  key={task.id}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 6,
                    marginBottom: 12,
                    overflow: 'hidden',
                    background: selectedTasks.has(task.id) ? '#f8f9fa' : 'white'
                  }}
                >
                  <div
                    style={{
                      padding: 12,
                      cursor: 'pointer',
                      borderLeft: `4px solid ${getStatusColor(task.status)}`
                    }}
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {activeTab === 'pending' && (
                            <input
                              type="checkbox"
                              checked={selectedTasks.has(task.id)}
                              onChange={() => handleTaskSelection(task.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{task.title}</span>
                          <span style={{
                            background: getStatusColor(task.status),
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: 3,
                            fontSize: 11,
                            textTransform: 'uppercase'
                          }}>
                            {task.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                          {task.description}
                        </div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                          {formatTaskType(task.type)} • {formatTaskPriority(task.priority)} • {formatRelativeTime(task.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded task details */}
                  {expandedTask === task.id && (
                    <div style={{ 
                      padding: 16, 
                      borderTop: '1px solid #eee',
                      background: '#fafafa'
                    }}>
                      {/* Task details */}
                      {task.type === AUTOMATION_TASK_TYPES.CAMPAIGN_ASSIGNMENT && task.executionData && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Campaign Enrollment Details:</div>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            <div>Campaign ID: {task.executionData.campaignId}</div>
                            <div>Contacts: {task.executionData.contactIds?.length || 0}</div>
                            <div>Category: {task.executionData.category}</div>
                          </div>
                        </div>
                      )}

                      {task.estimatedImpact && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Estimated Impact:</div>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            <div>Contacts Affected: {task.estimatedImpact.contactsAffected}</div>
                            <div>Expected Engagement: {task.estimatedImpact.expectedEngagement}</div>
                          </div>
                        </div>
                      )}

                      {/* Review notes input */}
                      {task.status === TASK_STATUSES.PENDING && (
                        <div style={{ marginBottom: 12 }}>
                          <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Add review notes (optional)..."
                            style={{
                              width: '100%',
                              minHeight: 60,
                              padding: 8,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                              fontSize: 12,
                              resize: 'vertical'
                            }}
                          />
                        </div>
                      )}

                      {/* Action buttons */}
                      {task.status === TASK_STATUSES.PENDING && (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleSingleTaskAction(task.id, 'reject')}
                            disabled={processing}
                            style={{
                              ...buttonOutlineStyle,
                              background: '#e74c3c',
                              color: 'white',
                              fontSize: 12,
                              padding: '6px 12px'
                            }}
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleSingleTaskAction(task.id, 'approve')}
                            disabled={processing}
                            style={{
                              ...buttonOutlineStyle,
                              background: '#27ae60',
                              color: 'white',
                              fontSize: 12,
                              padding: '6px 12px'
                            }}
                          >
                            Approve & Execute
                          </button>
                        </div>
                      )}

                      {/* Execution results */}
                      {task.executionResult && (
                        <div style={{ 
                          marginTop: 12,
                          padding: 8,
                          background: task.status === 'executed' ? '#d4edda' : '#f8d7da',
                          borderRadius: 4,
                          fontSize: 12
                        }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Execution Result:</div>
                          {task.executionResult.enrolled && (
                            <div>✅ Enrolled: {task.executionResult.enrolled} contacts</div>
                          )}
                          {task.executionResult.skipped && (
                            <div>⏭️ Skipped: {task.executionResult.skipped} contacts</div>
                          )}
                          {task.executionResult.error && (
                            <div>❌ Error: {task.executionResult.error}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Campaign Enrollment Modal */}
      {showEnrollmentModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            maxWidth: 600,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>
              Enroll Contacts in Campaign
            </h3>
            
            {selectedRecommendation && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                  {selectedRecommendation.purpose}
                </div>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                  {selectedRecommendation.contacts.length} contacts selected
                </div>
                <div style={{ fontSize: 13, color: '#888' }}>
                  {selectedRecommendation.reasoning}
                </div>
              </div>
            )}
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Select Campaign:
              </label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
              >
                <option value="">Choose a campaign...</option>
                {availableCampaigns.map(campaign => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              {availableCampaigns.length === 0 && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  No active campaigns found for this purpose. Create a campaign first.
                </div>
              )}
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Delay (days):
              </label>
              <input
                type="number"
                min="0"
                max="365"
                value={delayDays}
                onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
                style={{
                  width: '100px',
                  padding: 8,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                0 = Start immediately, 1+ = Start after X days
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEnrollmentModal(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={enrollContactsInCampaign}
                disabled={!selectedCampaign || enrollmentLoading}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 4,
                  background: selectedCampaign ? RBA_GREEN : '#ccc',
                  color: 'white',
                  cursor: selectedCampaign ? 'pointer' : 'not-allowed'
                }}
              >
                {enrollmentLoading ? 'Enrolling...' : 'Enroll Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnhancedAutomationReviewCard;
