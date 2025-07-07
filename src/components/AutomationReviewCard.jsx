import React, { useState, useEffect } from 'react';
import { cardStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';
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
  createSampleTasks
} from '../services/automationReview';

export default function AutomationReviewCard() {
  const [activeTab, setActiveTab] = useState('pending');
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [expandedTask, setExpandedTask] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      // Load tasks based on active tab
      let taskData;
      if (activeTab === 'pending') {
        taskData = await getPendingTasks(user.uid);
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

  const handleTaskSelection = (taskId) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const handleSingleTaskAction = async (taskId, action) => {
    setProcessing(true);
    try {
      if (action === 'approve') {
        await approveTask(taskId, reviewNotes);
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
      setSelectedTasks(new Set());
      setReviewNotes('');
      await loadData();
    } catch (error) {
      console.error('Error processing batch action:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateSampleTasks = async () => {
    setProcessing(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user?.uid) return;

      await createSampleTasks(user.uid);
      await loadData();
    } catch (error) {
      console.error('Error creating sample tasks:', error);
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

  const tabs = [
    { id: 'pending', label: 'Pending Review', count: stats?.pending || 0 },
    { id: 'approved', label: 'Approved', count: stats?.approved || 0 },
    { id: 'rejected', label: 'Rejected', count: stats?.rejected || 0 },
    { id: 'all', label: 'All Tasks', count: stats?.total || 0 }
  ];

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          Automation Review & Approval
        </h3>
        
        {tasks.length === 0 && !loading && (
          <button
            onClick={handleCreateSampleTasks}
            disabled={processing}
            style={{
              ...buttonOutlineStyle,
              background: '#f8f9fa',
              color: '#666',
              fontSize: 12,
              padding: '6px 12px'
            }}
          >
            {processing ? 'Creating...' : 'Create Sample Tasks'}
          </button>
        )}
      </div>

      {/* Stats Summary */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12,
          marginBottom: 16,
          padding: 16,
          background: '#f8f9fa',
          borderRadius: 8
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f39c12' }}>
              {stats.pending}
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Pending
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#27ae60' }}>
              {stats.executed}
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Executed
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#3498db' }}>
              {stats.approvalRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Approval Rate
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#666' }}>
              {Math.round(stats.avgReviewTime / (1000 * 60 * 60))}h
            </div>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>
              Avg Review Time
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 16,
        background: '#f8f9fa',
        padding: 4,
        borderRadius: 8
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              background: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? '#333' : '#666',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? RBA_GREEN : '#bbb',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 600
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Batch Actions for Pending Tasks */}
      {activeTab === 'pending' && selectedTasks.size > 0 && (
        <div style={{
          padding: 12,
          background: '#e8f5e8',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleBatchAction('approve')}
              disabled={processing}
              style={{
                ...buttonOutlineStyle,
                background: RBA_GREEN,
                color: '#fff',
                fontSize: 12,
                padding: '6px 12px'
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
                color: '#fff',
                fontSize: 12,
                padding: '6px 12px'
              }}
            >
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* Tasks List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>No tasks found</div>
          <div style={{ fontSize: 14 }}>
            {activeTab === 'pending' 
              ? 'All automation tasks have been reviewed'
              : `No ${activeTab} tasks to display`
            }
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasks.map(task => {
            const priority = formatTaskPriority(task.priority);
            const isOverdue = isTaskOverdue(task);
            const isExpanded = expandedTask === task.id;

            return (
              <div
                key={task.id}
                style={{
                  border: `2px solid ${isOverdue ? '#e74c3c' : '#e9ecef'}`,
                  borderRadius: 8,
                  background: isExpanded ? '#f8f9fa' : '#fff',
                  transition: 'all 0.2s ease'
                }}
              >
                <div
                  style={{
                    padding: 16,
                    cursor: 'pointer'
                  }}
                  onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Selection checkbox for pending tasks */}
                    {task.status === TASK_STATUSES.PENDING && (
                      <input
                        type="checkbox"
                        checked={selectedTasks.has(task.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleTaskSelection(task.id);
                        }}
                        style={{ marginTop: 4 }}
                      />
                    )}

                    <div style={{ flex: 1 }}>
                      {/* Task Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 600,
                          background: priority.color,
                          color: '#fff'
                        }}>
                          {priority.label}
                        </div>
                        
                        <div style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 600,
                          background: getStatusColor(task.status),
                          color: '#fff'
                        }}>
                          {task.status.toUpperCase()}
                        </div>

                        <div style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#3498db',
                          color: '#fff'
                        }}>
                          {formatTaskType(task.type)}
                        </div>

                        {isOverdue && (
                          <div style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 600,
                            background: '#e74c3c',
                            color: '#fff'
                          }}>
                            OVERDUE
                          </div>
                        )}

                        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
                          {formatRelativeTime(task.createdAt)}
                        </div>
                      </div>

                      {/* Task Title */}
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>
                        {task.title}
                      </h4>

                      {/* Task Description */}
                      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#666', lineHeight: 1.4 }}>
                        {task.description}
                      </p>

                      {/* Quick Stats */}
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
                        <span>Affects {task.affectedContacts || 0} contacts</span>
                        {task.estimatedImpact?.expectedOpenRate && (
                          <span>~{task.estimatedImpact.expectedOpenRate} open rate</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid #e9ecef',
                    padding: 16,
                    background: '#f8f9fa'
                  }}>
                    {/* Execution Data */}
                    {task.executionData && (
                      <div style={{ marginBottom: 16 }}>
                        <h5 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600 }}>
                          Execution Details
                        </h5>
                        <pre style={{
                          background: '#fff',
                          padding: 12,
                          borderRadius: 6,
                          fontSize: 11,
                          overflow: 'auto',
                          margin: 0,
                          border: '1px solid #e9ecef'
                        }}>
                          {JSON.stringify(task.executionData, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Review Section for Pending Tasks */}
                    {task.status === TASK_STATUSES.PENDING && (
                      <div>
                        <h5 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600 }}>
                          Review Notes (Optional)
                        </h5>
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Add notes about your decision..."
                          style={{
                            width: '100%',
                            minHeight: 60,
                            padding: 12,
                            border: '1px solid #e9ecef',
                            borderRadius: 6,
                            fontSize: 13,
                            resize: 'vertical',
                            boxSizing: 'border-box'
                          }}
                        />
                        
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleSingleTaskAction(task.id, 'reject')}
                            disabled={processing}
                            style={{
                              ...buttonOutlineStyle,
                              background: '#e74c3c',
                              color: '#fff',
                              fontSize: 13,
                              padding: '8px 16px'
                            }}
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleSingleTaskAction(task.id, 'approve')}
                            disabled={processing}
                            style={{
                              ...buttonOutlineStyle,
                              background: RBA_GREEN,
                              color: '#fff',
                              fontSize: 13,
                              padding: '8px 16px'
                            }}
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Review Info for Reviewed Tasks */}
                    {task.reviewedAt && (
                      <div style={{ padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #e9ecef' }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                          Reviewed {formatRelativeTime(task.reviewedAt)} by {task.reviewedBy}
                        </div>
                        {task.reviewNotes && (
                          <div style={{ fontSize: 13 }}>{task.reviewNotes}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
