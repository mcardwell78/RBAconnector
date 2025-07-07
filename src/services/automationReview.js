// Service for user review and approval workflows for automated tasks
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// Types of automated tasks that require approval
export const AUTOMATION_TASK_TYPES = {
  EMAIL_CAMPAIGN: 'email_campaign',
  FOLLOW_UP_EMAIL: 'follow_up_email',
  CONTACT_TAGGING: 'contact_tagging',
  STATUS_UPDATE: 'status_update',
  HEAT_SCORE_ADJUSTMENT: 'heat_score_adjustment',
  CAMPAIGN_ASSIGNMENT: 'campaign_assignment'
};

// Task priority levels
export const TASK_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Task statuses
export const TASK_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  FAILED: 'failed'
};

// Create a new automated task for review
export async function createAutomatedTask(taskData) {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) throw new Error('User not authenticated');

  const task = {
    userId: user.uid,
    type: taskData.type,
    title: taskData.title,
    description: taskData.description,
    priority: taskData.priority || TASK_PRIORITIES.MEDIUM,
    status: TASK_STATUSES.PENDING,
    
    // Task execution data
    executionData: taskData.executionData,
    
    // Metadata
    createdAt: new Date(),
    createdBy: 'automation_system',
    reviewedAt: null,
    reviewedBy: null,
    executedAt: null,
    
    // Review context
    automationRuleId: taskData.automationRuleId || null,
    triggerEvent: taskData.triggerEvent || null,
    affectedContacts: taskData.affectedContacts || [],
    estimatedImpact: taskData.estimatedImpact || {},
    
    // Approval requirements
    requiresApproval: taskData.requiresApproval !== false, // Default to true
    autoExecuteAfter: taskData.autoExecuteAfter || null, // Auto-execute after this date if not reviewed
    
    // Additional context
    tags: taskData.tags || [],
    notes: taskData.notes || ''
  };

  const docRef = await addDoc(collection(db, 'automationTasks'), task);
  return { id: docRef.id, ...task };
}

// Get pending tasks for review
export async function getPendingTasks(userId, filters = {}) {
  let q = query(
    collection(db, 'automationTasks'),
    where('userId', '==', userId),
    where('status', '==', TASK_STATUSES.PENDING),
    orderBy('priority', 'desc'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  let tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Apply client-side filters
  if (filters.type) {
    tasks = tasks.filter(task => task.type === filters.type);
  }
  if (filters.priority) {
    tasks = tasks.filter(task => task.priority === filters.priority);
  }
  if (filters.since) {
    tasks = tasks.filter(task => task.createdAt.toDate() >= filters.since);
  }

  return tasks;
}

// Get all tasks with optional status filter
export async function getUserTasks(userId, status = null, limit = 50) {
  let q;
  
  if (status) {
    q = query(
      collection(db, 'automationTasks'),
      where('userId', '==', userId),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(
      collection(db, 'automationTasks'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .slice(0, limit);
}

// Approve a task
export async function approveTask(taskId, reviewNotes = '') {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) throw new Error('User not authenticated');

  const taskRef = doc(db, 'automationTasks', taskId);
  const updateData = {
    status: TASK_STATUSES.APPROVED,
    reviewedAt: new Date(),
    reviewedBy: user.uid,
    reviewNotes: reviewNotes
  };

  await updateDoc(taskRef, updateData);

  // Trigger execution (this would typically be handled by a Cloud Function)
  // For now, we'll just mark it as ready for execution
  return updateData;
}

// Reject a task
export async function rejectTask(taskId, reviewNotes = '') {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) throw new Error('User not authenticated');

  const taskRef = doc(db, 'automationTasks', taskId);
  const updateData = {
    status: TASK_STATUSES.REJECTED,
    reviewedAt: new Date(),
    reviewedBy: user.uid,
    reviewNotes: reviewNotes
  };

  await updateDoc(taskRef, updateData);
  return updateData;
}

// Execute an approved task (typically called by automation system)
export async function executeTask(taskId, executionResult = {}) {
  const taskRef = doc(db, 'automationTasks', taskId);
  const updateData = {
    status: executionResult.success ? TASK_STATUSES.EXECUTED : TASK_STATUSES.FAILED,
    executedAt: new Date(),
    executionResult: executionResult,
    executionNotes: executionResult.notes || ''
  };

  await updateDoc(taskRef, updateData);
  return updateData;
}

// Delete a task (only for pending or rejected tasks)
export async function deleteTask(taskId) {
  await deleteDoc(doc(db, 'automationTasks', taskId));
}

// Batch approve multiple tasks
export async function batchApproveReject(taskIds, action, reviewNotes = '') {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user?.uid) throw new Error('User not authenticated');

  const status = action === 'approve' ? TASK_STATUSES.APPROVED : TASK_STATUSES.REJECTED;
  const updatePromises = taskIds.map(taskId => {
    const taskRef = doc(db, 'automationTasks', taskId);
    return updateDoc(taskRef, {
      status,
      reviewedAt: new Date(),
      reviewedBy: user.uid,
      reviewNotes
    });
  });

  await Promise.all(updatePromises);
  return { processed: taskIds.length, action, status };
}

// Get task statistics for dashboard
export async function getTaskStats(userId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const tasksQuery = query(
    collection(db, 'automationTasks'),
    where('userId', '==', userId),
    where('createdAt', '>=', since)
  );

  const snapshot = await getDocs(tasksQuery);
  const tasks = snapshot.docs.map(doc => doc.data());

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === TASK_STATUSES.PENDING).length,
    approved: tasks.filter(t => t.status === TASK_STATUSES.APPROVED).length,
    rejected: tasks.filter(t => t.status === TASK_STATUSES.REJECTED).length,
    executed: tasks.filter(t => t.status === TASK_STATUSES.EXECUTED).length,
    failed: tasks.filter(t => t.status === TASK_STATUSES.FAILED).length,
    
    byType: {},
    byPriority: {},
    
    avgReviewTime: 0,
    approvalRate: 0
  };

  // Calculate by type and priority
  tasks.forEach(task => {
    stats.byType[task.type] = (stats.byType[task.type] || 0) + 1;
    stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
  });

  // Calculate approval rate
  const reviewedTasks = stats.approved + stats.rejected;
  if (reviewedTasks > 0) {
    stats.approvalRate = (stats.approved / reviewedTasks) * 100;
  }

  // Calculate average review time for reviewed tasks
  const reviewedTasksData = tasks.filter(t => t.reviewedAt && t.createdAt);
  if (reviewedTasksData.length > 0) {
    const totalReviewTime = reviewedTasksData.reduce((sum, task) => {
      const reviewTime = task.reviewedAt.toDate() - task.createdAt.toDate();
      return sum + reviewTime;
    }, 0);
    stats.avgReviewTime = totalReviewTime / reviewedTasksData.length;
  }

  return stats;
}

// Listen to real-time task updates
export function subscribeToTasks(userId, callback, filters = {}) {
  let q = query(
    collection(db, 'automationTasks'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  if (filters.status) {
    q = query(
      collection(db, 'automationTasks'),
      where('userId', '==', userId),
      where('status', '==', filters.status),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(tasks);
  });
}

// Helper function to format task priority for display
export function formatTaskPriority(priority) {
  const priorityMap = {
    [TASK_PRIORITIES.LOW]: { label: 'Low', color: '#27ae60' },
    [TASK_PRIORITIES.MEDIUM]: { label: 'Medium', color: '#f39c12' },
    [TASK_PRIORITIES.HIGH]: { label: 'High', color: '#e74c3c' },
    [TASK_PRIORITIES.URGENT]: { label: 'Urgent', color: '#8e44ad' }
  };
  
  return priorityMap[priority] || { label: 'Unknown', color: '#95a5a6' };
}

// Helper function to format task type for display
export function formatTaskType(type) {
  const typeMap = {
    [AUTOMATION_TASK_TYPES.EMAIL_CAMPAIGN]: 'Email Campaign',
    [AUTOMATION_TASK_TYPES.FOLLOW_UP_EMAIL]: 'Follow-up Email',
    [AUTOMATION_TASK_TYPES.CONTACT_TAGGING]: 'Contact Tagging',
    [AUTOMATION_TASK_TYPES.STATUS_UPDATE]: 'Status Update',
    [AUTOMATION_TASK_TYPES.HEAT_SCORE_ADJUSTMENT]: 'Heat Score Adjustment',
    [AUTOMATION_TASK_TYPES.CAMPAIGN_ASSIGNMENT]: 'Campaign Assignment'
  };
  
  return typeMap[type] || type;
}

// Helper function to check if a task is overdue for review
export function isTaskOverdue(task, overdueHours = 24) {
  if (task.status !== TASK_STATUSES.PENDING) return false;
  
  const now = new Date();
  const createdAt = task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
  const hoursElapsed = (now - createdAt) / (1000 * 60 * 60);
  
  return hoursElapsed > overdueHours;
}

// Create sample automation tasks for testing
export async function createSampleTasks(userId) {
  const sampleTasks = [
    {
      type: AUTOMATION_TASK_TYPES.FOLLOW_UP_EMAIL,
      title: 'Send follow-up email to high-value prospects',
      description: 'Automated follow-up email triggered for 5 contacts with quotes over $10,000 who haven\'t been contacted in 7 days.',
      priority: TASK_PRIORITIES.HIGH,
      executionData: {
        emailTemplateId: 'template_follow_up_high_value',
        contactIds: ['contact1', 'contact2', 'contact3', 'contact4', 'contact5']
      },
      affectedContacts: 5,
      estimatedImpact: {
        expectedOpenRate: '35%',
        expectedResponseRate: '12%',
        potentialRevenue: '$50,000'
      },
      triggerEvent: 'high_value_prospect_dormant'
    },
    {
      type: AUTOMATION_TASK_TYPES.CONTACT_TAGGING,
      title: 'Tag contacts as "Price Sensitive"',
      description: 'Auto-tag 8 contacts who mentioned price concerns in their reason for not proceeding.',
      priority: TASK_PRIORITIES.MEDIUM,
      executionData: {
        contactIds: ['contact6', 'contact7', 'contact8'],
        tagToAdd: 'price_sensitive',
        campaignToAssign: 'value_proposition_campaign'
      },
      affectedContacts: 8,
      estimatedImpact: {
        improvedTargeting: 'Yes',
        campaignRelevance: '+25%'
      },
      triggerEvent: 'reason_no_sale_price_category'
    },
    {
      type: AUTOMATION_TASK_TYPES.HEAT_SCORE_ADJUSTMENT,
      title: 'Increase heat scores for engaged contacts',
      description: 'Boost heat scores for 3 contacts who opened multiple emails and clicked links recently.',
      priority: TASK_PRIORITIES.LOW,
      executionData: {
        contactIds: ['contact9', 'contact10', 'contact11'],
        heatScoreIncrease: 10,
        reason: 'high_email_engagement'
      },
      affectedContacts: 3,
      estimatedImpact: {
        prioritization: 'Improved',
        followUpTiming: 'Optimized'
      },
      triggerEvent: 'high_engagement_detected'
    }
  ];

  const createdTasks = [];
  for (const taskData of sampleTasks) {
    const task = await createAutomatedTask({ ...taskData, userId });
    createdTasks.push(task);
  }

  return createdTasks;
}
