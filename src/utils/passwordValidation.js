/**
 * Password validation utilities for secure user registration
 */

export class PasswordValidator {
  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with success and errors
   */
  static validatePassword(password) {
    const errors = [];
    
    // Check minimum length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    // Check for uppercase letter
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    // Check for number
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    // Check for special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
    }
    
    // Check for common weak patterns
    if (/^password/i.test(password)) {
      errors.push('Password cannot start with "password"');
    }
    
    if (/123456/.test(password)) {
      errors.push('Password cannot contain "123456"');
    }
    
    if (/qwerty/i.test(password)) {
      errors.push('Password cannot contain "qwerty"');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors,
      strength: this.calculatePasswordStrength(password)
    };
  }
  
  /**
   * Check if two passwords match
   * @param {string} password - Original password
   * @param {string} confirmPassword - Confirmation password
   * @returns {boolean} True if passwords match
   */
  static passwordsMatch(password, confirmPassword) {
    return password === confirmPassword;
  }
  
  /**
   * Calculate password strength score
   * @param {string} password - Password to analyze
   * @returns {Object} Strength analysis
   */
  static calculatePasswordStrength(password) {
    let score = 0;
    let feedback = [];
    
    // Length scoring
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    
    // Character variety scoring
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
    
    // Complexity bonus
    if (password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 1;
    }
    
    // Determine strength level
    let level, color, description;
    if (score < 4) {
      level = 'weak';
      color = '#ff4444';
      description = 'Weak - Consider adding more complexity';
      feedback.push('Try adding uppercase letters, numbers, or special characters');
    } else if (score < 6) {
      level = 'medium';
      color = '#ff8800';
      description = 'Medium - Good but could be stronger';
      feedback.push('Consider making it longer or adding more character types');
    } else if (score < 8) {
      level = 'strong';
      color = '#44aa44';
      description = 'Strong - Great password!';
      feedback.push('Excellent password strength');
    } else {
      level = 'very-strong';
      color = '#00aa00';
      description = 'Very Strong - Outstanding!';
      feedback.push('Perfect password strength');
    }
    
    return {
      score: score,
      level: level,
      color: color,
      description: description,
      feedback: feedback
    };
  }
  
  /**
   * Validate Andersen Corp email format
   * @param {string} email - Email to validate
   * @returns {Object} Validation result
   */
  static validateAndersenEmail(email) {
    const andersenPattern = /^[a-zA-Z]+\.[a-zA-Z]+@andersencorp\.com$/;
    const isValid = andersenPattern.test(email);
    
    if (!isValid) {
      return {
        isValid: false,
        error: 'Email must be in format: firstname.lastname@andersencorp.com'
      };
    }
    
    // Extract and validate name parts
    const emailPrefix = email.split('@')[0];
    const nameParts = emailPrefix.split('.');
    
    if (nameParts.length !== 2) {
      return {
        isValid: false,
        error: 'Email must contain exactly one dot between first and last name'
      };
    }
    
    const [firstName, lastName] = nameParts;
    
    if (firstName.length < 2 || lastName.length < 2) {
      return {
        isValid: false,
        error: 'First and last names must be at least 2 characters each'
      };
    }
    
    return {
      isValid: true,
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase(),
      lastName: lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase(),
      zohoEmail: `${emailPrefix}@rbaconnector.com`
    };
  }
  
  /**
   * Generate password strength indicator JSX
   * @param {Object} strength - Strength object from calculatePasswordStrength
   * @returns {string} CSS class for strength indicator
   */
  static getStrengthIndicatorClass(strength) {
    return `password-strength-${strength.level}`;
  }
}

export default PasswordValidator;
