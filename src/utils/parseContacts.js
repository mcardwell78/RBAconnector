// Utility to parse CSV/XLSX rows to Firestore contact schema
// Accepts array of objects from papaparse/xlsx
import { categorizeReasonNoSale } from '../services/contactMigration';

export function mapToContactSchema(row) {
  // Accept both original and alternate header names
  const [firstName = '', lastName = ''] = (row['Contact: Full Name'] || '').split(' ');
  // Extract area from Opportunity Name if present
  let area = row['Area'] || row['Zip'] || '';
  if (!area && row['Opportunity Name']) {
    // Example: 'Appt: BEL AIR, BROWN, +1(410) 382-1247'
    const match = row['Opportunity Name'].match(/^Appt:\s*([^,]+),/i);
    if (match) area = match[1].trim();
  }
  // Will Customer Purchase from RbA in Future is a 1-5 number, but may be string or number, so parse safely
  let willPurchaseRaw = row['Will cust purch from RbA in future?'] || row['will purchase future'] || 0;
  let willPurchaseFuture = 0;
  if (typeof willPurchaseRaw === 'string') {
    willPurchaseRaw = willPurchaseRaw.trim();
    if (/^\d+$/.test(willPurchaseRaw)) willPurchaseFuture = Number(willPurchaseRaw);
    else willPurchaseFuture = 0;
  } else if (typeof willPurchaseRaw === 'number') {
    willPurchaseFuture = willPurchaseRaw;
  }

  // Parse and categorize reason no sale
  const reasonNoSaleText = row["Key Reason Customer Didn't Proceed?"] || '';
  const reasonNoSale = categorizeReasonNoSale(reasonNoSaleText);

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: row['Contact: Email'] || '',
    mobilePhone: row['Contact: Mobile Phone'] || '',
    homePhone: row['Contact: Home Phone'] || '',
    area,
    appointmentDate: row['Appt Date'] ? new Date(row['Appt Date']) : null,
    // Accept both 'Contract Amount Quoted' and '$ contract amount quoted:'
    quoteAmount: parseFloat((row['Contract Amount Quoted'] || row['$ contract amount quoted:'] || '0').toString().replace(/[^\d.\-]/g, '')),
    // Accept both 'of Windows' and '# of Windows'
    numWindows: Number(row['of Windows'] || row['# of Windows'] || 0),
    // Move numDoors below numWindows
    numDoors: Number(row['of Doors'] || row['# of Doors'] || 0),
    // Accept both 'Were all owners of the property present' and 'all owners present'
    allOwnersPresent: (row['Were all owners of the property present'] || row['all owners present'] || '').toLowerCase() === 'yes',
    willPurchaseFuture,
    salesRep: row['Sales Rep Name'] || '',
    notes: row['Notes'] || '',
    reasonNoSale: reasonNoSaleText, // Keep raw text for backward compatibility
    
    // Enhanced schema fields
    salesOutcome: {
      status: 'prospect',
      willPurchaseFuture,
      reasonNoSale
    },
    
    status: 'prospect',
    tags: [],
    campaignId: '',
    unsubscribed: row['Contact: Email Opt Out'] === 'Yes',
    doNotCall: row['Contact: Do Not Call'] === 'Yes',
    emailOptOut: row['Contact: Email Opt Out'] === 'Yes',
    phoneOptOut: row['Contact: Do Not Call'] === 'Yes',
    createdAt: new Date(),
    version: 2 // Mark as new schema version
  };
}

// Enhanced parsing function for v2 schema
export function mapToContactSchemaV2(row) {
  const [firstName = '', lastName = ''] = (row['Contact: Full Name'] || '').split(' ');
  
  // Extract area/location info
  let area = row['Area'] || row['Zip'] || '';
  if (!area && row['Opportunity Name']) {
    const match = row['Opportunity Name'].match(/^Appt:\s*([^,]+),/i);
    if (match) area = match[1].trim();
  }

  // Parse will purchase future
  let willPurchaseRaw = row['Will cust purch from RbA in future?'] || row['will purchase future'] || 0;
  let willPurchaseFuture = 0;
  if (typeof willPurchaseRaw === 'string') {
    willPurchaseRaw = willPurchaseRaw.trim();
    if (/^\d+$/.test(willPurchaseRaw)) willPurchaseFuture = Number(willPurchaseRaw);
  } else if (typeof willPurchaseRaw === 'number') {
    willPurchaseFuture = willPurchaseRaw;
  }

  // Parse quote amount
  const quoteAmount = parseFloat((row['Contract Amount Quoted'] || row['$ contract amount quoted:'] || '0').toString().replace(/[^\d.\-]/g, ''));
  
  // Parse project details
  const numWindows = Number(row['of Windows'] || row['# of Windows'] || 0);
  const numDoors = Number(row['of Doors'] || row['# of Doors'] || 0);

  // Determine project type
  let projectType = 'unknown';
  if (numWindows > 0 && numDoors > 0) projectType = 'both';
  else if (numWindows > 0) projectType = 'windows';
  else if (numDoors > 0) projectType = 'doors';

  // Determine urgency from will purchase future score
  let urgency = 'future';
  if (willPurchaseFuture >= 4) urgency = 'immediate';
  else if (willPurchaseFuture >= 3) urgency = 'within_3_months';
  else if (willPurchaseFuture >= 2) urgency = 'within_6_months';

  // Parse reason no sale
  const reasonNoSaleText = row["Key Reason Customer Didn't Proceed?"] || '';
  const reasonNoSale = categorizeReasonNoSale(reasonNoSaleText);

  // Determine timeline based on reason category
  let timeline = 'researching';
  if (reasonNoSale.category === 'timing') timeline = 'waiting';
  else if (reasonNoSale.category === 'decision_process') timeline = 'researching';
  else if (reasonNoSale.category === 'price') timeline = 'comparing';
  else if (willPurchaseFuture >= 4) timeline = 'immediate';

  // Determine preferred contact method
  const email = row['Contact: Email'] || '';
  const mobilePhone = row['Contact: Mobile Phone'] || '';
  const homePhone = row['Contact: Home Phone'] || '';
  const emailOptOut = row['Contact: Email Opt Out'] === 'Yes';
  const phoneOptOut = row['Contact: Do Not Call'] === 'Yes';
  
  let preferredContact = 'unknown';
  if (emailOptOut && !phoneOptOut) preferredContact = 'phone';
  else if (!emailOptOut && phoneOptOut) preferredContact = 'email';
  else if (email && (mobilePhone || homePhone)) preferredContact = 'email'; // Default to email
  else if (email) preferredContact = 'email';
  else if (mobilePhone || homePhone) preferredContact = 'phone';

  return {
    // Core contact info
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email,
    mobilePhone,
    homePhone,
    address: {
      street: row['Address'] || '',
      city: row['City'] || '',
      state: row['State'] || '',
      zip: row['Zip'] || area,
      area
    },
    
    // Lead details
    leadSource: row['Lead Source'] || 'unknown',
    appointmentDate: row['Appt Date'] ? new Date(row['Appt Date']) : null,
    salesRep: row['Sales Rep Name'] || '',
    
    // Quote and project
    quoteAmount,
    projectDetails: {
      numWindows,
      numDoors,
      projectType,
      urgency
    },
    
    // Decision making
    decisionMaking: {
      allOwnersPresent: (row['Were all owners of the property present'] || row['all owners present'] || '').toLowerCase() === 'yes',
      decisionMaker: 'unknown',
      influencers: [],
      timeline
    },
    
    // Sales outcome
    salesOutcome: {
      status: 'prospect',
      willPurchaseFuture,
      reasonNoSale
    },
    
    // Communication
    communication: {
      emailOptOut,
      phoneOptOut,
      preferredContact,
      bestTimeToCall: '',
      timezone: ''
    },
    
    // Engagement
    engagement: {
      lastContacted: null,
      totalTouchpoints: 0,
      campaignId: '',
      tags: [],
      notes: row['Notes'] || ''
    },
    
    // Legacy fields for backward compatibility
    area,
    numWindows,
    numDoors,
    allOwnersPresent: (row['Were all owners of the property present'] || row['all owners present'] || '').toLowerCase() === 'yes',
    willPurchaseFuture,
    notes: row['Notes'] || '',
    reasonNoSale: reasonNoSaleText,
    status: 'prospect',
    tags: [],
    campaignId: '',
    unsubscribed: emailOptOut,
    doNotCall: phoneOptOut,    emailOptOut,
    phoneOptOut,
    
    // System fields
    createdAt: new Date(),
    version: 2
  };
}
