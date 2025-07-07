// Firebase Functions Shell Test Commands
// Copy and paste these commands one by one into the Firebase shell

// 1. Test the updated SendGrid webhook function
testSendGridWebhook()

// 2. Test sending an email with the updated tracking (replace with your email)
sendOneOffEmail({
  to: 'your-email@example.com',
  subject: 'Test Email with Updated Tracking - ' + new Date().toLocaleString(),
  body: `
    <h2>Testing Updated Email Tracking</h2>
    <p>This email tests the new simplified tracking system.</p>
    <p>Key changes:</p>
    <ul>
      <li>No more emailEngagements collection needed</li>
      <li>All tracking data stored in emailLogs</li>
      <li>Engagement fields: opens, clicks, timestamps</li>
    </ul>
    <p>Click this link to test click tracking: <a href="https://google.com">Test Link</a></p>
    <p>Sent at: ${new Date().toISOString()}</p>
  `,
  contactId: null,
  templateId: null
})

// 3. Test the webhook with sample data (simulates SendGrid sending events)
sendGridWebhook({
  body: [{
    event: 'open',
    email: 'test@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    sg_message_id: 'test-message-' + Date.now()
  }]
})

// 4. Test email open tracking (simulates tracking pixel being loaded)
logEmailOpen({
  query: { logId: 'test-log-id' }
})

// 5. Test email click tracking (simulates link being clicked)
logEmailClick({
  query: { 
    logId: 'test-log-id',
    url: 'https://example.com'
  }
})
