// Fixed HubSpot Integration for Crown Seating Quiz
// Version: 3.0 - Complete Working Integration

class CrownSeatingHubSpot {
  constructor() {
    // Your actual HubSpot details (these are correct from your code)
    this.portalId = '39508280';
    this.formId = '50a30b4f-7506-455e-9678-aef83313909c';
    this.debugMode = true; // Set to false in production
    
    this.log('Crown Seating HubSpot Integration initialized', { 
      portalId: this.portalId, 
      formId: this.formId 
    });
  }

  log(message, data = null) {
    if (this.debugMode) {
      console.log(`[CrownSeating HubSpot] ${message}`, data || '');
    }
  }

  error(message, data = null) {
    console.error(`[CrownSeating HubSpot Error] ${message}`, data || '');
  }

  async submitQuizToHubSpot(quizData, recommendations) {
    this.log('Starting HubSpot submission', { quizData, recommendations });

    try {
      // Prepare the form fields
      const formFields = this.prepareFormFields(quizData, recommendations);
      this.log('Form fields prepared', formFields);

      // Build the submission data
      const submissionData = {
        fields: formFields,
        context: {
          pageUri: window.location.href,
          pageName: document.title || 'Crown Seating Professional Quiz',
          hutk: this.getHubSpotCookie() // HubSpot tracking cookie
        }
      };

      // If marketing consent was given, add it
      if (quizData.marketing_consent) {
        submissionData.legalConsentOptions = {
          consent: {
            consentToProcess: true,
            text: "I agree to allow Crown Seating to store and process my personal data.",
            communications: [
              {
                value: true,
                subscriptionTypeId: 999, // Replace with your actual subscription type ID if you have one
                text: "I agree to receive marketing communications from Crown Seating."
              }
            ]
          }
        };
      }

      // Submit to HubSpot
      const url = `https://api.hsforms.com/submissions/v3/integration/submit/${this.portalId}/${this.formId}`;
      
      this.log('Submitting to HubSpot', { url, submissionData });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData)
      });

      const responseText = await response.text();
      this.log('HubSpot response', { status: response.status, text: responseText });

      if (response.ok) {
        // Track successful submission
        this.trackConversion('quiz_submission_success', {
          email: quizData.email,
          recommendation: recommendations[0]?.product?.name || 'Unknown'
        });

        return { 
          success: true, 
          message: 'Successfully submitted to HubSpot'
        };
      } else {
        throw new Error(`HubSpot API error: ${response.status} - ${responseText}`);
      }

    } catch (error) {
      this.error('Quiz submission failed', error);
      
      // Track submission failure
      this.trackConversion('quiz_submission_failed', {
        error: error.message,
        email: quizData.email || 'unknown'
      });

      return { 
        success: false, 
        error: error.message
      };
    }
  }

  prepareFormFields(quizData, recommendations) {
    const fields = [];

    // Basic contact fields
    if (quizData.firstName) {
      fields.push({ name: 'firstname', value: quizData.firstName });
    }
    if (quizData.lastName) {
      fields.push({ name: 'lastname', value: quizData.lastName });
    }
    if (quizData.email) {
      fields.push({ name: 'email', value: quizData.email });
    }
    if (quizData.phone) {
      fields.push({ name: 'phone', value: quizData.phone });
    }
    if (quizData.practice_name) {
      fields.push({ name: 'company', value: quizData.practice_name });
    }

    // Quiz response fields - using exact values from form
    // These need to match your HubSpot property internal names exactly
    const quizFields = {
      'height_category': quizData.height || '',
      'professional_role': quizData.role || '',
      'seating_style_preference': quizData.style || '',
      'practice_type': quizData.practice_type || '',
      'usage_intensity': quizData.usage_intensity || '',
      'weight_preference': quizData.weight_preference || '',
      'quiz_completion_date': new Date().toISOString(),
      'quiz_version': 'Version_3.0'
    };

    // Handle ergonomic needs (multiple checkbox values)
    if (quizData.needs) {
      const needsArray = Array.isArray(quizData.needs) ? quizData.needs : [quizData.needs];
      quizFields['ergonomic_needs'] = needsArray.join('; '); // Use semicolon as separator for multi-select
    }

    // Add recommendation data
    if (recommendations && recommendations.length > 0) {
      const primary = recommendations[0];
      quizFields['primary_recommendation'] = primary.product.name;
      quizFields['recommendation_score'] = String(Math.round(primary.score));
      quizFields['recommended_price'] = String(primary.product.price);
      
      // Add secondary recommendations if they exist
      if (recommendations.length > 1) {
        const secondaryNames = recommendations.slice(1, 3).map(r => r.product.name);
        quizFields['secondary_recommendations'] = secondaryNames.join('; ');
      }
    }

    // Convert quiz fields to HubSpot format
    Object.entries(quizFields).forEach(([name, value]) => {
      if (value && value !== '') {
        fields.push({ name, value: String(value) });
      }
    });

    // Calculate and add lead score
    const leadScore = this.calculateLeadScore(quizData, recommendations);
    fields.push({ name: 'lead_score_quiz', value: String(leadScore) });

    return fields;
  }

  calculateLeadScore(quizData, recommendations) {
    let score = 30; // Base score for completing quiz

    // Role scoring
    const roleScores = {
      'Specialist (Endo/Perio/Oral Surgery)': 25,
      'General Dentist': 20,
      'Dental Hygienist': 20,
      'Dental Assistant': 15,
      'Multiple Roles': 18
    };
    score += roleScores[quizData.role] || 10;

    // Usage intensity scoring
    const usageScores = {
      'Intensive (8+ hours)': 20,
      'Heavy (6-8 hours)': 15,
      'Moderate (4-6 hours)': 10,
      'Light (2-4 hours)': 5
    };
    score += usageScores[quizData.usage_intensity] || 5;

    // Practice type scoring
    const practiceScores = {
      'DSO/Corporate': 20,
      'Large Practice (5+ doctors)': 15,
      'Small Group (2-4 doctors)': 10,
      'Solo Practice': 8,
      'Mobile/Satellite Clinic': 5
    };
    score += practiceScores[quizData.practice_type] || 5;

    // High match score bonus
    if (recommendations && recommendations[0] && recommendations[0].score >= 90) {
      score += 10;
    }

    return Math.min(100, score);
  }

  getHubSpotCookie() {
    // Get the HubSpot tracking cookie for better attribution
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'hubspotutk') {
        return value;
      }
    }
    return null;
  }

  trackConversion(eventName, data = {}) {
    // Google Analytics tracking
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, {
        'event_category': 'Crown Seating Quiz',
        'event_label': 'HubSpot Integration',
        'custom_data': data
      });
      this.log('GA event tracked', { eventName, data });
    }

    // HubSpot Analytics tracking (if HubSpot tracking code is loaded)
    if (typeof _hsq !== 'undefined' && window._hsq) {
      window._hsq.push(['identify', {
        email: data.email
      }]);
      window._hsq.push(['trackEvent', {
        id: eventName,
        value: data
      }]);
      this.log('HubSpot event tracked', { eventName, data });
    }
  }

  // Test the HubSpot connection (for debugging)
  async testConnection() {
    this.log('Testing HubSpot connection...');
    
    try {
      const testData = {
        email: 'test@crownseating.com',
        firstName: 'Test',
        lastName: 'User',
        height: 'Under 5\'4" - Petite',
        role: 'General Dentist',
        style: 'Traditional Round',
        practice_type: 'Solo Practice',
        usage_intensity: 'Moderate (4-6 hours)',
        weight_preference: 'Not Important - Stability preferred'
      };

      const testRecommendations = [{
        product: {
          name: 'Test Product',
          price: 1000
        },
        score: 95
      }];

      const result = await this.submitQuizToHubSpot(testData, testRecommendations);
      this.log('Connection test result', result);
      return result;
    } catch (error) {
      this.error('Connection test failed', error);
      return { success: false, error: error.message };
    }
  }
}

// Simple conversion optimization
class ConversionOptimization {
  constructor() {
    this.exitIntentShown = false;
    this.init();
  }

  init() {
    this.setupExitIntent();
    this.trackScrollDepth();
  }

  setupExitIntent() {
    document.addEventListener('mouseleave', (e) => {
      if (e.clientY <= 0 && !this.exitIntentShown && !this.isQuizComplete()) {
        this.showExitIntentPopup();
        this.exitIntentShown = true;
      }
    });
  }

  isQuizComplete() {
    const results = document.getElementById('results');
    return results && results.style.display !== 'none';
  }

  showExitIntentPopup() {
    const popup = document.createElement('div');
    popup.className = 'exit-intent-popup';
    popup.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease-out;
    `;
    
    popup.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 10px;
        max-width: 500px;
        text-align: center;
        position: relative;
        animation: slideIn 0.3s ease-out;
      ">
        <button onclick="this.closest('.exit-intent-popup').remove()" style="
          position: absolute;
          top: 10px;
          right: 15px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
        ">&times;</button>
        <h3 style="color: #667eea; margin-bottom: 15px;">🤔 Wait! Don't Leave Empty-Handed</h3>
        <p style="margin-bottom: 20px;">You're just a few clicks away from finding your perfect dental stool!</p>
        <div style="margin: 20px 0;">
          <h4 style="color: #2c3e50; margin-bottom: 10px;">🎁 Complete the quiz and get:</h4>
          <ul style="text-align: left; display: inline-block; margin: 0; padding-left: 20px;">
            <li>✅ Personalized recommendations from 48 models</li>
            <li>✅ Exclusive discount code (save 10%)</li>
            <li>✅ Free ergonomic assessment guide</li>
            <li>✅ Priority support from seating specialists</li>
          </ul>
        </div>
        <button onclick="this.closest('.exit-intent-popup').remove()" style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          margin-top: 15px;
        ">Continue My Quiz</button>
      </div>
    `;
    
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(popup);
    
    // Track exit intent
    if (typeof gtag !== 'undefined') {
      gtag('event', 'exit_intent_triggered', {
        'event_category': 'Crown Seating Quiz'
      });
    }
  }

  trackScrollDepth() {
    let maxScroll = 0;
    
    window.addEventListener('scroll', () => {
      const scrolled = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      
      if (scrolled > maxScroll) {
        maxScroll = scrolled;
        
        // Track at 25%, 50%, 75%, 100%
        if ([25, 50, 75, 100].includes(scrolled)) {
          if (typeof gtag !== 'undefined') {
            gtag('event', 'scroll_depth', {
              'event_category': 'Crown Seating Quiz',
              'event_label': `${scrolled}% Scrolled`,
              'value': scrolled
            });
          }
        }
      }
    });
  }
}

// Initialize the systems
const hubspotIntegration = new CrownSeatingHubSpot();
const conversionOptimization = new ConversionOptimization();

// Export for global use
window.CrownSeatingHubSpot = hubspotIntegration;
window.CrownSeatingConversion = conversionOptimization;

// Debug function - call this in console to test
window.testHubSpotConnection = function() {
  return hubspotIntegration.testConnection();
};

console.log('Crown Seating HubSpot Integration loaded. Test with: window.testHubSpotConnection()');