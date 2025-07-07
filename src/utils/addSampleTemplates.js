// Script to add sample email templates to Firebase
// Run this in the browser console while logged in to your app

const addSampleTemplates = async () => {
  try {
    // Import the service
    const { createEmailTemplate, sampleEmailTemplates } = await import('./src/services/emailTemplates.js');
    
    console.log('Adding sample email templates...');
    
    for (const template of sampleEmailTemplates) {
      try {
        const result = await createEmailTemplate(template);
        console.log(`✅ Created template: "${template.name}" with ID: ${result.templateId}`);
      } catch (error) {
        console.error(`❌ Failed to create template: "${template.name}"`, error);
      }
    }
    
    console.log('✅ Finished adding sample templates');
  } catch (error) {
    console.error('❌ Error adding templates:', error);
  }
};

// To run this script:
// 1. Open your browser console
// 2. Make sure you're logged in to your app
// 3. Copy and paste this function
// 4. Run: addSampleTemplates()

export { addSampleTemplates };
