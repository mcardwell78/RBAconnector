// Zoho Mail OAuth integration for email reply management
import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Zoho OAuth configuration
export const ZOHO_CONFIG = {
  // You'll need to get these from Zoho API Console
  clientId: process.env.REACT_APP_ZOHO_CLIENT_ID || 'YOUR_ZOHO_CLIENT_ID',
  clientSecret: process.env.REACT_APP_ZOHO_CLIENT_SECRET || 'YOUR_ZOHO_CLIENT_SECRET',
  redirectUri: 'https://dc-power-connector.web.app/auth/zoho-callback',
  scope: 'ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.folders.READ',
  
  // API endpoints
  authUrl: 'https://accounts.zoho.com/oauth/v2/auth',
  tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
  apiUrl: 'https://mail.zoho.com/api',
  
  // User-specific Zoho accounts
  accounts: {
    'info@rbaconnector.com': {
      zohoEmail: 'info@rbaconnector.com',
      isAdmin: true,
      description: 'Admin account for system emails and management'
    },
    'michaelcardwell@rbaconnector.com': {
      zohoEmail: 'michaelcardwell@rbaconnector.com',
      isAdmin: false,
      description: 'Main user account for campaign emails'
    }
  }
};

/**
 * Get Zoho account configuration for user
 */
export function getZohoAccountConfig(userEmail) {
  return ZOHO_CONFIG.accounts[userEmail.toLowerCase()] || null;
}

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(userEmail, state = null) {
  const config = getZohoAccountConfig(userEmail);
  if (!config) {
    throw new Error(`No Zoho configuration found for user: ${userEmail}`);
  }
  
  const params = new URLSearchParams({
    client_id: ZOHO_CONFIG.clientId,
    redirect_uri: ZOHO_CONFIG.redirectUri,
    scope: ZOHO_CONFIG.scope,
    response_type: 'code',
    access_type: 'offline',
    state: state || userEmail,
    prompt: 'consent' // Force consent screen to get refresh token
  });
  
  return `${ZOHO_CONFIG.authUrl}?${params.toString()}`;
}

/**
 * Initiate Zoho OAuth flow
 */
export function initiateZohoOAuth(userEmail) {
  const authUrl = generateAuthUrl(userEmail);
  console.log('Redirecting to Zoho OAuth:', authUrl);
  window.location.href = authUrl;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code, userEmail) {
  try {
    const response = await fetch(ZOHO_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ZOHO_CONFIG.clientId,
        client_secret: ZOHO_CONFIG.clientSecret,
        redirect_uri: ZOHO_CONFIG.redirectUri,
        code: code
      })
    });
    
    const tokenData = await response.json();
    
    if (tokenData.error) {
      throw new Error(`Zoho OAuth error: ${tokenData.error_description || tokenData.error}`);
    }
    
    console.log('Received Zoho tokens for:', userEmail);
    
    // Store tokens in Firestore
    await storeZohoTokens(userEmail, tokenData);
    
    return tokenData;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

/**
 * Store Zoho tokens securely in Firestore
 */
export async function storeZohoTokens(userEmail, tokenData) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user.uid) {
    throw new Error('No authenticated user');
  }
  
  const tokenDoc = {
    userEmail,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isActive: true
  };
  
  await setDoc(doc(db, 'zohoTokens', user.uid), tokenDoc);
  console.log('Stored Zoho tokens for user:', userEmail);
}

/**
 * Get stored Zoho tokens for user
 */
export async function getZohoTokens(uid) {
  const tokenDoc = await getDoc(doc(db, 'zohoTokens', uid));
  
  if (!tokenDoc.exists()) {
    return null;
  }
  
  const tokenData = tokenDoc.data();
  
  // Check if token is expired
  const now = new Date();
  const expiresAt = tokenData.expiresAt.toDate();
  
  if (now >= expiresAt) {
    console.log('Zoho token expired, attempting refresh...');
    return await refreshZohoTokens(uid, tokenData);
  }
  
  return tokenData;
}

/**
 * Refresh expired Zoho tokens
 */
export async function refreshZohoTokens(uid, currentTokenData) {
  try {
    const response = await fetch(ZOHO_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ZOHO_CONFIG.clientId,
        client_secret: ZOHO_CONFIG.clientSecret,
        refresh_token: currentTokenData.refreshToken
      })
    });
    
    const newTokenData = await response.json();
    
    if (newTokenData.error) {
      console.error('Token refresh failed:', newTokenData.error);
      return null;
    }
    
    // Update stored tokens
    const updatedTokenDoc = {
      ...currentTokenData,
      accessToken: newTokenData.access_token,
      expiresIn: newTokenData.expires_in,
      expiresAt: new Date(Date.now() + (newTokenData.expires_in * 1000)),
      updatedAt: serverTimestamp()
    };
    
    // Update refresh token if provided
    if (newTokenData.refresh_token) {
      updatedTokenDoc.refreshToken = newTokenData.refresh_token;
    }
    
    await updateDoc(doc(db, 'zohoTokens', uid), updatedTokenDoc);
    
    console.log('Refreshed Zoho tokens for user:', uid);
    return updatedTokenDoc;
    
  } catch (error) {
    console.error('Error refreshing tokens:', error);
    return null;
  }
}

/**
 * Make authenticated API call to Zoho Mail
 */
export async function makeZohoApiCall(endpoint, options = {}) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user.uid) {
    throw new Error('No authenticated user');
  }
  
  const tokens = await getZohoTokens(user.uid);
  if (!tokens) {
    throw new Error('No valid Zoho tokens found. Please re-authenticate.');
  }
  
  const response = await fetch(`${ZOHO_CONFIG.apiUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`Zoho API call failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Check if user has valid Zoho authentication
 */
export async function hasValidZohoAuth(uid) {
  try {
    const tokens = await getZohoTokens(uid);
    return tokens && tokens.isActive;
  } catch (error) {
    console.error('Error checking Zoho auth:', error);
    return false;
  }
}

/**
 * Revoke Zoho authentication
 */
export async function revokeZohoAuth(uid) {
  try {
    const tokens = await getZohoTokens(uid);
    if (!tokens) {
      return;
    }
    
    // Mark as inactive in Firestore
    await updateDoc(doc(db, 'zohoTokens', uid), {
      isActive: false,
      revokedAt: serverTimestamp()
    });
    
    console.log('Revoked Zoho authentication for user:', uid);
  } catch (error) {
    console.error('Error revoking Zoho auth:', error);
  }
}

/**
 * Get user's Zoho email status
 */
export async function getZohoEmailStatus(uid, userEmail) {
  const config = getZohoAccountConfig(userEmail);
  const hasAuth = await hasValidZohoAuth(uid);
  
  return {
    configured: !!config,
    authenticated: hasAuth,
    zohoEmail: config?.zohoEmail,
    isAdmin: config?.isAdmin || false,
    needsAuth: !!config && !hasAuth
  };
}

export default {
  ZOHO_CONFIG,
  getZohoAccountConfig,
  generateAuthUrl,
  initiateZohoOAuth,
  exchangeCodeForTokens,
  storeZohoTokens,
  getZohoTokens,
  refreshZohoTokens,
  makeZohoApiCall,
  hasValidZohoAuth,
  revokeZohoAuth,
  getZohoEmailStatus
};
