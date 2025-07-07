## Firebase Functions Shell Testing Guide

Your Firebase Functions shell is running! Here's how to test the updated email tracking system:

### 1. Test the SendGrid Webhook Function

In the Firebase shell, run:
```javascript
testSendGridWebhook()
```

This should return information about the webhook and sample events.

### 2. Send a Test Email with Updated Tracking

**Replace `your-email@example.com` with your actual email:**

```javascript
sendOneOffEmail({
  to: 'your-email@example.com',
  subject: 'Updated Tracking Test - ' + new Date().toLocaleString(),
  body: '<h2>Testing Updated Email Tracking</h2><p>This email uses the new simplified tracking system that stores all engagement data directly in emailLogs.</p><p>Click this link: <a href="https://google.com">Test Link</a></p>',
  contactId: null,
  templateId: null
})
```

### 3. Test the Updated SendGrid Webhook

Simulate SendGrid sending an open event:
```javascript
sendGridWebhook({
  body: [{
    event: 'open',
    email: 'test@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    sg_message_id: 'test-message-' + Date.now()
  }]
})
```

### 4. What to Check After Testing

1. **Check Firebase Console → Firestore → emailLogs collection**
   - Find your recent email log
   - Verify it has these NEW fields:
     - `opens: 0`
     - `clicks: 0`
     - `lastOpenedAt: null`
     - `lastClickedAt: null`

2. **Open the test email you sent yourself**
   - The tracking pixel should load
   - Check the emailLogs document again
   - `opens` should increment to 1
   - `lastOpenedAt` should have a timestamp
   - `status` should change to 'opened'

3. **Click a link in the email**
   - Check the emailLogs document again
   - `clicks` should increment to 1
   - `lastClickedAt` should have a timestamp
   - `status` should change to 'clicked'

4. **Check contacts collection**
   - Find your contact by email
   - `emailOpenCount` should increment
   - `emailClickCount` should increment (if you clicked)

### 5. Expected Console Output

When testing, you should see console logs like:
- `[sendGridWebhook] Processing X events`
- `[sendGridWebhook] Recording email open for test@example.com on email log [ID]`
- `[sendGridWebhook] Updated contact [ID] open count`
- `[sendGridWebhook] Updated email log [ID] for event: open`

### 6. Key Differences from Before

**OLD SYSTEM (broken):**
- Created separate `emailEngagements` collection
- SendGrid webhook looked for engagement records
- Failed because collection didn't exist

**NEW SYSTEM (fixed):**
- All tracking data stored directly in `emailLogs`
- SendGrid webhook updates `emailLogs` directly
- Works with your existing database structure
- No additional collections needed

### 7. Troubleshooting

If something doesn't work:
1. Check Firebase Functions logs in the console
2. Verify your email appears in `emailLogs` collection
3. Make sure the email log document has the engagement fields
4. Test both the tracking pixel (opens) and link clicks

The system should now work reliably with your existing `emailLogs` collection!
