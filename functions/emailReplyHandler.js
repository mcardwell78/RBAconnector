/**
 * Email Reply Management System
 * 
 * This implements email reply handling using SendGrid's Inbound Parse webhook.
 * When someone replies to your emails, this system will:
 * 1. Receive the reply via SendGrid webhook
 * 2. Parse the email content and sender
 * 3. Link it to the original contact
 * 4. Store in Firestore for viewing
 * 5. Send notifications to you
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const db = admin.firestore();

// SendGrid Inbound Parse webhook handler
exports.handleEmailReplies = onRequest({
  cors: true
}, async (req, res) => {
  console.log('[handleEmailReplies] Received inbound email:', req.body);
  
  try {
    // SendGrid sends inbound emails as form data
    const { 
      from,          // Reply sender email
      to,            // Your email address
      subject,       // Reply subject
      text,          // Plain text content
      html,          // HTML content (if available)
      SPF,           // SPF check result
      headers        // All email headers
    } = req.body;
    
    console.log(`[handleEmailReplies] Reply from: ${from}, Subject: ${subject}`);
    
    // Extract the original sender email from the reply
    const replyFromEmail = from.toLowerCase().trim();
    
    // Try to find the contact this reply came from
    const contactQuery = await db.collection('contacts')
      .where('email', '==', replyFromEmail)
      .limit(1)
      .get();
    
    let contactId = null;
    let contactData = null;
    
    if (!contactQuery.empty) {
      const contactDoc = contactQuery.docs[0];
      contactId = contactDoc.id;
      contactData = contactDoc.data();
      console.log(`[handleEmailReplies] Found contact: ${contactData.firstName} ${contactData.lastName}`);
    } else {
      console.log(`[handleEmailReplies] No contact found for email: ${replyFromEmail}`);
    }
    
    // Store the reply in Firestore
    const replyData = {
      fromEmail: replyFromEmail,
      toEmail: to,
      subject: subject || '(No Subject)',
      textContent: text || '',
      htmlContent: html || '',
      contactId: contactId,
      contactName: contactData ? `${contactData.firstName} ${contactData.lastName}` : 'Unknown Contact',
      userId: contactData?.userId || null,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      isRead: false,
      isRepliedTo: false,
      priority: 'normal', // Can be 'high', 'normal', 'low'
      tags: [], // For categorization
      headers: headers || {},
      spfResult: SPF || 'unknown'
    };
    
    // Save the reply
    const replyDoc = await db.collection('emailReplies').add(replyData);
    console.log(`[handleEmailReplies] Saved reply with ID: ${replyDoc.id}`);
    
    // If we found a contact, update their engagement data
    if (contactId && contactData?.userId) {
      try {
        // Increase heat score for replying
        const currentHeatScore = contactData.heatScore || 0;
        const newHeatScore = Math.min(100, currentHeatScore + 15); // +15 for replying
        
        await db.collection('contacts').doc(contactId).update({
          heatScore: newHeatScore,
          lastEngagement: admin.firestore.FieldValue.serverTimestamp(),
          engagementHistory: admin.firestore.FieldValue.arrayUnion({
            type: 'email_reply',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: `Replied to email: ${subject}`
          })
        });
        
        console.log(`[handleEmailReplies] Updated contact heat score: ${currentHeatScore} -> ${newHeatScore}`);
        
        // Create a notification for the user
        await db.collection('notifications').add({
          userId: contactData.userId,
          type: 'email_reply',
          title: `${contactData.firstName} ${contactData.lastName} replied!`,
          message: `"${subject}" - ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
          contactId: contactId,
          replyId: replyDoc.id,
          isRead: false,
          priority: 'high',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`[handleEmailReplies] Created notification for user: ${contactData.userId}`);
        
      } catch (updateError) {
        console.error('[handleEmailReplies] Error updating contact:', updateError);
      }
    }
    
    // Send success response to SendGrid
    res.status(200).json({ 
      success: true, 
      replyId: replyDoc.id,
      message: 'Email reply processed successfully' 
    });
    
  } catch (error) {
    console.error('[handleEmailReplies] Error processing email reply:', error);
    res.status(500).json({ 
      error: 'Failed to process email reply',
      details: error.message 
    });
  }
});

// Function to get unread replies for a user
exports.getUnreadReplies = onCall(async (req) => {
  if (!req.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  try {
    const repliesQuery = await db.collection('emailReplies')
      .where('userId', '==', req.auth.uid)
      .where('isRead', '==', false)
      .orderBy('receivedAt', 'desc')
      .limit(50)
      .get();
    
    const replies = repliesQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      receivedAt: doc.data().receivedAt?.toDate?.()?.toISOString() || null
    }));
    
    return { replies, count: replies.length };
    
  } catch (error) {
    console.error('[getUnreadReplies] Error:', error);
    throw new HttpsError('internal', 'Failed to get replies');
  }
});

// Function to mark reply as read
exports.markReplyAsRead = onCall(async (req) => {
  if (!req.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { replyId } = req.data;
  
  try {
    await db.collection('emailReplies').doc(replyId).update({
      isRead: true,
      readAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('[markReplyAsRead] Error:', error);
    throw new HttpsError('internal', 'Failed to mark reply as read');
  }
});
