# Zoho Directory API User Creation - Issue Analysis

## Current Status
- ✅ OAuth token works for GET requests to /users (list users)
- ❌ ALL endpoints return 405 (Method Not Allowed) for ALL methods
- ❌ This includes GET requests to other endpoints like /organizations, /domains

## Root Cause Analysis
The issue is that **ALL endpoints except `/users` (GET) return 405**. This suggests:

1. **Limited Scopes**: The OAuth token was generated with limited scopes that only allow listing users
2. **Domain Not Verified**: The domain `dc-powerconnector.com` might not be properly verified in Zoho Directory
3. **API Permissions**: The Zoho organization might not have Directory API fully enabled

## Next Steps Required

### Step 1: Check Current Token Scopes
The OAuth token we're using was generated with specific scopes. We need to ensure it includes:
- `ZohoDevelopment.users.CREATE` or similar write permissions
- `ZohoDevelopment.organizations.READ` 
- Full Directory API permissions

### Step 2: Verify Domain in Zoho Directory
We need to ensure that `dc-powerconnector.com` is:
- Added to Zoho Directory
- Verified with DNS records
- Enabled for user creation

### Step 3: Check if Directory API is Enabled
In Zoho Admin Console, we need to verify:
- Directory API is enabled for the organization
- User creation permissions are granted
- The domain is properly configured

### Step 4: Regenerate OAuth Token if Needed
If the current token has limited scopes, we need to:
1. Go through the OAuth flow again with proper scopes
2. Request write permissions for users
3. Update the refresh token in our code

## Recommendation
Based on the 405 errors on ALL endpoints, this looks like a **scope/permission issue** rather than an endpoint issue. We should:

1. First verify the domain is set up in Zoho Directory
2. Check what scopes our current token has
3. Regenerate the token with full Directory API permissions if needed

The fact that only `/users` (GET) works suggests our token has very limited read-only permissions.
