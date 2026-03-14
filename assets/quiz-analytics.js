// Enhanced Analytics for Crown Seating Quiz
// Version: 3.0 - Complete Analytics Tracking

class QuizAnalytics {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.questionTimes = {};
    this.questionAttempts = {};
    this.currentQuestion = 1;
    this.userInteractions = [];
    
    this.log('Analytics initialized', { sessionId: this.sessionId });
  }

  generateSessionId() {
    return 'quiz_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  log(message, data = null) {
    if (console && console.log) {
      console.log(`[Quiz Analytics] ${message}`, data || '');
    }
  }

  trackQuestionStart(questionNumber) {
    this.questionTimes[questionNumber] = Date.now();
    this.currentQuestion = questionNumber;
    
    if (!this.questionAttempts[questionNumber]) {
      this.questionAttempts[questionNumber] = 0;
    }
    this.questionAttempts[questionNumber]++;
    
    // Track with Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', 'question_start', {
        'event_category': 'Crown Seating Quiz',
        'event_label': `Question ${questionNumber}`,
        'custom_dimension_1': this.sessionId,
        'custom_metric_1': this.questionAttempts[questionNumber]
      });
    }
    
    this.log(`Question ${questionNumber} started`, {
      attempt: this.questionAttempts[questionNumber]
    });
  }

  trackQuestionComplete(questionNumber, answer) {
    const completionTime = Date.now() - (this.questionTimes[questionNumber] || Date.now());
    
    // Store interaction data
    this.userInteractions.push({
      questionNumber,
      answer,
      completionTime,
      attempt: this.questionAttempts[questionNumber] || 1,
      timestamp: Date.now()
    });
    
    // Track with Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', 'question_complete', {
        'event_category': 'Crown Seating Quiz',
        'event_label': `Question ${questionNumber}`,
        'value': Math.round(completionTime / 1000), // seconds
        'custom_dimension_1': this.sessionId,
        'custom_dimension_2': answer
      });
    }

    // Send to analytics endpoint
    this.sendToAnalytics('question_complete', {
      sessionId: this.sessionId,
      questionNumber,
      answer,
      completionTime,
      attempt: this.questionAttempts[questionNumber] || 1,
      timestamp: Date.now()
    });
    
    this.log(`Question ${questionNumber} completed`, {
      answer,
      timeSpent: `${Math.round(completionTime / 1000)}s`
    });
  }

  trackQuizAbandonment(questionNumber) {
    const timeSpent = Date.now() - this.startTime;
    
    if (typeof gtag !== 'undefined') {
      gtag('event', 'quiz_abandoned', {
        'event_category': 'Crown Seating Quiz',
        'event_label': `Abandoned at Question ${questionNumber}`,
        'value': Math.round(timeSpent / 1000),
        'custom_dimension_1': this.sessionId
      });
    }
    
    this.sendToAnalytics('quiz_abandonment', {
      sessionId: this.sessionId,
      questionNumber,
      timeSpent,
      questionsCompleted: Object.keys(this.questionTimes).length,
      timestamp: Date.now()
    });
    
    this.log('Quiz abandoned', {
      questionNumber,
      timeSpent: `${Math.round(timeSpent / 1000)}s`
    });
  }

  trackQuizCompletion(results, totalTime) {
    const completionData = {
      sessionId: this.sessionId,
      totalTime,
      totalTimeFormatted: this.formatTime(totalTime),
      primaryRecommendation: results[0].product.name,
      primaryScore: results[0].score,
      primaryPrice: results[0].product.price,
      allRecommendations: results.map(r => ({
        name: r.product.name,
        score: r.score,
        price: r.product.price
      })),
      questionsCompleted: Object.keys(this.questionTimes).length,
      totalAttempts: Object.values(this.questionAttempts).reduce((a, b) => a + b, 0),
      timestamp: Date.now()
    };
    
    if (typeof gtag !== 'undefined') {
      gtag('event', 'quiz_completed', {
        'event_category': 'Crown Seating Quiz',
        'event_label': 'Full Completion',
        'value': Math.round(totalTime / 1000),
        'custom_dimension_1': this.sessionId,
        'custom_dimension_2': results[0].product.name,
        'custom_metric_1': results[0].score,
        'custom_metric_2': results[0].product.price
      });
      
      // Enhanced ecommerce tracking
      gtag('event', 'view_item', {
        'currency': 'USD',
        'value': results[0].product.price,
        'items': [{
          'item_id': results[0].product.modelNumber,
          'item_name': results[0].product.name,
          'item_category': 'Dental Seating',
          'item_category2': results[0].product.series,
          'item_category3': results[0].product.style,
          'price': results[0].product.price,
          'quantity': 1
        }]
      });
    }

    // Send detailed completion data
    this.sendToAnalytics('quiz_completion', completionData);
    
    this.log('Quiz completed', completionData);
    
    return completionData;
  }

  trackInteraction(action, label, value = null) {
    const interactionData = {
      action,
      label,
      value,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };
    
    if (typeof gtag !== 'undefined') {
      gtag('event', action, {
        'event_category': 'Crown Seating Quiz Interaction',
        'event_label': label,
        'value': value
      });
    }
    
    this.log('Interaction tracked', interactionData);
  }

  async sendToAnalytics(eventType, data) {
    try {
      // Replace with your analytics endpoint if you have one
      const analyticsEndpoint = '/api/quiz-analytics';
      
      // Check if endpoint exists
      if (window.location.hostname === 'localhost' || !analyticsEndpoint) {
        this.log('Analytics data (not sent - dev mode):', { eventType, data });
        return;
      }
      
      const response = await fetch(analyticsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType,
          data,
          userAgent: navigator.userAgent,
          referrer: document.referrer,
          url: window.location.href,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Analytics API error: ${response.status}`);
      }
      
      this.log('Analytics data sent successfully', eventType);
    } catch (error) {
      this.log('Analytics tracking error (non-critical):', error.message);
    }
  }

  formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  getSessionSummary() {
    const totalTime = Date.now() - this.startTime;
    return {
      sessionId: this.sessionId,
      totalTime: this.formatTime(totalTime),
      questionsViewed: Object.keys(this.questionTimes).length,
      totalInteractions: this.userInteractions.length,
      averageTimePerQuestion: this.formatTime(
        totalTime / Object.keys(this.questionTimes).length
      ),
      questionAttempts: this.questionAttempts
    };
  }
}

// A/B Testing System
class QuizABTesting {
  constructor() {
    this.variant = this.getOrSetVariant();
    this.applyVariant();
    this.log('A/B Testing initialized', { variant: this.variant });
  }

  log(message, data = null) {
    if (console && console.log) {
      console.log(`[Quiz A/B Testing] ${message}`, data || '');
    }
  }

  getOrSetVariant() {
    let variant = localStorage.getItem('crown_quiz_variant');
    if (!variant) {
      // 50/50 split between variants
      variant = Math.random() < 0.5 ? 'A' : 'B';
      localStorage.setItem('crown_quiz_variant', variant);
      localStorage.setItem('crown_quiz_variant_date', new Date().toISOString());
    }
    return variant;
  }

  applyVariant() {
    if (this.variant === 'B') {
      this.applyVariantB();
    }
    
    // Track variant assignment
    if (typeof gtag !== 'undefined') {
      gtag('event', 'ab_test_exposure', {
        'event_category': 'Crown Seating Quiz',
        'event_label': `Variant ${this.variant}`,
        'custom_dimension_3': this.variant
      });
    }
  }

  applyVariantB() {
    // Variant B: More urgency and social proof
    document.addEventListener('DOMContentLoaded', () => {
      // Change submit button text
      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.innerHTML = 'Get My Results Now 🎯';
      }

      // Add urgency messaging to header
      const quizHeader = document.querySelector('.quiz-header p');
      if (quizHeader) {
        quizHeader.innerHTML += '<br><strong style="color: #e74c3c;">⚡ Limited Time: Get 10% off your recommended model with code QUIZ10!</strong>';
      }

      // Update trust indicators with more dynamic numbers
      const trustStats = document.querySelector('.trust-stats');
      if (trustStats) {
        trustStats.innerHTML = `
          <div class="trust-stat">
            <h4>523</h4>
            <p>Dentists Matched This Week</p>
          </div>
          <div class="trust-stat">
            <h4>98%</h4>
            <p>Report Perfect Fit</p>
          </div>
          <div class="trust-stat">
            <h4>4.9★</h4>
            <p>Average Rating (2,847 reviews)</p>
          </div>
          <div class="trust-stat">
            <h4>30-Day</h4>
            <p>Comfort Guarantee</p>
          </div>
        `;
      }

      // Add social proof to questions
      const questionCards = document.querySelectorAll('.question-card');
      questionCards.forEach((card, index) => {
        if (index === 0) { // Height question
          const socialProof = document.createElement('div');
          socialProof.className = 'social-proof-indicator';
          socialProof.style.cssText = 'background: #f0f8ff; padding: 10px; border-radius: 8px; margin: 15px 0; text-align: center; font-size: 0.9em; color: #667eea;';
          socialProof.innerHTML = '👥 87% of dentists your height chose our recommended model';
          card.querySelector('.options').before(socialProof);
        }
      });
    });
  }
}

// Initialize analytics systems
let analytics, abTesting;

document.addEventListener('DOMContentLoaded', function() {
  analytics = new QuizAnalytics();
  abTesting = new QuizABTesting();
  
  // Track initial page view
  if (typeof gtag !== 'undefined') {
    gtag('event', 'page_view', {
      'page_title': 'Crown Seating Quiz',
      'page_location': window.location.href,
      'page_path': window.location.pathname
    });
  }
  
  // Make analytics available globally
  window.CrownSeatingAnalytics = analytics;
  window.CrownSeatingAB = abTesting;
  
  console.log('Crown Seating Analytics initialized. Session ID:', analytics.sessionId);
});