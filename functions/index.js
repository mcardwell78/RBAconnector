/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const cors = require('cors')({ origin: ['http://localhost:3000', 'https://dc-power-connector.web.app'] });

// Define the SendGrid API key secret
const sendGridApiKey = defineSecret('SENDGRID_API_KEY');

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

console.log("Firebase Functions index.js loaded");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.sendOneOffEmail = onCall({
  secrets: [sendGridApiKey]
}, async (req) => {
  console.log('sendOneOffEmail req.data:', req.data);
  console.log('sendOneOffEmail req.auth:', req.auth);
  if (!req.auth || !req.auth.uid) {
    console.error('Unauthorized: No auth context');
    throw new HttpsError('unauthenticated', 'You must be signed in to send email.');
  }
  const { to, subject, body, contactId, templateId, scheduleFor } = req.data;
  console.log('sendOneOffEmail called with:', { to, subject, body, contactId, templateId, scheduleFor, uid: req.auth.uid });
  
  // If scheduleFor is provided, create a scheduled email instead of sending immediately
  if (scheduleFor) {
    console.log('Creating scheduled email for:', scheduleFor);
    
    const scheduledDate = new Date(scheduleFor);
    const now = new Date();
    const bufferTime = new Date(now.getTime() + 30000); // 30 second buffer
    
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= bufferTime) {
      console.error('Invalid schedule date:', { scheduleFor, scheduledDate, now, isNaN: isNaN(scheduledDate.getTime()), isPast: scheduledDate <= bufferTime });
      throw new HttpsError('invalid-argument', 'scheduleFor must be a valid future date (at least 30 seconds from now)');
    }
    
    // Create scheduled email document
    const scheduledEmail = {
      userId: req.auth.uid,
      contactId: contactId || null,
      templateId: templateId || null,
      to,
      subject,
      body,
      scheduledFor: scheduledDate,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'oneoff'
    };
    
    const docRef = await db.collection('scheduledEmails').add(scheduledEmail);
    console.log('Created scheduled email:', docRef.id, 'for', scheduledDate.toISOString());
    
    return { 
      success: true, 
      scheduled: true,
      scheduledEmailId: docRef.id,
      scheduledFor: scheduledDate.toISOString()
    };
  }
  
  if (!to || !subject || !body) {
    console.error('Missing required fields', { to, subject, body });
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  const sgMail = require('@sendgrid/mail');
  const sendGridKey = sendGridApiKey.value();
  if (!sendGridKey) {
    console.error('No SendGrid API key found in secrets');
    throw new HttpsError('internal', 'SendGrid API key not configured.');
  }
  sgMail.setApiKey(sendGridKey);
  const msg = {
    to,
    from: 'info@rbaconnector.com',
    subject,
    html: body,
    trackingSettings: {
      clickTracking: { enable: true, enableText: true },
      openTracking: { enable: true },
    },
  };
  try {
    console.log('Attempting to send email via SendGrid:', msg);
    
    // Add email log with engagement tracking fields included
    const logRef = await db.collection('emailLogs').add({
      contactId: contactId || null,
      templateId: templateId || null,
      campaignId: null, // Always null for one-off emails
      status: 'sent',
      to,
      subject,
      body,
      sentBy: req.auth.uid,
      userId: req.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      oneOff: true,
      // Engagement tracking fields (will be updated by SendGrid webhook)
      opens: 0,
      clicks: 0,
      lastOpenedAt: null,
      lastClickedAt: null,
    });
    
    // Use SendGrid's native tracking - no need for custom pixels
    // SendGrid will handle open and click tracking automatically
    // and send events to our webhook endpoint
    
    await sgMail.send(msg);
    
    // Increment emailSentCount on contact
    if (contactId) {
      const contactRef = db.collection('contacts').doc(contactId);
      await contactRef.update({
        emailSentCount: admin.firestore.FieldValue.increment ? admin.firestore.FieldValue.increment(1) : 1
      });
    }
    // Increment sentCount on template
    if (templateId) {
      const templateRef = db.collection('emailTemplates').doc(templateId);
      await templateRef.update({
        sentCount: admin.firestore.FieldValue.increment ? admin.firestore.FieldValue.increment(1) : 1
      });
    }
    console.log('Email sent and logged successfully');
    return { success: true };
  } catch (error) {
    console.error('Error sending email or logging to Firestore:', error);
    await db.collection('emailLogs').add({
      contactId: contactId || null,
      templateId: templateId || null,
      campaignId: null, // Always null for one-off emails
      status: 'error',
      to,
      subject,
      error: error.message,
      sentBy: req.auth.uid,
      userId: req.auth.uid, // Ensure userId is always present
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      oneOff: true,
      // Engagement tracking fields for consistency
      opens: 0,
      clicks: 0,
      lastOpenedAt: null,
      lastClickedAt: null,
    });
    throw new HttpsError('internal', error.message);
  }
});

const sgMail = require('@sendgrid/mail');

// DEPRECATED: sendCampaignEmails has been replaced by processCampaignEmails and processOneOffEmails
// This entire function has been commented out to prevent conflicts
/*
exports.sendCampaignEmails = onSchedule({ schedule: 'every 1 minutes' }, async (event) => {
  console.log('[sendCampaignEmails] DEPRECATED - This function is replaced by processCampaignEmails and processOneOffEmails');
  console.log('[sendCampaignEmails] Disabling to prevent conflicts with new separated functions');
  return; // Disable this function
  
  console.log('[sendCampaignEmails] Running at', new Date().toISOString());
  
  const sendGridKey = process.env.SENDGRID_API_KEY;
  if (!sendGridKey) {
    console.error('[sendCampaignEmails] No SendGrid API key found in environment variables');
    return;
  }
  sgMail.setApiKey(sendGridKey);
  const now = admin.firestore.Timestamp.now();
  // Query for scheduled emails that are due and pending
  const scheduledSnap = await db.collection('scheduledEmails')
    .where('scheduledFor', '<=', now)
    .where('status', '==', 'pending')
    .get();
  for (const doc of scheduledSnap.docs) {
    const scheduled = doc.data();
    try {
      // Fetch contact email and info if not present
      let to = scheduled.to;
      let contact = null;
      if (scheduled.contactId) {
        const contactSnap = await db.collection('contacts').doc(scheduled.contactId).get();
        if (contactSnap.exists) {
          contact = contactSnap.data();
          if (!to) to = contact.email;
        }
      }
      if (!to) {
        throw new Error('No recipient email found for scheduled email');
      }
      // Fetch current promotion from settings (singleton doc)
      let currentPromotion = '';
      try {
        const promoSnap = await db.collection('settings').doc('currentPromotion').get();
        if (promoSnap.exists) {
          const promo = promoSnap.data();
          // Use name + (optional) description for merge
          currentPromotion = promo.name || '';
          if (promo.description) currentPromotion += `: ${promo.description}`;
        }
      } catch (e) {
        console.warn('Could not fetch current promotion:', e);
      }
      // Mail merge replacements
      function doMerge(str) {
        if (!str || !contact) return str;
        return str
          .replace(/\{\{firstName\}\}/gi, contact.firstName || '')
          .replace(/\{\{lastName\}\}/gi, contact.lastName || '')
          .replace(/\{\{quoteAmount\}\}/gi, contact.quoteAmount || '')
          .replace(/\{\{repName\}\}/gi, contact.salesRep || '')
          .replace(/\{\{appointmentDate\}\}/gi, contact.appointmentDate ? (contact.appointmentDate.seconds ? new Date(contact.appointmentDate.seconds * 1000).toLocaleDateString() : new Date(contact.appointmentDate).toLocaleDateString()) : '')
          .replace(/\{\{lastContacted\}\}/gi, contact.lastCustomerContact ? (contact.lastCustomerContact.seconds ? new Date(contact.lastCustomerContact.seconds * 1000).toLocaleDateString() : new Date(contact.lastCustomerContact).toLocaleDateString()) : '')
          .replace(/\{\{signature\}\}/gi, contact.signature || '')
          .replace(/\{\{unsubscribeLink\}\}/gi, '<a href="https://rbaconnector.com/unsubscribe?email=' + encodeURIComponent(to) + '">Unsubscribe</a>')
          .replace(/\{\{currentPromotion\}\}/gi, currentPromotion || '');
      }
      // Format body: replace newlines with <br>
      let mergedSubject = doMerge(scheduled.subject);
      let mergedBody = doMerge(scheduled.body);
      mergedBody = mergedBody.replace(/\n/g, '<br>');
      
      // Log to emailLogs first to get logId for tracking
      const logRef = await db.collection('emailLogs').add({
        scheduledEmailId: doc.id,
        campaignId: scheduled.campaignId || null,
        contactId: scheduled.contactId || null,
        userId: scheduled.userId,
        subject: mergedSubject,
        to,
        body: mergedBody,
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(), // For consistency
        // Engagement tracking fields
        opens: 0,
        clicks: 0,
        lastOpenedAt: null,
        lastClickedAt: null,
      });
      
      // Use SendGrid's native tracking
      await sgMail.send({
        to,
        from: 'info@rbaconnector.com',
        subject: mergedSubject,
        html: mergedBody,
        trackingSettings: {
          clickTracking: { enable: true, enableText: true },
          openTracking: { enable: true },
        },
      });
      // Update scheduledEmails status
      await doc.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Update currentStep in campaignEnrollments
      if (scheduled.campaignEnrollmentId) {
        const enrollmentRef = db.collection('campaignEnrollments').doc(scheduled.campaignEnrollmentId);
        
        // Handle stepIndex properly - if it's null (due to bug), we need a fallback
        let currentStepIndex = scheduled.stepIndex;
        
        if (typeof currentStepIndex !== 'number') {
          // Fallback: Query existing emails to determine step
          console.log(`[processCampaignEmails] Warning: stepIndex is ${currentStepIndex}, calculating from existing emails`);
          
          const existingEmailsSnapshot = await db.collection('emailLogs')
            .where('campaignEnrollmentId', '==', scheduled.campaignEnrollmentId)
            .where('status', 'in', ['sent', 'delivered'])
            .get();
          
          currentStepIndex = existingEmailsSnapshot.docs.length; // Current count becomes the step index
          console.log(`[processCampaignEmails] Calculated stepIndex as ${currentStepIndex} based on ${existingEmailsSnapshot.docs.length} sent emails`);
        }
        
        // Get total steps for this campaign
        let totalSteps = null;
        if (scheduled.campaignId) {
          const campaignSnap = await db.collection('campaigns').doc(scheduled.campaignId).get();
          if (campaignSnap.exists) {
            const campaign = campaignSnap.data();
            totalSteps = Array.isArray(campaign.steps) ? campaign.steps.length : null;
          }
        }
        
        // Calculate new currentStep
        const newCurrentStep = currentStepIndex + 1;
        
        // If this was the last step, mark as completed
        if (totalSteps !== null && newCurrentStep >= totalSteps) {
          await enrollmentRef.update({ 
            currentStep: newCurrentStep, 
            status: 'completed', 
            statusMessage: 'Campaign completed' 
          });
          console.log(`[processCampaignEmails] Campaign completed for enrollment ${scheduled.campaignEnrollmentId}, set currentStep to ${newCurrentStep}`);
        } else {
          await enrollmentRef.update({ currentStep: newCurrentStep });
          console.log(`[processCampaignEmails] Updated currentStep to ${newCurrentStep} for enrollment ${scheduled.campaignEnrollmentId}`);
        }
      }
    } catch (error) {
      await doc.ref.update({
        status: 'failed',
        error: error.message,
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('emailLogs').add({
        scheduledEmailId: doc.id,
        campaignId: scheduled.campaignId || null,
        contactId: scheduled.contactId || null,
        userId: scheduled.userId,
        subject: scheduled.subject,
        to: scheduled.to || null,
        status: 'failed',
        error: error.message,
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        // Engagement tracking fields for consistency
        opens: 0,
        clicks: 0,
        lastOpenedAt: null,
        lastClickedAt: null,
      });
    }
  }
});
*/

// NEW APPROACH: Separate processors for different email types

// Process campaign emails - handles emails with campaignId
exports.processCampaignEmails = onSchedule({
  schedule: '* * * * *',
  secrets: [sendGridApiKey]
}, async (context) => {
  console.log('[processCampaignEmails] Running at', new Date().toISOString());
  
  try {
    const now = new Date();
    
    // Query specifically for campaign emails (have campaignId)
    const snapshot = await db.collection('scheduledEmails')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .where('campaignId', '!=', null) // Only campaign emails
      .limit(25) // Process up to 25 campaign emails per run
      .get();
    
    console.log('[processCampaignEmails] Found', snapshot.size, 'campaign emails ready to send');
    
    if (snapshot.empty) {
      return;
    }
    
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const email = doc.data();
      const emailId = doc.id;
      
      try {
        console.log('[processCampaignEmails] Processing campaign email', emailId, 'to', email.to);
        
        // Fetch contact for mail merge if contactId exists
        let contact = null;
        let to = email.to;
        
        if (email.contactId) {
          const contactSnap = await db.collection('contacts').doc(email.contactId).get();
          if (contactSnap.exists) {
            contact = contactSnap.data();
            if (!to && contact.email) to = contact.email;
          }
        }
        
        if (!to) {
          throw new Error('No recipient email found for campaign email');
        }
        
        // Fetch current promotion from settings (singleton doc)
        let currentPromotion = '';
        try {
          const promoSnap = await db.collection('settings').doc('currentPromotion').get();
          if (promoSnap.exists) {
            const promo = promoSnap.data();
            // Use name + (optional) description for merge
            currentPromotion = promo.name || '';
            if (promo.description) currentPromotion += `: ${promo.description}`;
          }
        } catch (e) {
          console.warn('[processCampaignEmails] Could not fetch current promotion:', e);
        }
        
        // Mail merge replacements
        function doMerge(str) {
          if (!str) return str;
          if (!contact) return str;
          return str
            .replace(/\{\{firstName\}\}/gi, contact.firstName || '')
            .replace(/\{\{lastName\}\}/gi, contact.lastName || '')
            .replace(/\{\{quoteAmount\}\}/gi, contact.quoteAmount || '')
            .replace(/\{\{repName\}\}/gi, contact.salesRep || '')
            .replace(/\{\{appointmentDate\}\}/gi, contact.appointmentDate ? (contact.appointmentDate.seconds ? new Date(contact.appointmentDate.seconds * 1000).toLocaleDateString() : new Date(contact.appointmentDate).toLocaleDateString()) : '')
            .replace(/\{\{lastContacted\}\}/gi, contact.lastCustomerContact ? (contact.lastCustomerContact.seconds ? new Date(contact.lastCustomerContact.seconds * 1000).toLocaleDateString() : new Date(contact.lastCustomerContact).toLocaleDateString()) : '')
            .replace(/\{\{signature\}\}/gi, contact.signature || '')
            .replace(/\{\{unsubscribeLink\}\}/gi, `<a href="https://us-central1-dc-power-connector.cloudfunctions.net/publicUnsubscribe?email=${encodeURIComponent(to)}">Unsubscribe</a>`)
            .replace(/\{\{currentPromotion\}\}/gi, currentPromotion || '');
        }
        
        // Apply mail merge and format body
        let mergedSubject = doMerge(email.subject);
        let mergedBody = doMerge(email.body);
        
        // Format body: replace newlines with <br> for HTML email
        mergedBody = mergedBody.replace(/\n/g, '<br>');
        
        // Send the email via SendGrid
        const sgMail = require('@sendgrid/mail');
        const sendGridKey = sendGridApiKey.value();
        
        if (!sendGridKey) {
          console.error('[processCampaignEmails] No SendGrid API key found');
          batch.update(doc.ref, {
            status: 'failed',
            error: 'No SendGrid API key configured',
            failedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          continue;
        }
        
        sgMail.setApiKey(sendGridKey);
        
        const msg = {
          to,
          from: 'info@rbaconnector.com',
          subject: mergedSubject,
          html: mergedBody,
          trackingSettings: {
            clickTracking: { enable: true, enableText: true },
            openTracking: { enable: true },
          },
        };
        
        await sgMail.send(msg);
        console.log('[processCampaignEmails] Sent campaign email', emailId, 'to', to);
        
        // Create email log for campaign email
        await db.collection('emailLogs').add({
          contactId: email.contactId || null,
          templateId: email.templateId || null,
          campaignId: email.campaignId, // Required for campaign emails
          campaignEnrollmentId: email.campaignEnrollmentId || null,
          stepIndex: typeof email.stepIndex === 'number' ? email.stepIndex : null,
          status: 'sent',
          to,
          subject: mergedSubject,
          body: mergedBody,
          sentBy: email.userId,
          userId: email.userId,
          scheduledEmailId: emailId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          emailType: 'campaign',
          oneOff: false,
          public: false,
          // Engagement tracking fields
          opens: 0,
          clicks: 0,
          lastOpenedAt: null,
          lastClickedAt: null,
        });
        
        console.log('[processCampaignEmails] Campaign email log created successfully for', emailId);
        
        // Update currentStep in campaignEnrollments
        if (email.campaignEnrollmentId) {
          const enrollmentRef = db.collection('campaignEnrollments').doc(email.campaignEnrollmentId);
          
          // Handle stepIndex properly - if it's null (due to bug), we need a fallback
          let currentStepIndex = email.stepIndex;
          
          if (typeof currentStepIndex !== 'number') {
            // Fallback: Query existing emails to determine step
            console.log(`[processCampaignEmails] Warning: stepIndex is ${currentStepIndex}, calculating from existing emails`);
            
            const existingEmailsSnapshot = await db.collection('emailLogs')
              .where('campaignEnrollmentId', '==', email.campaignEnrollmentId)
              .where('status', 'in', ['sent', 'delivered'])
              .get();
            
            currentStepIndex = existingEmailsSnapshot.docs.length; // Current count becomes the step index
            console.log(`[processCampaignEmails] Calculated stepIndex as ${currentStepIndex} based on ${existingEmailsSnapshot.docs.length} sent emails`);
          }
          
          // Get total steps for this campaign
          let totalSteps = null;
          if (email.campaignId) {
            const campaignSnap = await db.collection('campaigns').doc(email.campaignId).get();
            if (campaignSnap.exists) {
              const campaign = campaignSnap.data();
              totalSteps = Array.isArray(campaign.steps) ? campaign.steps.length : null;
            }
          }
          
          // Calculate new currentStep
          const newCurrentStep = currentStepIndex + 1;
          
          // If this was the last step, mark as completed
          if (totalSteps !== null && newCurrentStep >= totalSteps) {
            await enrollmentRef.update({ 
              currentStep: newCurrentStep, 
              status: 'completed', 
              statusMessage: 'Campaign completed' 
            });
            console.log(`[processCampaignEmails] Campaign completed for enrollment ${email.campaignEnrollmentId}, set currentStep to ${newCurrentStep}`);
          } else {
            await enrollmentRef.update({ currentStep: newCurrentStep });
            console.log(`[processCampaignEmails] Updated currentStep to ${newCurrentStep} for enrollment ${email.campaignEnrollmentId}`);
          }
        }
        
        // Mark scheduled email as sent
        batch.update(doc.ref, {
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
      } catch (error) {
        console.error('[processCampaignEmails] Error sending campaign email', emailId, error);
        
        // Mark as failed
        batch.update(doc.ref, {
          status: 'failed',
          error: error.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    // Commit all status updates
    await batch.commit();
    console.log('[processCampaignEmails] Processed', snapshot.size, 'campaign emails');
    
  } catch (error) {
    console.error('[processCampaignEmails] Error:', error);
  }
});

// Process one-off emails - handles simple emails without campaigns
exports.processOneOffEmails = onSchedule({
  schedule: '* * * * *',
  secrets: [sendGridApiKey]
}, async (context) => {
  console.log('[processOneOffEmails] Running at', new Date().toISOString());
  
  try {
    const now = new Date();
    
    // Query specifically for one-off emails (type = 'oneoff' OR campaignId is null)
    const snapshot = await db.collection('scheduledEmails')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .where('type', '==', 'oneoff') // Only one-off emails
      .limit(25) // Process up to 25 one-off emails per run
      .get();
    
    console.log('[processOneOffEmails] Found', snapshot.size, 'one-off emails ready to send');
    
    if (snapshot.empty) {
      return;
    }
    
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const email = doc.data();
      const emailId = doc.id;
      
      try {
        console.log('[processOneOffEmails] Processing one-off email', emailId, 'to', email.to);
        
        // Fetch contact for mail merge if contactId exists
        let contact = null;
        let to = email.to;
        
        if (email.contactId) {
          const contactSnap = await db.collection('contacts').doc(email.contactId).get();
          if (contactSnap.exists) {
            contact = contactSnap.data();
            if (!to && contact.email) to = contact.email;
          }
        }
        
        if (!to) {
          throw new Error('No recipient email found for one-off email');
        }
        
        // Fetch current promotion from settings (singleton doc)
        let currentPromotion = '';
        try {
          const promoSnap = await db.collection('settings').doc('currentPromotion').get();
          if (promoSnap.exists) {
            const promo = promoSnap.data();
            // Use name + (optional) description for merge
            currentPromotion = promo.name || '';
            if (promo.description) currentPromotion += `: ${promo.description}`;
          }
        } catch (e) {
          console.warn('[processOneOffEmails] Could not fetch current promotion:', e);
        }
        
        // Mail merge replacements
        function doMerge(str) {
          if (!str) return str;
          if (!contact) return str;
          return str
            .replace(/\{\{firstName\}\}/gi, contact.firstName || '')
            .replace(/\{\{lastName\}\}/gi, contact.lastName || '')
            .replace(/\{\{quoteAmount\}\}/gi, contact.quoteAmount || '')
            .replace(/\{\{repName\}\}/gi, contact.salesRep || '')
            .replace(/\{\{appointmentDate\}\}/gi, contact.appointmentDate ? (contact.appointmentDate.seconds ? new Date(contact.appointmentDate.seconds * 1000).toLocaleDateString() : new Date(contact.appointmentDate).toLocaleDateString()) : '')
            .replace(/\{\{lastContacted\}\}/gi, contact.lastCustomerContact ? (contact.lastCustomerContact.seconds ? new Date(contact.lastCustomerContact.seconds * 1000).toLocaleDateString() : new Date(contact.lastCustomerContact).toLocaleDateString()) : '')
            .replace(/\{\{signature\}\}/gi, contact.signature || '')
            .replace(/\{\{unsubscribeLink\}\}/gi, `<a href="https://us-central1-dc-power-connector.cloudfunctions.net/publicUnsubscribe?email=${encodeURIComponent(to)}">Unsubscribe</a>`)
            .replace(/\{\{currentPromotion\}\}/gi, currentPromotion || '');
        }
        
        // Apply mail merge and format body
        let mergedSubject = doMerge(email.subject);
        let mergedBody = doMerge(email.body);
        
        // Format body: replace newlines with <br> for HTML email
        mergedBody = mergedBody.replace(/\n/g, '<br>');
        
        // Send the email via SendGrid
        const sgMail = require('@sendgrid/mail');
        const sendGridKey = sendGridApiKey.value();
        
        if (!sendGridKey) {
          console.error('[processOneOffEmails] No SendGrid API key found');
          batch.update(doc.ref, {
            status: 'failed',
            error: 'No SendGrid API key configured',
            failedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          continue;
        }
        
        sgMail.setApiKey(sendGridKey);
        
        const msg = {
          to,
          from: 'info@rbaconnector.com',
          subject: mergedSubject,
          html: mergedBody,
          trackingSettings: {
            clickTracking: { enable: true, enableText: true },
            openTracking: { enable: true },
          },
        };
        
        await sgMail.send(msg);
        console.log('[processOneOffEmails] Sent one-off email', emailId, 'to', to);
        
        // Create email log for one-off email (simple, no campaign fields)
        await db.collection('emailLogs').add({
          contactId: email.contactId || null,
          templateId: email.templateId || null,
          campaignId: null, // Always null for one-off emails
          status: 'sent',
          to,
          subject: mergedSubject,
          body: mergedBody,
          sentBy: email.userId,
          userId: email.userId,
          scheduledEmailId: emailId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          emailType: 'oneoff',
          oneOff: true,
          type: 'oneoff',
          public: false,
          // Engagement tracking fields
          opens: 0,
          clicks: 0,
          lastOpenedAt: null,
          lastClickedAt: null,
        });
        
        console.log('[processOneOffEmails] One-off email log created successfully for', emailId);
        
        // Mark scheduled email as sent
        batch.update(doc.ref, {
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
      } catch (error) {
        console.error('[processOneOffEmails] Error sending one-off email', emailId, error);
        
        // Mark as failed
        batch.update(doc.ref, {
          status: 'failed',
          error: error.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    // Commit all status updates
    await batch.commit();
    console.log('[processOneOffEmails] Processed', snapshot.size, 'one-off emails');
    
  } catch (error) {
    console.error('[processOneOffEmails] Error:', error);
  }
});

// SendGrid webhook handler for tracking email events
exports.sendGridWebhook = onRequest({
  cors: true
}, async (req, res) => {
  try {
    console.log('[sendGridWebhook] Received webhook:', JSON.stringify(req.body, null, 2));
    
    if (!Array.isArray(req.body)) {
      console.error('[sendGridWebhook] Invalid webhook format - expected array');
      res.status(400).json({ error: 'Invalid webhook format' });
      return;
    }
    
    console.log(`[sendGridWebhook] Processing ${req.body.length} events`);
    
    for (const event of req.body) {
      try {
        const { email, event: eventType, timestamp, url } = event;
        console.log(`[sendGridWebhook] Processing ${eventType} for ${email}`);
        
        // Find corresponding email log
        const emailLogsQuery = db.collection('emailLogs')
          .where('to', '==', email)
          .orderBy('timestamp', 'desc')
          .limit(5);
        
        const emailLogsSnap = await emailLogsQuery.get();
        
        if (emailLogsSnap.empty) {
          console.log(`[sendGridWebhook] No email log found for ${email}`);
          continue;
        }
        
        // Update the most recent matching email log
        const emailLogDoc = emailLogsSnap.docs[0];
        const updateData = {};
        
        if (eventType === 'open') {
          updateData.opens = admin.firestore.FieldValue.increment(1);
          updateData.lastOpenedAt = admin.firestore.FieldValue.serverTimestamp();
        } else if (eventType === 'click') {
          updateData.clicks = admin.firestore.FieldValue.increment(1);
          updateData.lastClickedAt = admin.firestore.FieldValue.serverTimestamp();
          if (url) {
            updateData.lastClickedUrl = url;
          }
        }
        
        if (Object.keys(updateData).length > 0) {
          await emailLogDoc.ref.update(updateData);
          console.log(`[sendGridWebhook] Updated email log for ${email} with ${eventType}`);
          
          // Update contact heat score if contactId exists
          const emailLogData = emailLogDoc.data();
          if (emailLogData.contactId) {
            try {
              await updateContactHeatScore(emailLogData.contactId, eventType);
              console.log(`[sendGridWebhook] Updated contact heat score for ${emailLogData.contactId}`);
            } catch (heatScoreError) {
              console.error('[sendGridWebhook] Error updating contact heat score:', heatScoreError);
            }
          }
        }
        
      } catch (eventError) {
        console.error('[sendGridWebhook] Error processing event:', eventError);
      }
    }
    
    res.status(200).json({ message: `Processing ${req.body.length} events` });
    
  } catch (error) {
    console.error('[sendGridWebhook] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test function for SendGrid webhook
exports.testSendGridWebhook = onCall(async (req) => {
  console.log('[testSendGridWebhook] Testing webhook functionality');
  
  // Simulate a webhook event
  const testEvent = [{
    email: 'test@example.com',
    event: 'open',
    timestamp: Math.floor(Date.now() / 1000)
  }];
  
  return { 
    success: true, 
    message: 'Webhook test completed',
    testEvent 
  };
});

// Debug function to check SendGrid configuration from all sources
exports.debugSendGridConfig = onCall({
  secrets: [sendGridApiKey]
}, async (req) => {
  console.log('[debugSendGridConfig] Checking SendGrid configuration...');
  
  if (!req.auth || !req.auth.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  
  const config = {
    sources: {},
    found: false,
    workingSource: null
  };
  
  // Check Firebase secret
  try {
    const secretKey = sendGridApiKey.value();
    if (secretKey) {
      config.sources['Firebase Secret (SENDGRID_API_KEY)'] = 'Found (length: ' + secretKey.length + ')';
      config.found = true;
      config.workingSource = 'Firebase Secret (SENDGRID_API_KEY)';
    } else {
      config.sources['Firebase Secret (SENDGRID_API_KEY)'] = 'Not found';
    }
  } catch (error) {
    config.sources['Firebase Secret (SENDGRID_API_KEY)'] = 'Error: ' + error.message;
  }
  
  // Check process.env.SENDGRID_API_KEY (legacy)
  if (process.env.SENDGRID_API_KEY) {
    config.sources['process.env.SENDGRID_API_KEY (legacy)'] = 'Found (length: ' + process.env.SENDGRID_API_KEY.length + ')';
  } else {
    config.sources['process.env.SENDGRID_API_KEY (legacy)'] = 'Not found';
  }
  
  // Check functions.config().sendgrid.key
  try {
    const firebaseConfig = functions.config();
    if (firebaseConfig.sendgrid && firebaseConfig.sendgrid.key) {
      config.sources['functions.config().sendgrid.key'] = 'Found (length: ' + firebaseConfig.sendgrid.key.length + ')';
      if (!config.found) {
        config.found = true;
        config.workingSource = 'functions.config().sendgrid.key';
      }
    } else {
      config.sources['functions.config().sendgrid.key'] = 'Not found';
    }
  } catch (e) {
    config.sources['functions.config().sendgrid.key'] = 'Error: ' + e.message;
  }
  
  return {
    success: true,
    config
  };
});

// Manual trigger for testing scheduled email processing (both types)
exports.processScheduledEmailsNow = onCall({
  secrets: [sendGridApiKey]
}, async (req) => {
  console.log('[processScheduledEmailsNow] Manual trigger called');
  
  if (!req.auth || !req.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in');
  }
  
  try {
    const now = new Date();
    
    // Query for emails that are ready to send (scheduledFor <= now AND status = 'pending')
    const snapshot = await db.collection('scheduledEmails')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .limit(10) // Limit for manual testing
      .get();
    
    console.log('[processScheduledEmailsNow] Found', snapshot.size, 'emails ready to send');
    
    if (snapshot.empty) {
      return { success: true, processed: 0, message: 'No emails ready to send' };
    }
    
    const batch = db.batch();
    let processed = 0;
    
    for (const doc of snapshot.docs) {
      const email = doc.data();
      const emailId = doc.id;
      
      try {
        console.log('[processScheduledEmailsNow] Processing email', emailId, 'to', email.to);
        
        // Send the email via SendGrid
        const sgMail = require('@sendgrid/mail');
        const sendGridKey = sendGridApiKey.value();
        
        if (!sendGridKey) {
          console.error('[processScheduledEmailsNow] No SendGrid API key found');
          batch.update(doc.ref, {
            status: 'failed',
            error: 'No SendGrid API key configured',
            failedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          continue;
        }
        
        sgMail.setApiKey(sendGridKey);
        
        const msg = {
          to: email.to,
          from: 'info@rbaconnector.com',
          subject: email.subject,
          html: email.body,
          trackingSettings: {
            clickTracking: { enable: true, enableText: true },
            openTracking: { enable: true },
          },
        };
        
        await sgMail.send(msg);
        console.log('[processScheduledEmailsNow] Sent email', emailId, 'to', email.to);
        
        // Determine email type and create appropriate log
        const isOneOff = email.type === 'oneoff' || !email.campaignId;
        
        if (isOneOff) {
          // Create email log for one-off email
          await db.collection('emailLogs').add({
            contactId: email.contactId || null,
            templateId: email.templateId || null,
            campaignId: null,
            status: 'sent',
            to: email.to,
            subject: email.subject,
            body: email.body,
            sentBy: email.userId,
            userId: email.userId,
            scheduledEmailId: emailId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            emailType: 'oneoff',
            oneOff: true,
            type: 'oneoff',
            public: false,
            // Engagement tracking fields
            opens: 0,
            clicks: 0,
            lastOpenedAt: null,
            lastClickedAt: null,
          });
        } else {
          // Create email log for campaign email
          await db.collection('emailLogs').add({
            contactId: email.contactId || null,
            templateId: email.templateId || null,
            campaignId: email.campaignId,
            campaignEnrollmentId: email.campaignEnrollmentId || null,
            stepIndex: typeof email.stepIndex === 'number' ? email.stepIndex : null,
            status: 'sent',
            to: email.to,
            subject: email.subject,
            body: email.body,
            sentBy: email.userId,
            userId: email.userId,
            scheduledEmailId: emailId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            emailType: 'campaign',
            oneOff: false,
            public: false,
            // Engagement tracking fields
            opens: 0,
            clicks: 0,
            lastOpenedAt: null,
            lastClickedAt: null,
          });
        }
        
        // Mark scheduled email as sent
        batch.update(doc.ref, {
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        processed++;
        
      } catch (error) {
        console.error('[processScheduledEmailsNow] Error sending email', emailId, error);
        
        // Mark as failed
        batch.update(doc.ref, {
          status: 'failed',
          error: error.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    // Commit all status updates
    await batch.commit();
    
    return { 
      success: true, 
      processed, 
      total: snapshot.size,
      message: `Processed ${processed} out of ${snapshot.size} emails` 
    };
    
  } catch (error) {
    console.error('[processScheduledEmailsNow] Error:', error);
    throw new HttpsError('internal', 'Failed to process scheduled emails: ' + error.message);
  }
});

// Campaign Management Functions

// Create scheduled emails for campaign enrollments
exports.createCampaignScheduledEmails = onCall(async (req) => {
  console.log('[createCampaignScheduledEmails] called with req.data:', JSON.stringify(req.data, null, 2));
  const { enrollmentIds, customDelaysByEnrollment, timezoneOffsetMinutes } = req.data;

  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    console.error('[createCampaignScheduledEmails] Invalid enrollmentIds:', enrollmentIds);
    throw new HttpsError('invalid-argument', 'enrollmentIds must be a non-empty array');
  }
  
  if (enrollmentIds.length > 100) {
    console.error('[createCampaignScheduledEmails] Too many enrollmentIds:', enrollmentIds.length);
    throw new HttpsError('invalid-argument', 'Cannot schedule more than 100 enrollments at once');
  }
  
  let scheduledCount = 0;
  
  for (const enrollmentId of enrollmentIds) {
    console.log(`[createCampaignScheduledEmails] Processing enrollmentId: ${enrollmentId}`);
    
    const enrollmentRef = db.collection('campaignEnrollments').doc(enrollmentId);
    const enrollmentSnap = await enrollmentRef.get();
    
    if (!enrollmentSnap.exists) {
      console.warn(`[createCampaignScheduledEmails] Enrollment not found: ${enrollmentId}`);
      continue;
    }
    
    const enrollment = enrollmentSnap.data();
    
    if (!enrollment.campaignId || !enrollment.userId || !enrollment.contactId) {
      console.warn(`[createCampaignScheduledEmails] Missing fields in enrollment:`, enrollment);
      continue;
    }
    
    const campaignRef = db.collection('campaigns').doc(enrollment.campaignId);
    const campaignSnap = await campaignRef.get();
    
    if (!campaignSnap.exists) {
      console.warn(`[createCampaignScheduledEmails] Campaign not found: ${enrollment.campaignId}`);
      continue;
    }
    
    const campaign = campaignSnap.data();
    const steps = Array.isArray(campaign.steps) ? campaign.steps : [];

    // IMPORTANT: Always use stepDelays from the enrollment document instead of customDelaysByEnrollment
    // because the enrollment document has the correct ISO timestamp format
    let stepDelays = null;
    
    if (enrollment.stepDelays && Array.isArray(enrollment.stepDelays)) {
      console.log(`[createCampaignScheduledEmails] Using stepDelays from enrollment document for ${enrollmentId}`);
      stepDelays = enrollment.stepDelays;
    } else if (customDelaysByEnrollment && customDelaysByEnrollment[enrollmentId]) {
      console.log(`[createCampaignScheduledEmails] Falling back to customDelaysByEnrollment for ${enrollmentId}`);
      stepDelays = customDelaysByEnrollment[enrollmentId];
    }

    if (!stepDelays || !Array.isArray(stepDelays) || stepDelays.length !== steps.length) {
      console.warn(`[createCampaignScheduledEmails] Mismatch between step count (${steps.length}) and delay count (${stepDelays?.length}) for enrollment ${enrollmentId}. Skipping.`);
      console.warn(`[createCampaignScheduledEmails] Available stepDelays:`, stepDelays);
      console.warn(`[createCampaignScheduledEmails] Enrollment data:`, enrollment);
      continue;
    }

    // Delete existing unsent scheduled emails for this enrollment
    const unsentSnap = await db.collection('scheduledEmails')
      .where('campaignEnrollmentId', '==', enrollmentId)
      .where('status', 'in', ['pending', 'scheduled'])
      .get();
    
    const batch = db.batch();
    unsentSnap.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Determine start date from the first element of stepDelays
    let startDate;
    const firstStepDelay = stepDelays[0];
    
    console.log(`[createCampaignScheduledEmails] DEBUGGING FIRST STEP DELAY:`, {
      firstStepDelay,
      unit: firstStepDelay?.unit,
      value: firstStepDelay?.value,
      valueType: typeof firstStepDelay?.value,
      time: firstStepDelay?.time
    });

    if (firstStepDelay && firstStepDelay.unit === 'custom' && firstStepDelay.value) {
      try {
        // The client now sends a full ISO 8601 string in `firstStepDelay.value`.
        // It's crucial to parse this directly to preserve the exact date and time.
        // No more manual construction or timezone math is needed.
        console.log(`[createCampaignScheduledEmails] Attempting to parse value: "${firstStepDelay.value}"`);
        startDate = new Date(firstStepDelay.value);
        console.log(`[createCampaignScheduledEmails] Parsed start date directly from client ISO string: ${startDate.toISOString()}`);
        console.log(`[createCampaignScheduledEmails] Local time: ${startDate.toLocaleString()}`);

        if (isNaN(startDate.getTime())) {
          throw new Error('Invalid date created from custom delay object value');
        }
      } catch (error) {
        console.warn(`[createCampaignScheduledEmails] Invalid custom delay object for step 0:`, { firstStepDelay, error: error.message });
        startDate = new Date(); // Fallback to now
      }
    } else {
      console.warn(`[createCampaignScheduledEmails] First step delay was not a valid custom object. Defaulting to now.`, { firstStepDelay });
      startDate = new Date(); // Fallback to now
    }

    // Only adjust time if it's significantly in the past (more than 1 hour)
    // This prevents overriding user-selected times that are just a few minutes in the past
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    const minFutureTime = new Date(now.getTime() + 30000); // 30s buffer
    
    if (startDate < oneHourAgo) {
      console.log(`[createCampaignScheduledEmails] Start date was significantly in the past (${startDate.toISOString()}). Adjusting to min future time: ${minFutureTime.toISOString()}`);
      startDate = minFutureTime;
    } else if (startDate < now) {
      console.log(`[createCampaignScheduledEmails] Start date was slightly in the past (${startDate.toISOString()}). Keeping user's time but adding small buffer.`);
      // Keep the user's date/time but add just enough to make it future
      startDate = new Date(startDate.getTime() + 60000); // Add 1 minute
    } else {
      console.log(`[createCampaignScheduledEmails] Start date is in the future: ${startDate.toISOString()}`);
    }

    let lastScheduled = startDate;
    const scheduledForLog = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let scheduledFor;

      if (i === 0) {
        scheduledFor = lastScheduled; // Use the calculated start date for the first step
        console.log(`[createCampaignScheduledEmails] STEP ${i}: Using start date directly: ${scheduledFor.toISOString()}`);
      } else {
        // For subsequent steps, calculate delay from the previous step
        let delay = stepDelays[i] || step.delay || { value: 1, unit: 'days' }; // Fallback

        // Ensure delay has valid values
        if (typeof delay.value !== 'number' || delay.value < 0) delay.value = 1;
        if (!['minutes', 'hours', 'days', 'weeks', 'months'].includes(delay.unit)) delay.unit = 'days';

        const delayMs = parseDelayToMs(delay);
        scheduledFor = new Date(lastScheduled.getTime() + delayMs);
        console.log(`[createCampaignScheduledEmails] STEP ${i}: Adding ${delay.value} ${delay.unit} to previous step: ${scheduledFor.toISOString()}`);
      }

      console.log(`[createCampaignScheduledEmails] STEP ${i} BEFORE rounding: ${scheduledFor.toISOString()}`);
      // Round to nearest second for Firestore compatibility
      scheduledFor = new Date(Math.round(scheduledFor.getTime() / 1000) * 1000);
      console.log(`[createCampaignScheduledEmails] STEP ${i} AFTER rounding: ${scheduledFor.toISOString()}`);

      let subject = step.subject || 'Campaign Email';
      let body = step.body || '';
      
      // Get template if specified
      if (step.templateId) {
        const templateSnap = await db.collection('emailTemplates').doc(step.templateId).get();
        if (templateSnap.exists) {
          const template = templateSnap.data();
          subject = template.subject || subject;
          body = template.body || body;
        }
      }
      
      // Ensure scheduledFor date is valid for Firestore (round to nearest second)
      const validScheduledFor = new Date(Math.round(scheduledFor.getTime() / 1000) * 1000);
      console.log(`[createCampaignScheduledEmails] STEP ${i} FINAL validScheduledFor: ${validScheduledFor.toISOString()}`);
      
      const scheduledEmail = {
        userId: enrollment.userId,
        contactId: enrollment.contactId,
        campaignId: enrollment.campaignId,
        campaignEnrollmentId: enrollmentId,
        stepIndex: i,
        templateId: step.templateId || null,
        subject,
        body,
        scheduledFor: admin.firestore.Timestamp.fromDate(validScheduledFor),
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: 'campaign' // Explicitly set type
      };

      const docRef = db.collection('scheduledEmails').doc();
      batch.set(docRef, scheduledEmail);
      scheduledForLog.push(scheduledFor.toISOString());
      lastScheduled = scheduledFor;
      scheduledCount++;
    }
    
    await batch.commit();
    console.log(`[createCampaignScheduledEmails] Scheduled emails for enrollmentId ${enrollmentId} at:`, scheduledForLog);
  }
  
  return { success: true, scheduledCount };
});

// Helper function to parse delay to milliseconds
function parseDelayToMs(delay) {
  const { value, unit } = delay;
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000 // Approximation
  };
  return value * (multipliers[unit] || multipliers.days);
}

// Withdraw from campaign enrollment
exports.withdrawCampaignEnrollment = onCall(async (req) => {
  if (!req.auth || !req.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in');
  }
  
  const { enrollmentId } = req.data;
  
  if (!enrollmentId) {
    throw new HttpsError('invalid-argument', 'enrollmentId is required');
  }
  
  try {
    // Update enrollment status
    await db.collection('campaignEnrollments').doc(enrollmentId).update({
      status: 'withdrawn',
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Delete unsent scheduled emails
    const unsentSnap = await db.collection('scheduledEmails')
      .where('campaignEnrollmentId', '==', enrollmentId)
      .where('status', '==', 'pending')
      .get();
    
    const batch = db.batch();
    unsentSnap.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    return { 
      success: true, 
      deleted: unsentSnap.size,
      message: `Withdrawn from campaign. ${unsentSnap.size} unsent emails deleted.`
    };
    
  } catch (error) {
    console.error('[withdrawCampaignEnrollment] Error:', error);
    throw new HttpsError('internal', 'Failed to withdraw from campaign: ' + error.message);
  }
});

// Public unsubscribe endpoint
exports.publicUnsubscribe = onRequest({
  cors: true
}, async (req, res) => {
  try {
    const { email, contactId } = req.query;
    
    if (!email && !contactId) {
      res.status(400).send('Email or contact ID required');
      return;
    }
    
    let query = db.collection('contacts');
    
    if (contactId) {
      query = query.where(admin.firestore.FieldPath.documentId(), '==', contactId);
    } else {
      query = query.where('email', '==', email);
    }
    
    const contactSnap = await query.get();
    
    if (contactSnap.empty) {
      res.status(404).send('Contact not found');
      return;
    }
    
    // Update all matching contacts
    const batch = db.batch();
    contactSnap.forEach(doc => {
      batch.update(doc.ref, {
        unsubscribed: true,
        unsubscribedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    
    res.status(200).send(`
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h2>✅ Successfully Unsubscribed</h2>
          <p>You have been unsubscribed from all future emails.</p>
          <p><small>If you continue to receive emails, please contact support.</small></p>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('[publicUnsubscribe] Error:', error);
    res.status(500).send('Internal server error');
  }
});

// Email engagement tracking endpoints
exports.logEmailOpen = onRequest({
  cors: true
}, async (req, res) => {
  try {
    const { emailId, contactId } = req.query;
    
    if (emailId) {
      await db.collection('emailLogs').doc(emailId).update({
        opens: admin.firestore.FieldValue.increment(1),
        lastOpenedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Return 1x1 transparent pixel
    res.set('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    
  } catch (error) {
    console.error('[logEmailOpen] Error:', error);
    res.status(200).send(); // Still return success to avoid broken images
  }
});

exports.logEmailClick = onRequest({
  cors: true
}, async (req, res) => {
  try {
    const { emailId, url, contactId } = req.query;
    
    if (emailId) {
      await db.collection('emailLogs').doc(emailId).update({
        clicks: admin.firestore.FieldValue.increment(1),
        lastClickedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastClickedUrl: url || null
      });
    }
    
    // Redirect to the original URL
    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.status(400).send('No URL provided');
    }
    
  } catch (error) {
    console.error('[logEmailClick] Error:', error);
    if (req.query.url) {
      res.redirect(decodeURIComponent(req.query.url));
    } else {
      res.status(500).send('Internal server error');
    }
  }
});

// Create a single scheduled email (for bulk actions)
exports.createScheduledEmail = onCall(async (req) => {
  console.log('[createScheduledEmail] called with req.data:', req.data);
  
  if (!req.auth || !req.auth.uid) {
    console.error('[createScheduledEmail] Unauthorized: No auth context');
    throw new HttpsError('unauthenticated', 'You must be signed in to schedule email.');
  }
  
  const { contactId, templateId, sendAt, to, subject, body } = req.data;
  
  if (!sendAt || !to || !subject || !body) {
    throw new HttpsError('invalid-argument', 'Missing required fields: sendAt, to, subject, body');
  }
  
  const scheduledDate = new Date(sendAt);
  
  if (isNaN(scheduledDate.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid sendAt date');
  }
  
  const scheduledEmail = {
    userId: req.auth.uid,
    contactId: contactId || null,
    templateId: templateId || null,
    to,
    subject,
    body,
    scheduledFor: admin.firestore.Timestamp.fromDate(scheduledDate),
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: 'oneoff'
  };
  
  const docRef = await db.collection('scheduledEmails').add(scheduledEmail);
  
  return {
    success: true,
    scheduledEmailId: docRef.id,
    scheduledFor: scheduledDate.toISOString()
  };
});

// Contact heat score update function
async function updateContactHeatScore(contactId, eventType) {
  const HEAT_SCORE_RULES = {
    'open': 3,
    'click': 5,
    'delivered': 1,
    'bounce': -20,
    'spamreport': -20,
    'unsubscribe': -10
  };

  try {
    const contactRef = db.collection('contacts').doc(contactId);
    const contactDoc = await contactRef.get();
    
    if (!contactDoc.exists) {
      console.log(`[updateContactHeatScore] Contact ${contactId} not found`);
      return;
    }

    const contact = contactDoc.data();
    const currentScore = contact.heatScore || 0;
    const scoreChange = HEAT_SCORE_RULES[eventType] || 0;
    
    // Calculate new score (keep between 0-100)
    const newScore = Math.max(0, Math.min(100, currentScore + scoreChange));
    
    // Determine category
    let category = 'Cold Lead';
    if (newScore >= 20) {
      category = 'Hot Lead';
    } else if (newScore >= 10) {
      category = 'Warm Lead';
    }
    
    // Update contact with new heat data
    const updateData = {
      heatScore: newScore,
      heatCategory: category,
      lastEngagement: admin.firestore.FieldValue.serverTimestamp(),
      lastEngagementEvent: eventType
    };

    await contactRef.update(updateData);
    console.log(`[updateContactHeatScore] Updated contact ${contactId}: ${currentScore} -> ${newScore} (${category})`);
    
  } catch (error) {
    console.error('[updateContactHeatScore] Error:', error);
    throw error;
  }
}

// =================
// AUTOMATION SYSTEM
// =================

/**
 * Cloud Function to process approved automation tasks
 * Runs every 5 minutes to check for approved tasks and execute them
 */
exports.processAutomationTasks = onSchedule({ schedule: 'every 5 minutes' }, async (event) => {
  console.log('[processAutomationTasks] Running automation task processor at', new Date().toISOString());
  
  try {
    // Query for approved tasks that haven't been executed yet
    const approvedTasksSnapshot = await db.collection('automationTasks')
      .where('status', '==', 'approved')
      .where('executedAt', '==', null)
      .get();

    if (approvedTasksSnapshot.empty) {
      console.log('[processAutomationTasks] No approved tasks to process');
      return null;
    }

    console.log(`[processAutomationTasks] Processing ${approvedTasksSnapshot.docs.length} approved tasks`);

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    // Process each approved task
    for (const taskDoc of approvedTasksSnapshot.docs) {
      const task = { id: taskDoc.id, ...taskDoc.data() };
      results.processed++;

      try {
        console.log(`[processAutomationTasks] Processing task: ${task.type} - ${task.title}`);

        // Handle different task types
        switch (task.type) {
          case 'campaign_assignment':
            await processCampaignAssignmentTask(task);
            break;
          
          case 'contact_tagging':
            await processContactTaggingTask(task);
            break;
          
          case 'status_update':
            await processStatusUpdateTask(task);
            break;
          
          default:
            throw new Error(`Unknown task type: ${task.type}`);
        }

        // Mark task as executed
        await db.collection('automationTasks').doc(task.id).update({
          status: 'executed',
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
          executionResult: {
            success: true,
            message: 'Task executed successfully'
          }
        });

        results.succeeded++;
        console.log(`[processAutomationTasks] Successfully executed task ${task.id}`);

      } catch (error) {
        console.error(`[processAutomationTasks] Error executing task ${task.id}:`, error);
        
        // Mark task as failed
        await db.collection('automationTasks').doc(task.id).update({
          status: 'failed',
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
          executionResult: {
            success: false,
            error: error.message || 'Unknown error'
          }
        });

        results.failed++;
        results.errors.push({
          taskId: task.id,
          error: error.message || 'Unknown error'
        });
      }
    }

    console.log(`[processAutomationTasks] Completed processing. Results:`, results);
    return results;

  } catch (error) {
    console.error('[processAutomationTasks] Fatal error:', error);
    throw error;
  }
});

/**
 * Process campaign assignment automation task
 */
async function processCampaignAssignmentTask(task) {
  const { campaignId, contactIds } = task.executionData || {};
  
  if (!campaignId || !contactIds || !Array.isArray(contactIds)) {
    throw new Error('Invalid campaign assignment task data');
  }

  console.log(`[processCampaignAssignmentTask] Enrolling ${contactIds.length} contacts in campaign ${campaignId}`);

  const enrollmentResults = {
    enrolled: 0,
    skipped: 0,
    errors: []
  };

  // Create campaign enrollments for each contact
  for (const contactId of contactIds) {
    try {
      // Check if contact is already enrolled
      const existingEnrollmentSnapshot = await db.collection('campaignEnrollments')
        .where('userId', '==', task.userId)
        .where('campaignId', '==', campaignId)
        .where('contactId', '==', contactId)
        .where('status', 'in', ['active', 'pending'])
        .get();

      if (!existingEnrollmentSnapshot.empty) {
        console.log(`[processCampaignAssignmentTask] Contact ${contactId} already enrolled in campaign ${campaignId}`);
        enrollmentResults.skipped++;
        continue;
      }

      // Create new enrollment
      const enrollmentData = {
        userId: task.userId,
        campaignId: campaignId,
        contactId: contactId,
        status: 'active',
        currentStep: 0,
        enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
        enrolledBy: 'automation_system',
        automationTaskId: task.id,
        source: 'automated_recommendation'
      };

      await db.collection('campaignEnrollments').add(enrollmentData);
      enrollmentResults.enrolled++;
      
      console.log(`[processCampaignAssignmentTask] Successfully enrolled contact ${contactId}`);

    } catch (error) {
      console.error(`[processCampaignAssignmentTask] Error enrolling contact ${contactId}:`, error);
      enrollmentResults.errors.push({
        contactId,
        error: error.message
      });
    }
  }

  // Update task with execution results
  await db.collection('automationTasks').doc(task.id).update({
    executionResult: enrollmentResults
  });

  console.log(`[processCampaignAssignmentTask] Campaign assignment completed:`, enrollmentResults);
  return enrollmentResults;
}

/**
 * Process contact tagging automation task
 */
async function processContactTaggingTask(task) {
  const { contactIds, tags, action } = task.executionData || {};
  
  if (!contactIds || !Array.isArray(contactIds) || !tags || !Array.isArray(tags)) {
    throw new Error('Invalid contact tagging task data');
  }

  console.log(`[processContactTaggingTask] ${action} tags [${tags.join(', ')}] for ${contactIds.length} contacts`);

  const batch = db.batch();
  let processedCount = 0;

  for (const contactId of contactIds) {
    try {
      const contactRef = db.collection('contacts').doc(contactId);
      const contactDoc = await contactRef.get();
      
      if (!contactDoc.exists) {
        console.warn(`[processContactTaggingTask] Contact ${contactId} not found`);
        continue;
      }

      const contactData = contactDoc.data();
      let currentTags = contactData.tags || [];

      if (action === 'add') {
        // Add new tags (avoid duplicates)
        tags.forEach(tag => {
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
          }
        });
      } else if (action === 'remove') {
        // Remove specified tags
        currentTags = currentTags.filter(tag => !tags.includes(tag));
      }

      batch.update(contactRef, { 
        tags: currentTags,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      processedCount++;

    } catch (error) {
      console.error(`[processContactTaggingTask] Error processing contact ${contactId}:`, error);
    }
  }

  if (processedCount > 0) {
    await batch.commit();
  }

  console.log(`[processContactTaggingTask] Successfully processed ${processedCount} contacts`);
  return { processedCount };
}

/**
 * Process status update automation task
 */
async function processStatusUpdateTask(task) {
  const { contactIds, newStatus, reason } = task.executionData || {};
  
  if (!contactIds || !Array.isArray(contactIds) || !newStatus) {
    throw new Error('Invalid status update task data');
  }

  console.log(`[processStatusUpdateTask] Updating status to "${newStatus}" for ${contactIds.length} contacts`);

  const batch = db.batch();
  let processedCount = 0;

  for (const contactId of contactIds) {
    try {
      const contactRef = db.collection('contacts').doc(contactId);
      
      batch.update(contactRef, {
        status: newStatus,
        statusUpdateReason: reason || 'Automated status update',
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusUpdatedBy: 'automation_system'
      });
      
      processedCount++;

    } catch (error) {
      console.error(`[processStatusUpdateTask] Error processing contact ${contactId}:`, error);
    }
  }

  if (processedCount > 0) {
    await batch.commit();
  }

  console.log(`[processStatusUpdateTask] Successfully processed ${processedCount} contacts`);
  return { processedCount };
}

/**
 * Cloud Function to generate daily automation recommendations
 * Runs once per day to analyze contacts and suggest campaign enrollments
 */
exports.generateDailyRecommendations = onSchedule({ schedule: 'every day 09:00' }, async (event) => {
  console.log('[generateDailyRecommendations] Running daily recommendation generator at', new Date().toISOString());
  
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('[generateDailyRecommendations] No users found');
      return null;
    }

    const results = {
      usersProcessed: 0,
      recommendationsGenerated: 0,
      tasksCreated: 0,
      errors: []
    };

    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      
      try {
        console.log(`[generateDailyRecommendations] Processing user ${userId}`);
        
        const recommendations = await generateCampaignRecommendationsForUser(userId);
        results.usersProcessed++;
        results.recommendationsGenerated += recommendations.length;

        // Create automation tasks for high-priority recommendations
        for (const recommendation of recommendations) {
          if (recommendation.priority === 'high' && 
              recommendation.suggestedCampaigns.length === 1 && 
              recommendation.contacts.length >= 3) {
            
            try {
              const taskData = {
                userId: userId,
                type: 'campaign_assignment',
                title: `Daily Recommendation: Enroll ${recommendation.contacts.length} ${recommendation.category} contacts`,
                description: `Automated daily recommendation to enroll ${recommendation.contacts.length} contacts in "${recommendation.suggestedCampaigns[0].name}" campaign.`,
                priority: 'medium', // Don't auto-approve high priority
                status: 'pending',
                
                executionData: {
                  campaignId: recommendation.suggestedCampaigns[0].id,
                  contactIds: recommendation.contacts.map(c => c.id),
                  enrollmentType: 'daily_recommendation',
                  category: recommendation.category
                },
                
                estimatedImpact: {
                  contactsAffected: recommendation.contacts.length,
                  campaignType: recommendation.suggestedCampaigns[0].purpose || 'Unknown',
                  expectedEngagement: 'Variable based on heat scores'
                },
                
                affectedContacts: recommendation.contacts.map(c => c.id),
                tags: ['daily_recommendation', 'campaign_enrollment'],
                notes: recommendation.reasoning,
                
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: 'daily_automation',
                triggerEvent: 'daily_analysis',
                automationRuleId: 'daily_recommendations'
              };

              await db.collection('automationTasks').add(taskData);
              results.tasksCreated++;
              
              console.log(`[generateDailyRecommendations] Created task for user ${userId}: ${recommendation.category}`);

            } catch (error) {
              console.error(`[generateDailyRecommendations] Error creating task for user ${userId}:`, error);
              results.errors.push({
                userId,
                error: error.message
              });
            }
          }
        }

      } catch (error) {
        console.error(`[generateDailyRecommendations] Error processing user ${userId}:`, error);
        results.errors.push({
          userId,
          error: error.message
        });
      }
    }

    console.log(`[generateDailyRecommendations] Completed daily recommendations:`, results);
    return results;

  } catch (error) {
    console.error('[generateDailyRecommendations] Fatal error:', error);
    throw error;
  }
});

/**
 * Generate campaign recommendations for a specific user
 */
async function generateCampaignRecommendationsForUser(userId) {
  // Heat score ranges for categorization
  const HEAT_SCORE_RANGES = {
    COLD: { min: 0, max: 9, category: 'Cold Lead - Spark Interest' },
    WARM: { min: 10, max: 19, category: 'Warm Lead - Nurture' },
    HOT: { min: 20, max: 29, category: 'Hot Lead - Convert' },
    CUSTOMER: { min: 30, max: 49, category: 'Customer - Retain/Upsell' },
    REACTIVATION: { min: -10, max: -1, category: 'Reactivation - Win Back' }
  };

  // Get user's contacts
  const contactsSnapshot = await db.collection('contacts')
    .where('userId', '==', userId)
    .get();
  
  const contacts = contactsSnapshot.docs.map(doc => ({ 
    id: doc.id, 
    ...doc.data(),
    heatScore: doc.data().heatScore || 0 
  }));

  // Get user's campaigns
  const campaignsSnapshot = await db.collection('campaigns')
    .where('userId', '==', userId)
    .get();
  
  const campaigns = campaignsSnapshot.docs.map(doc => ({ 
    id: doc.id, 
    ...doc.data() 
  }));

  // Get existing active enrollments
  const enrollmentsSnapshot = await db.collection('campaignEnrollments')
    .where('userId', '==', userId)
    .where('status', 'in', ['active', 'pending'])
    .get();
  
  const activeEnrollments = new Set();
  enrollmentsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    activeEnrollments.add(`${data.contactId}-${data.campaignId}`);
  });

  // Categorize contacts by heat score
  const contactsByCategory = {
    'Cold Lead - Spark Interest': [],
    'Warm Lead - Nurture': [],
    'Hot Lead - Convert': [],
    'Customer - Retain/Upsell': [],
    'Reactivation - Win Back': []
  };

  contacts.forEach(contact => {
    const heatScore = contact.heatScore || 0;
    
    for (const [key, range] of Object.entries(HEAT_SCORE_RANGES)) {
      if (heatScore >= range.min && heatScore <= range.max) {
        contactsByCategory[range.category].push(contact);
        break;
      }
    }
  });

  // Generate recommendations
  const recommendations = [];
  
  for (const [category, categoryContacts] of Object.entries(contactsByCategory)) {
    if (categoryContacts.length === 0) continue;

    // Find suitable campaigns for this category
    const suitableCampaigns = campaigns.filter(campaign => {
      const purpose = campaign.purpose || '';
      const name = campaign.name || '';
      const description = campaign.description || '';
      const searchText = `${purpose} ${name} ${description}`.toLowerCase();
      
      switch (category) {
        case 'Cold Lead - Spark Interest':
          return searchText.includes('cold') || searchText.includes('spark') || searchText.includes('interest');
        case 'Warm Lead - Nurture':
          return searchText.includes('warm') || searchText.includes('nurture') || searchText.includes('follow');
        case 'Hot Lead - Convert':
          return searchText.includes('hot') || searchText.includes('convert') || searchText.includes('close');
        case 'Customer - Retain/Upsell':
          return searchText.includes('customer') || searchText.includes('retain') || searchText.includes('upsell');
        case 'Reactivation - Win Back':
          return searchText.includes('reactivation') || searchText.includes('win back');
        default:
          return false;
      }
    });

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
        priority: category === 'Hot Lead - Convert' ? 'high' : availableContacts.length >= 10 ? 'high' : 'medium',
        reasoning: `${availableContacts.length} ${category.toLowerCase()} contacts identified for potential campaign enrollment.`
      });
    }
  }

  return recommendations;
}

// Import and export Zoho Admin Functions
const zohoFunctions = require('./zohoAdminFunctions');
const zohoDirectoryFunctions = require('./zoho-directory-functions');
module.exports = {
  ...module.exports,
  ...zohoFunctions,
  ...zohoDirectoryFunctions
};
