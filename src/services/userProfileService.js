// User profile and public page management service
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

export class UserProfileService {
  /**
   * Create a user profile during registration
   * @param {Object} userData - User data from registration
   * @returns {Promise<Object>} Created profile data
   */
  static async createUserProfile(userData) {
    try {
      const { uid, email, firstName, lastName, andersenEmail } = userData;
      
      // Generate profile slug from email
      const emailPrefix = andersenEmail.split('@')[0];
      const profileSlug = emailPrefix.replace('.', '-'); // john.smith -> john-smith
      
      // Check if profile slug is unique
      const uniqueSlug = await this.ensureUniqueSlug(profileSlug);
      
      const profileData = {
        // Basic Info
        uid,
        email,
        andersenEmail,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        
        // Profile Page Settings
        profileSlug: uniqueSlug,
        profileUrl: `https://dc-power-connector.web.app/profile/${uniqueSlug}`,
        isProfilePublic: true,
        
        // Professional Information
        title: 'Design Consultant',
        company: 'Renewal by Andersen',
        phone: '',
        bio: `Hello! I'm ${firstName} ${lastName}, your local Renewal by Andersen Design Consultant. I help homeowners transform their homes with beautiful, energy-efficient windows and doors.`,
        
        // Profile Customization
        profileTheme: 'rba-green',
        profilePhoto: null,
        coverPhoto: null,
        
        // Contact & Scheduling
        calendlyUrl: '',
        showCalendlyOnProfile: true,
        preferredContactMethod: 'email',
        
        // Social Links
        linkedinUrl: '',
        facebookUrl: '',
        instagramUrl: '',
        
        // Service Areas & Specialties
        serviceAreas: [],
        specialties: ['Windows', 'Doors', 'Energy Efficiency'],
        yearsExperience: '',
        
        // Profile Stats (for analytics)
        profileViews: 0,
        appointmentsBooked: 0,
        lastProfileUpdate: serverTimestamp(),
        
        // Timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Status
        profileStatus: 'active'
      };
      
      // Store user profile
      await setDoc(doc(db, 'userProfiles', uid), profileData);
      
      console.log('✅ User profile created:', profileData.profileUrl);
      return profileData;
      
    } catch (error) {
      console.error('❌ Error creating user profile:', error);
      throw error;
    }
  }
  
  /**
   * Ensure profile slug is unique
   * @param {string} baseSlug - Base slug to check
   * @returns {Promise<string>} Unique slug
   */
  static async ensureUniqueSlug(baseSlug) {
    let slug = baseSlug;
    let counter = 1;
    
    while (await this.slugExists(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    return slug;
  }
  
  /**
   * Check if slug already exists
   * @param {string} slug - Slug to check
   * @returns {Promise<boolean>} True if exists
   */
  static async slugExists(slug) {
    const q = query(
      collection(db, 'userProfiles'),
      where('profileSlug', '==', slug)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }
  
  /**
   * Get user profile by UID
   * @param {string} uid - User ID
   * @returns {Promise<Object|null>} User profile data
   */
  static async getUserProfile(uid) {
    try {
      const profileDoc = await getDoc(doc(db, 'userProfiles', uid));
      return profileDoc.exists() ? profileDoc.data() : null;
    } catch (error) {
      console.error('❌ Error getting user profile:', error);
      return null;
    }
  }
  
  /**
   * Get public profile by slug
   * @param {string} slug - Profile slug
   * @returns {Promise<Object|null>} Public profile data
   */
  static async getPublicProfile(slug) {
    try {
      const q = query(
        collection(db, 'userProfiles'),
        where('profileSlug', '==', slug),
        where('isProfilePublic', '==', true),
        where('profileStatus', '==', 'active')
      );
      
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return null;
      }
      
      const profileData = snapshot.docs[0].data();
      
      // Increment profile view count
      await this.incrementProfileViews(snapshot.docs[0].id);
      
      return profileData;
    } catch (error) {
      console.error('❌ Error getting public profile:', error);
      return null;
    }
  }
  
  /**
   * Update user profile
   * @param {string} uid - User ID
   * @param {Object} updates - Profile updates
   * @returns {Promise<boolean>} Success status
   */
  static async updateUserProfile(uid, updates) {
    try {
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
        lastProfileUpdate: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'userProfiles', uid), updateData);
      console.log('✅ Profile updated successfully');
      return true;
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      throw error;
    }
  }
  
  /**
   * Increment profile view count
   * @param {string} uid - User ID
   */
  static async incrementProfileViews(uid) {
    try {
      const profileRef = doc(db, 'userProfiles', uid);
      const profileDoc = await getDoc(profileRef);
      
      if (profileDoc.exists()) {
        const currentViews = profileDoc.data().profileViews || 0;
        await updateDoc(profileRef, {
          profileViews: currentViews + 1,
          lastViewedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('❌ Error incrementing profile views:', error);
    }
  }
  
  /**
   * Track appointment booking
   * @param {string} uid - User ID
   */
  static async trackAppointmentBooked(uid) {
    try {
      const profileRef = doc(db, 'userProfiles', uid);
      const profileDoc = await getDoc(profileRef);
      
      if (profileDoc.exists()) {
        const currentBookings = profileDoc.data().appointmentsBooked || 0;
        await updateDoc(profileRef, {
          appointmentsBooked: currentBookings + 1,
          lastAppointmentBookedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('❌ Error tracking appointment:', error);
    }
  }
  
  /**
   * Get all public profiles (for admin)
   * @returns {Promise<Array>} List of public profiles
   */
  static async getAllPublicProfiles() {
    try {
      const q = query(
        collection(db, 'userProfiles'),
        where('isProfilePublic', '==', true),
        where('profileStatus', '==', 'active')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('❌ Error getting public profiles:', error);
      return [];
    }
  }
  
  /**
   * Generate profile preview data for sharing
   * @param {string} slug - Profile slug
   * @returns {Promise<Object>} Profile preview data
   */
  static async getProfilePreview(slug) {
    const profile = await this.getPublicProfile(slug);
    
    if (!profile) {
      return null;
    }
    
    return {
      title: `${profile.fullName} - ${profile.title}`,
      description: profile.bio,
      image: profile.profilePhoto || '/default-profile.jpg',
      url: profile.profileUrl,
      name: profile.fullName,
      company: profile.company,
      phone: profile.phone,
      calendlyUrl: profile.calendlyUrl
    };
  }
}

export default UserProfileService;
