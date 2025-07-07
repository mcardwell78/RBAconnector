import React, { useState, useEffect } from 'react';
import { cardStyle, buttonStyle, buttonOutlineStyle } from '../utils/sharedStyles';
import { RBA_GREEN } from '../utils/rbaColors';
import { functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';

const MailboxScreen = () => {
  const [replies, setReplies] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReply, setSelectedReply] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'priority'

  useEffect(() => {
    loadReplies();
    loadNotifications();
  }, [filter]);

  const loadReplies = async () => {
    try {
      setLoading(true);
      const getUnreadReplies = httpsCallable(functions, 'getUnreadReplies');
      const result = await getUnreadReplies();
      setReplies(result.data.replies || []);
    } catch (error) {
      console.error('Error loading replies:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      // Load notifications (you'd implement this function)
      const getNotifications = httpsCallable(functions, 'getNotifications');
      const result = await getNotifications({ type: 'email_reply' });
      setNotifications(result.data.notifications || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const markAsRead = async (replyId) => {
    try {
      const markReplyAsRead = httpsCallable(functions, 'markReplyAsRead');
      await markReplyAsRead({ replyId });
      
      // Update local state
      setReplies(replies.map(reply => 
        reply.id === replyId ? { ...reply, isRead: true } : reply
      ));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const sendReply = async () => {
    if (!selectedReply || !replyText.trim()) return;
    
    try {
      setSending(true);
      const sendOneOffEmail = httpsCallable(functions, 'sendOneOffEmail');
      
      await sendOneOffEmail({
        to: selectedReply.fromEmail,
        subject: `Re: ${selectedReply.subject}`,
        body: replyText,
        contactId: selectedReply.contactId
      });
      
      // Mark the original reply as replied to
      await markAsRepliedTo(selectedReply.id);
      
      setReplyText('');
      setSelectedReply(null);
      alert('Reply sent successfully!');
      
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const markAsRepliedTo = async (replyId) => {
    // Implementation to mark reply as replied to
    setReplies(replies.map(reply => 
      reply.id === replyId ? { ...reply, isRepliedTo: true } : reply
    ));
  };

  const getFilteredReplies = () => {
    switch (filter) {
      case 'unread':
        return replies.filter(reply => !reply.isRead);
      case 'priority':
        return replies.filter(reply => reply.priority === 'high');
      default:
        return replies;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ color: '#333', marginBottom: 10 }}>📧 Email Mailbox</h1>
        <p style={{ color: '#666', fontSize: 16 }}>
          Manage replies from your email campaigns
        </p>
      </div>

      {/* Notifications Bar */}
      {notifications.length > 0 && (
        <div style={{
          ...cardStyle,
          backgroundColor: '#e8f4fd',
          border: '1px solid #4CAF50',
          marginBottom: 20,
          padding: 15
        }}>
          <h3 style={{ margin: 0, marginBottom: 10, color: RBA_GREEN }}>🔔 New Notifications</h3>
          {notifications.slice(0, 3).map(notification => (
            <div key={notification.id} style={{ 
              fontSize: 14, 
              marginBottom: 5,
              padding: 8,
              backgroundColor: 'white',
              borderRadius: 4,
              border: '1px solid #ddd'
            }}>
              <strong>{notification.title}</strong> - {notification.message}
            </div>
          ))}
          {notifications.length > 3 && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
              +{notifications.length - 3} more notifications
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ marginBottom: 20 }}>
        {['all', 'unread', 'priority'].map(filterType => (
          <button
            key={filterType}
            onClick={() => setFilter(filterType)}
            style={{
              ...buttonOutlineStyle,
              backgroundColor: filter === filterType ? RBA_GREEN : 'white',
              color: filter === filterType ? 'white' : RBA_GREEN,
              marginRight: 10,
              textTransform: 'capitalize'
            }}
          >
            {filterType} {filterType === 'unread' && replies.filter(r => !r.isRead).length > 0 && 
              `(${replies.filter(r => !r.isRead).length})`}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Replies List */}
        <div style={{ flex: 1 }}>
          <div style={{ ...cardStyle, padding: 0 }}>
            <div style={{ 
              padding: 20, 
              borderBottom: '1px solid #eee',
              backgroundColor: '#f8f9fa'
            }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Email Replies ({getFilteredReplies().length})
              </h2>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
                Loading replies...
              </div>
            ) : getFilteredReplies().length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
                <div style={{ fontSize: 16, marginBottom: 10 }}>No email replies found</div>
                <div style={{ fontSize: 14 }}>
                  {filter === 'unread' ? 'All replies have been read' : 
                   filter === 'priority' ? 'No priority replies at this time' :
                   'When people reply to your emails, they\'ll appear here'}
                </div>
              </div>
            ) : (
              getFilteredReplies().map(reply => (
                <div
                  key={reply.id}
                  onClick={() => {
                    setSelectedReply(reply);
                    if (!reply.isRead) markAsRead(reply.id);
                  }}
                  style={{
                    padding: 15,
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                    backgroundColor: reply.isRead ? 'white' : '#f0f8ff',
                    '&:hover': { backgroundColor: '#f5f5f5' }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                        {!reply.isRead && (
                          <div style={{
                            width: 8,
                            height: 8,
                            backgroundColor: RBA_GREEN,
                            borderRadius: '50%',
                            marginRight: 8
                          }} />
                        )}
                        <strong style={{ fontSize: 14 }}>{reply.contactName}</strong>
                        <span style={{ 
                          fontSize: 12, 
                          color: '#666', 
                          marginLeft: 8 
                        }}>
                          {reply.fromEmail}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 3 }}>
                        {reply.subject}
                      </div>
                      <div style={{ 
                        fontSize: 12, 
                        color: '#666',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {reply.textContent.substring(0, 100)}...
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#999', textAlign: 'right' }}>
                      {formatDate(reply.receivedAt)}
                      {reply.priority === 'high' && (
                        <div style={{ color: '#e74c3c', fontWeight: 'bold' }}>🔥 HIGH</div>
                      )}
                      {reply.isRepliedTo && (
                        <div style={{ color: RBA_GREEN, fontSize: 10 }}>✓ Replied</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reply Detail & Compose */}
        <div style={{ width: 400 }}>
          {selectedReply ? (
            <div style={{ ...cardStyle, padding: 0 }}>
              <div style={{ 
                padding: 15, 
                borderBottom: '1px solid #eee',
                backgroundColor: '#f8f9fa'
              }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  Reply from {selectedReply.contactName}
                </h3>
                <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                  {formatDate(selectedReply.receivedAt)}
                </div>
              </div>

              {/* Original Email Content */}
              <div style={{ padding: 15, borderBottom: '1px solid #eee' }}>
                <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>
                  Subject: {selectedReply.subject}
                </div>
                <div style={{ 
                  fontSize: 13, 
                  lineHeight: 1.5,
                  maxHeight: 200,
                  overflowY: 'auto',
                  backgroundColor: '#f9f9f9',
                  padding: 10,
                  borderRadius: 4
                }}>
                  {selectedReply.textContent || 'No text content'}
                </div>
              </div>

              {/* Reply Compose */}
              <div style={{ padding: 15 }}>
                <h4 style={{ fontSize: 14, marginBottom: 10 }}>Your Reply:</h4>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply here..."
                  style={{
                    width: '100%',
                    height: 120,
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    fontSize: 13,
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sending}
                    style={{
                      ...buttonStyle,
                      flex: 1,
                      opacity: (!replyText.trim() || sending) ? 0.6 : 1
                    }}
                  >
                    {sending ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button
                    onClick={() => setSelectedReply(null)}
                    style={{
                      ...buttonOutlineStyle,
                      padding: '8px 16px'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: '#666' }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>
                📝 Select a reply to view and respond
              </div>
              <div style={{ fontSize: 14 }}>
                Click on any email in the list to read and reply to it
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Setup Instructions (if no replies yet) */}
      {replies.length === 0 && !loading && (
        <div style={{
          ...cardStyle,
          marginTop: 20,
          padding: 20,
          backgroundColor: '#f8f9fa',
          border: '1px solid #e0e0e0'
        }}>
          <h3 style={{ color: '#333', marginBottom: 15 }}>📋 Email Reply Setup</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 15 }}>
            To receive email replies in this mailbox, you need to configure either:
          </p>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <strong>Option 1: SendGrid Inbound Parse (Recommended)</strong>
            <ul style={{ marginLeft: 20, marginTop: 5 }}>
              <li>Configure SendGrid to forward replies to your app</li>
              <li>Automatic processing and contact linking</li>
              <li>Real-time notifications</li>
            </ul>
            
            <strong>Option 2: Zoho Mail Integration</strong>
            <ul style={{ marginLeft: 20, marginTop: 5 }}>
              <li>Connect your Zoho Mail account</li>
              <li>Periodic checking for new replies</li>
              <li>Works with your existing email setup</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default MailboxScreen;
