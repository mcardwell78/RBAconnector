// Service to create email templates directly in Firestore
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { getAuth } from 'firebase/auth';

export async function createEmailTemplate(templateData) {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    throw new Error('No authenticated user');
  }
  
  const template = {
    ...templateData,
    userId: currentUser.uid,
    createdAt: serverTimestamp(),
    public: templateData.public || false
  };
  
  try {
    const docRef = await addDoc(collection(db, 'emailTemplates'), template);
    console.log('Created email template:', docRef.id);
    return { success: true, templateId: docRef.id };
  } catch (error) {
    console.error('Error creating email template:', error);
    throw error;
  }
}

// Predefined email templates
export const sampleEmailTemplates = [
  {
    name: "Holiday Window Maintenance Reminder",
    subject: "Winter Window Care: 3 Essential Tasks Before the Cold Sets In",
    body: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
    Winter Window Care: 3 Essential Tasks Before the Cold Sets In
  </h2>
  
  <p>Hi there,</p>
  
  <p>With winter approaching, now is the perfect time to prepare your windows and doors for the colder months ahead. Here are three essential maintenance tasks that can save you money on energy bills and prevent costly repairs:</p>
  
  <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-left: 4px solid #3498db;">
    <h3 style="color: #2c3e50; margin-top: 0;">🔧 1. Check and Replace Weather Stripping</h3>
    <p>Damaged weather stripping can increase your heating costs by up to 30%. Take a few minutes to inspect the seals around your windows and doors.</p>
  </div>
  
  <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-left: 4px solid #e74c3c;">
    <h3 style="color: #2c3e50; margin-top: 0;">🧽 2. Clean and Lubricate Hardware</h3>
    <p>Clean window tracks and lubricate hinges, locks, and handles to ensure smooth operation throughout winter.</p>
  </div>
  
  <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-left: 4px solid #f39c12;">
    <h3 style="color: #2c3e50; margin-top: 0;">🔍 3. Inspect for Damage</h3>
    <p>Look for cracks in glass, damaged frames, or gaps that could let in cold air and moisture.</p>
  </div>
  
  <p style="margin-top: 30px;">Need help with any of these tasks? Our team of experts can handle all your window and door maintenance needs.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="#" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
      Schedule Your Winter Inspection
    </a>
  </div>
  
  <p style="color: #7f8c8d; font-size: 14px; margin-top: 30px;">
    Best regards,<br>
    The Window & Door Care Team
  </p>
</div>
    `,
    public: true,
    tags: ["maintenance", "winter", "preparation"]
  },
  {
    name: "Spring Window & Door Checklist",
    subject: "Is your home Spring-Ready? 5 window & door tasks pros swear by",
    body: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #27ae60; border-bottom: 2px solid #2ecc71; padding-bottom: 10px;">
    🌸 Spring Window & Door Checklist
  </h2>
  
  <p>Hello!</p>
  
  <p>Spring is here, and it's the perfect time to give your windows and doors some much-needed attention. Here's a quick checklist that professional contractors swear by:</p>
  
  <div style="background-color: #ecf0f1; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h4 style="color: #27ae60; margin: 0 0 10px 0;">✅ Deep Clean Inside and Out</h4>
    <p style="margin: 0;">Remove winter grime and check for any damage that may have occurred during harsh weather.</p>
  </div>
  
  <div style="background-color: #ecf0f1; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h4 style="color: #27ae60; margin: 0 0 10px 0;">✅ Test All Moving Parts</h4>
    <p style="margin: 0;">Open and close all windows and doors to ensure smooth operation. Lubricate as needed.</p>
  </div>
  
  <div style="background-color: #ecf0f1; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h4 style="color: #27ae60; margin: 0 0 10px 0;">✅ Inspect Screens</h4>
    <p style="margin: 0;">Check for tears, bent frames, or missing hardware. Now's the time to repair before bug season!</p>
  </div>
  
  <div style="background-color: #ecf0f1; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h4 style="color: #27ae60; margin: 0 0 10px 0;">✅ Check Caulking and Seals</h4>
    <p style="margin: 0;">Look for gaps or cracked caulk around windows and door frames.</p>
  </div>
  
  <div style="background-color: #ecf0f1; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h4 style="color: #27ae60; margin: 0 0 10px 0;">✅ Schedule Professional Maintenance</h4>
    <p style="margin: 0;">Some tasks are best left to the pros - like checking balance systems and hardware adjustments.</p>
  </div>
  
  <div style="background-color: #e8f5e8; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center;">
    <h3 style="color: #27ae60; margin: 0 0 15px 0;">Ready for a Professional Spring Tune-Up?</h3>
    <p style="margin: 0 0 15px 0;">Our certified technicians can handle all 5 tasks in one visit.</p>
    <a href="#" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
      Book Your Spring Service
    </a>
  </div>
  
  <p style="color: #7f8c8d; font-size: 14px;">
    Happy Spring!<br>
    Your Window & Door Specialists
  </p>
</div>
    `,
    public: true,
    tags: ["spring", "maintenance", "checklist", "professional"]
  }
];
