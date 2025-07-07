// User roles and permissions management
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

// Permissions system
export const PERMISSIONS = {
  // Data Management
  VIEW_ALL_USERS_DATA: 'view_all_users_data',
  MANAGE_USERS: 'manage_users',
  
  // System Settings
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
  CONFIGURE_EMAIL_TEMPLATES: 'configure_email_templates',
  
  // Analytics
  VIEW_SYSTEM_ANALYTICS: 'view_system_analytics',
  EXPORT_DATA: 'export_data',
  
  // Standard User Permissions
  MANAGE_OWN_CONTACTS: 'manage_own_contacts',
  MANAGE_OWN_CAMPAIGNS: 'manage_own_campaigns',
  USE_AUTOMATION: 'use_automation',
  ACCESS_MAILBOX: 'access_mailbox',
  
  // Email Management
  SEND_EMAILS: 'send_emails',
  VIEW_EMAIL_ANALYTICS: 'view_email_analytics'
};

// Role-based permission sets
const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    // Admin gets all permissions
    ...Object.values(PERMISSIONS)
  ],
  [USER_ROLES.USER]: [
    // Standard user permissions
    PERMISSIONS.MANAGE_OWN_CONTACTS,
    PERMISSIONS.MANAGE_OWN_CAMPAIGNS,
    PERMISSIONS.USE_AUTOMATION,
    PERMISSIONS.ACCESS_MAILBOX,
    PERMISSIONS.SEND_EMAILS,
    PERMISSIONS.VIEW_EMAIL_ANALYTICS
  ]
};

// Zoho email mapping
const ZOHO_EMAIL_MAPPING = {
  'info@rbaconnector.com': {
    zohoEmail: 'info@rbaconnector.com',
    role: USER_ROLES.ADMIN,
    isAdmin: true
  },
  'michaelcardwell@rbaconnector.com': {
    zohoEmail: 'michaelcardwell@rbaconnector.com',
    role: USER_ROLES.USER,
    isAdmin: false
  }
};

/**
 * Get user role based on email
 */
export function getUserRoleFromEmail(email) {
  const mapping = ZOHO_EMAIL_MAPPING[email.toLowerCase()];
  return mapping ? mapping.role : USER_ROLES.USER;
}

/**
 * Check if email is admin
 */
export function isAdminEmail(email) {
  const mapping = ZOHO_EMAIL_MAPPING[email.toLowerCase()];
  return mapping ? mapping.isAdmin : false;
}

/**
 * Get Zoho email for user
 */
export function getZohoEmailForUser(email) {
  const mapping = ZOHO_EMAIL_MAPPING[email.toLowerCase()];
  return mapping ? mapping.zohoEmail : null;
}

/**
 * Get permissions for role
 */
export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[USER_ROLES.USER];
}

/**
 * Create user with proper role and permissions
 */
export async function createUserWithRole(userData) {
  const { uid, email } = userData;
  const role = getUserRoleFromEmail(email);
  const permissions = getPermissionsForRole(role);
  const zohoEmail = getZohoEmailForUser(email);
  
  const userDoc = {
    ...userData,
    role,
    permissions,
    zohoEmail,
    isAdmin: isAdminEmail(email),
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    settings: {
      emailProvider: 'SendGrid',
      emailLimit: role === USER_ROLES.ADMIN ? 500 : 100,
      automationEnabled: true,
      notificationsEnabled: true
    }
  };
  
  await setDoc(doc(db, 'users', uid), userDoc);
  
  console.log(`Created user with role ${role}:`, email);
  return userDoc;
}

/**
 * Get user with role information
 */
export async function getUserWithRole(uid) {
  const userDoc = await getDoc(doc(db, 'users', uid));
  
  if (!userDoc.exists()) {
    return null;
  }
  
  const userData = userDoc.data();
  
  // Ensure permissions are up to date
  const expectedPermissions = getPermissionsForRole(userData.role);
  if (!arraysEqual(userData.permissions || [], expectedPermissions)) {
    await updateDoc(doc(db, 'users', uid), {
      permissions: expectedPermissions,
      updatedAt: serverTimestamp()
    });
    userData.permissions = expectedPermissions;
  }
  
  return userData;
}

/**
 * Check if user has permission
 */
export function hasPermission(user, permission) {
  if (!user || !user.permissions) {
    return false;
  }
  
  return user.permissions.includes(permission);
}

/**
 * Check if user is admin
 */
export function isAdmin(user) {
  return user && user.role === USER_ROLES.ADMIN;
}

/**
 * Update user's last login time
 */
export async function updateLastLogin(uid) {
  await updateDoc(doc(db, 'users', uid), {
    lastLogin: serverTimestamp()
  });
}

/**
 * Get all admin users
 */
export async function getAdminUsers() {
  // This would require a more complex query in a real app
  // For now, we know there's only one admin
  const adminEmails = Object.keys(ZOHO_EMAIL_MAPPING).filter(email => 
    ZOHO_EMAIL_MAPPING[email].isAdmin
  );
  
  return adminEmails;
}

// Helper function to compare arrays
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every(val => b.includes(val)) && b.every(val => a.includes(val));
}

/**
 * Permission checking hook for React components
 */
export function usePermission(permission) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [hasAccess, setHasAccess] = React.useState(false);
  
  React.useEffect(() => {
    async function checkPermission() {
      if (!user.uid) {
        setHasAccess(false);
        return;
      }
      
      const userWithRole = await getUserWithRole(user.uid);
      setHasAccess(hasPermission(userWithRole, permission));
    }
    
    checkPermission();
  }, [user.uid, permission]);
  
  return hasAccess;
}

export default {
  USER_ROLES,
  PERMISSIONS,
  getUserRoleFromEmail,
  isAdminEmail,
  getZohoEmailForUser,
  getPermissionsForRole,
  createUserWithRole,
  getUserWithRole,
  hasPermission,
  isAdmin,
  updateLastLogin,
  getAdminUsers,
  usePermission
};
