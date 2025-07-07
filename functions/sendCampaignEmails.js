// LEGACY LOGIC DISABLED: This file is no longer used. All campaign email scheduling and sending is now handled by campaignScheduledEmails logic in index.js.
//
// const admin = require('firebase-admin');
// const sgMail = require('@sendgrid/mail');
// const { onSchedule } = require('firebase-functions/v2/scheduler');
//
// admin.initializeApp();
// const db = admin.firestore();
//
// exports.sendCampaignEmails = onSchedule({schedule: 'every 24 hours'}, async (event) => {
//   try {
//     const functions = require('firebase-functions');
//     sgMail.setApiKey(functions.config().sendgrid.key);
//
//     // 1. Get all active campaign enrollments
//     const enrollmentsSnap = await db.collection('campaignEnrollments')
//       .where('status', '==', 'active')
//       .get();
//
//     console.log(`[sendCampaignEmails] Found ${enrollmentsSnap.size} active enrollments`);
//     if (enrollmentsSnap.size === 0) {
//       console.log('[sendCampaignEmails] No active enrollments found. Exiting.');
//       return;
//     }
//
//     // TEST UPDATE: Try to update a known enrollment to verify write access
//     try {
//       const testSnap = await db.collection('campaignEnrollments').limit(1).get();
//       if (!testSnap.empty) {
//         const testDoc = testSnap.docs[0];
//         await testDoc.ref.update({ statusMessage: `Test update at ${new Date().toISOString()}` });
//         console.log(`[TEST UPDATE] Successfully updated enrollment ${testDoc.id}`);
//       } else {
//         console.log('[TEST UPDATE] No enrollments found to test update.');
//       }
//     } catch (err) {
//       console.error('[TEST UPDATE] Firestore update failed:', err);
//     }
//
//     for (const enrollmentDoc of enrollmentsSnap.docs) {
//       const enrollmentId = enrollmentDoc.id;
//       try {
//         await db.runTransaction(async (transaction) => {
//           const enrollmentRef = db.collection('campaignEnrollments').doc(enrollmentId);
//           const freshSnap = await transaction.get(enrollmentRef);
//           if (!freshSnap.exists) {
//             console.log(`[ENROLLMENT ${enrollmentId}] Document no longer exists, skipping.`);
//             return;
//           }
//           const enrollment = freshSnap.data();
//           // Defensive: log full state
//           console.log(`[ENROLLMENT ${enrollmentId}] STATE:`, JSON.stringify(enrollment));
//           if (enrollment.status !== 'active') return;
//           const contactRef = db.collection('contacts').doc(enrollment.contactId);
//           const contactSnap = await transaction.get(contactRef);
//           if (!contactSnap.exists) return;
//           const contact = contactSnap.data();
//           if (!contact.email || contact.unsubscribed) return;
//           const campaignRef = db.collection('campaigns').doc(enrollment.campaignId);
//           const campaignSnap = await transaction.get(campaignRef);
//           if (!campaignSnap.exists) return;
//           const campaign = campaignSnap.data();
//
//           let stepIdx = typeof enrollment.currentStep === 'number' ? enrollment.currentStep : 0;
//           let lastStepSent = typeof enrollment.lastStepSent === 'number' ? enrollment.lastStepSent : null;
//           let waitingForNextStep = !!enrollment.waitingForNextStep;
//           let nextStepReadyAt = enrollment.nextStepReadyAt ? new Date(enrollment.nextStepReadyAt) : null;
//           const steps = Array.isArray(campaign.steps) ? campaign.steps : [];
//           console.log(`[ENROLLMENT ${enrollmentId}] START: currentStep=${stepIdx}, lastStepSent=${lastStepSent}, waitingForNextStep=${waitingForNextStep}, nextStepReadyAt=${nextStepReadyAt}`);
//
//           // 1. If waiting for next step, check if delay is over
//           if (waitingForNextStep) {
//             if (!nextStepReadyAt) {
//               console.warn(`[ENROLLMENT ${enrollmentId}] waitingForNextStep is true but nextStepReadyAt is missing. Resetting waiting state.`);
//               try {
//                 transaction.update(enrollmentRef, { waitingForNextStep: false, nextStepReadyAt: null, nextStepInSeconds: null });
//                 console.log(`[ENROLLMENT ${enrollmentId}] Cleared waiting state due to missing nextStepReadyAt.`);
//               } catch (err) {
//                 console.error(`[ENROLLMENT ${enrollmentId}] Error updating waiting state:`, err);
//               }
//               return;
//             } else {
//               const now = new Date();
//               if (now < nextStepReadyAt) {
//                 console.log(`[ENROLLMENT ${enrollmentId}] Still waiting for delay. now=${now.toISOString()}, nextStepReadyAt=${nextStepReadyAt.toISOString()}`);
//                 return;
//               } else {
//                 // Delay is over, advance step
//                 stepIdx += 1;
//                 let updateObj = {
//                   currentStep: stepIdx,
//                   waitingForNextStep: false,
//                   nextStepReadyAt: null,
//                   nextStepInSeconds: null,
//                   statusMessage: `Advanced to step ${stepIdx + 1}`
//                 };
//                 if (stepIdx >= steps.length) {
//                   updateObj.status = 'completed';
//                   updateObj.statusMessage = 'Campaign completed';
//                   console.log(`[ENROLLMENT ${enrollmentId}] Campaign completed at step ${stepIdx}`);
//                 } else {
//                   console.log(`[ENROLLMENT ${enrollmentId}] Delay over, advanced to step ${stepIdx}`);
//                 }
//                 try {
//                   transaction.update(enrollmentRef, updateObj);
//                   console.log(`[ENROLLMENT ${enrollmentId}] Transaction update after delay:`, updateObj);
//                 } catch (err) {
//                   console.error(`[ENROLLMENT ${enrollmentId}] Error updating after delay:`, err);
//                 }
//                 return;
//               }
//             }
//           }
//
//           // 2. If campaign is completed, skip
//           if (stepIdx >= steps.length) {
//             if (enrollment.status !== 'completed') {
//               try {
//                 transaction.update(enrollmentRef, { status: 'completed', statusMessage: 'Campaign completed (no more steps)' });
//                 console.log(`[ENROLLMENT ${enrollmentId}] Marked as completed (no more steps)`);
//               } catch (err) {
//                 console.error(`[ENROLLMENT ${enrollmentId}] Error marking as completed:`, err);
//               }
//             }
//             return;
//           }
//
//           // 3. Only send if not waiting and lastStepSent < currentStep
//           if (lastStepSent == null || lastStepSent < stepIdx) {
//             const step = steps[stepIdx];
//             if (!step) {
//               console.log(`[ENROLLMENT ${enrollmentId}] No step found at index ${stepIdx}, marking as completed.`);
//               transaction.update(enrollmentRef, { status: 'completed', statusMessage: 'Campaign completed (step missing)' });
//               return;
//             }
//             console.log(`[ENROLLMENT ${enrollmentId}] Preparing to send step ${stepIdx}:`, step);
//             // Get template
//             const templateSnap = await db.collection('emailTemplates').doc(step.templateId).get();
//             if (!templateSnap.exists) {
//               console.log(`[ENROLLMENT ${enrollmentId}] Template not found for step ${stepIdx}, skipping.`);
//               return;
//             }
//             const template = templateSnap.data();
//             // Prepare and send email (outside transaction)
//             try {
//               transaction.update(enrollmentRef, { statusMessage: `Step ${stepIdx + 1} sending...` });
//               console.log(`[ENROLLMENT ${enrollmentId}] Set statusMessage to sending.`);
//             } catch (err) {
//               console.error(`[ENROLLMENT ${enrollmentId}] Error setting statusMessage to sending:`, err);
//             }
//           }
//         });
//       } catch (err) {
//         console.error(`[ENROLLMENT ${enrollmentId}] Transaction failed:`, err);
//       }
//       // After transaction, check if we need to send the email (outside transaction)
//       const fresh = (await enrollmentDoc.ref.get()).data();
//       let stepIdx = typeof fresh.currentStep === 'number' ? fresh.currentStep : 0;
//       let lastStepSent = typeof fresh.lastStepSent === 'number' ? fresh.lastStepSent : null;
//       let waitingForNextStep = !!fresh.waitingForNextStep;
//       let nextStepReadyAt = fresh.nextStepReadyAt ? new Date(fresh.nextStepReadyAt) : null;
//       const campaignSnap = await db.collection('campaigns').doc(fresh.campaignId).get();
//       const campaign = campaignSnap.data();
//       const steps = Array.isArray(campaign.steps) ? campaign.steps : [];
//       if (!waitingForNextStep && (lastStepSent == null || lastStepSent < stepIdx) && stepIdx < steps.length) {
//         const step = steps[stepIdx];
//         const contactSnap = await db.collection('contacts').doc(fresh.contactId).get();
//         const contact = contactSnap.data();
//         const templateSnap = await db.collection('emailTemplates').doc(step.templateId).get();
//         if (!templateSnap.exists) {
//           console.log(`[ENROLLMENT ${enrollmentDoc.id}] Template not found for step ${stepIdx}, skipping.`);
//           continue;
//         }
//         const template = templateSnap.data();
//         const formatBody = (body) => body ? body.replace(/\n/g, '<br>') : '';
//         const msg = {
//           to: contact.email,
//           from: 'your_email@yourdomain.com',
//           subject: template.subject,
//           html: formatBody(template.body)
//             .replace('{{firstName}}', contact.firstName)
//             .replace('{{lastName}}', contact.lastName)
//             .replace('{{quoteAmount}}', contact.quoteAmount)
//             .replace('{{repName}}', contact.salesRep),
//         };
//         try {
//           await sgMail.send(msg);
//           await db.collection('emailLogs').add({
//             contactId: fresh.contactId,
//             campaignId: fresh.campaignId,
//             templateId: step.templateId,
//             status: 'sent',
//             timestamp: admin.firestore.FieldValue.serverTimestamp(),