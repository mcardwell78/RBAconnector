/**
 * Zoho Mail Integration for Reply Handling
 * 
 * This approach uses Zoho Mail API to periodically check for new emails
 * and process any that are replies to your campaign emails.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const db = admin.firestore();

// Function to check Zoho Mail for new replies (runs every 5 minutes)
exports.checkZohoMailReplies = onSchedule('every 5 minutes', async (event) => {
  console.log('[checkZohoMailReplies] Starting Zoho Mail check...');
  
  try {
    // Get Zoho Mail access token from Firestore
    const configDoc = await db.collection('systemConfig').doc('zohoMail').get();
    
    if (!configDoc.exists) {
      console.log('[checkZohoMailReplies] No Zoho Mail configuration found');
      return;
    }
    
    const { accessToken, refreshToken, accountId } = configDoc.data();
    
    if (!accessToken) {
      console.log('[checkZohoMailReplies] No access token available');
      return;
    }
    
    // Fetch recent emails from Zoho Mail
    const response = await fetch(`https://mail.zoho.com/api/accounts/${accountId}/messages/search`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      // Search for emails received in the last 5 minutes
      body: JSON.stringify({
        searchKey: 'receivedTime',
        searchOp: 'gte', 
        searchValue: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      })
    });
    
    if (!response.ok) {
      console.error('[checkZohoMailReplies] Zoho API error:', response.status);
      return;
    }
    
    const data = await response.json();
    const messages = data.data || [];
    
    console.log(`[checkZohoMailReplies] Found ${messages.length} recent emails`);
    
    // Process each message
    for (const message of messages) {
      await processZohoEmailMessage(message, accountId, accessToken);
    }
    
  } catch (error) {
    console.error('[checkZohoMailReplies] Error:', error);
  }
});

// Process individual Zoho email message
async function processZohoEmailMessage(message, accountId, accessToken) {
  try {
    // Get full email details
    const detailResponse = await fetch(
      `https://mail.zoho.com/api/accounts/${accountId}/messages/${message.messageId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!detailResponse.ok) {
      console.error(`[processZohoEmailMessage] Failed to get details for ${message.messageId}`);
      return;
    }
    
    const emailDetail = await detailResponse.json();
    const email = emailDetail.data;
    
    // Check if this is a reply to one of our campaign emails
    const isReply = email.subject?.toLowerCase().includes('re:') || 
                   email.inReplyTo || 
                   email.references;
    
    if (!isReply) {
      console.log(`[processZohoEmailMessage] Email ${message.messageId} is not a reply`);
      return;
    }
    
    // Try to find the contact
    const fromEmail = email.fromAddress.toLowerCase().trim();
    const contactQuery = await db.collection('contacts')
      .where('email', '==', fromEmail)
      .limit(1)
      .get();
    
    if (contactQuery.empty) {
      console.log(`[processZohoEmailMessage] No contact found for ${fromEmail}`);
      return;
    }
    
    const contactDoc = contactQuery.docs[0];
    const contactData = contactDoc.data();
    
    // Check if we've already processed this email
    const existingReply = await db.collection('emailReplies')
      .where('zohoMessageId', '==', message.messageId)
      .get();
    
    if (!existingReply.empty) {
      console.log(`[processZohoEmailMessage] Already processed ${message.messageId}`);
      return;
    }
    
    // Store the reply
    await db.collection('emailReplies').add({
      fromEmail: fromEmail,
      toEmail: email.toAddress,
      subject: email.subject,
      textContent: email.textContent || '',
      htmlContent: email.htmlContent || '',
      contactId: contactDoc.id,
      contactName: `${contactData.firstName} ${contactData.lastName}`,
      userId: contactData.userId,
      receivedAt: new Date(email.receivedTime),
      isRead: false,
      isRepliedTo: false,
      priority: 'normal',
      source: 'zoho',
      zohoMessageId: message.messageId,
      zohoFolderId: message.folderId
    });
    
    // Update contact engagement
    await updateContactEngagement(contactDoc.id, contactData, email.subject);
    
    // Create notification
    await createReplyNotification(contactData, email);
    
    console.log(`[processZohoEmailMessage] Processed reply from ${contactData.firstName} ${contactData.lastName}`);
    
  } catch (error) {
    console.error(`[processZohoEmailMessage] Error processing ${message.messageId}:`, error);
  }
}

// Helper functions
async function updateContactEngagement(contactId, contactData, subject) {
  const currentHeatScore = contactData.heatScore || 0;
  const newHeatScore = Math.min(100, currentHeatScore + 15);
  
  await db.collection('contacts').doc(contactId).update({
    heatScore: newHeatScore,
    lastEngagement: admin.firestore.FieldValue.serverTimestamp(),
    engagementHistory: admin.firestore.FieldValue.arrayUnion({
      type: 'email_reply',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: `Replied: ${subject}`
    })
  });
}

async function createReplyNotification(contactData, email) {
  await db.collection('notifications').add({
    userId: contactData.userId,
    type: 'email_reply',
    title: `${contactData.firstName} ${contactData.lastName} replied!`,
    message: `"${email.subject}" - ${(email.textContent || '').substring(0, 100)}...`,
    contactId: contactData.id,
    isRead: false,
    priority: 'high',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    emailData: {
      subject: email.subject,
      fromEmail: email.fromAddress,
      receivedTime: email.receivedTime
    }
  });
}

// Manual function to set up Zoho Mail OAuth
exports.setupZohoMailAuth = onCall(async (req) => {
  // This would handle the OAuth flow for Zoho Mail
  // Implementation depends on your specific requirements
  console.log('[setupZohoMailAuth] Setting up Zoho Mail authentication...');
  
  return {
    authUrl: 'https://accounts.zoho.com/oauth/v2/auth?scope=ZohoMail.messages.READ&client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI',
    instructions: 'Visit this URL to authorize access to your Zoho Mail account'
  };
});
