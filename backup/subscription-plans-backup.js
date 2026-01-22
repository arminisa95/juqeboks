// Initialize Stripe (use your actual publishable key)
const stripe = Stripe('pk_test_your_stripe_publishable_key');
const elements = stripe.elements();

// Create card element
const cardElement = elements.create('card', {
    style: {
        base: {
            color: '#ffffff',
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            padding: '12px',
        },
    },
});

cardElement.mount('#cardElement');

// Plan pricing
const planPricing = {
    premium: 9.99,
    pro: 19.99,
    label: 99.99
};

// Modal handling
const paymentModal = document.getElementById('paymentModal');
const selectedPlanSpan = document.getElementById('selectedPlan');
const planPriceSpan = document.getElementById('planPrice');
const cardErrors = document.getElementById('cardErrors');

// Subscribe button clicks
document.querySelectorAll('.subscribe-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const plan = this.dataset.plan;
        const price = planPricing[plan];
        
        selectedPlanSpan.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
        planPriceSpan.textContent = price;
        
        paymentModal.classList.remove('hidden');
        paymentModal.classList.add('flex');
    });
});

// Cancel payment
document.getElementById('cancelPayment').addEventListener('click', function() {
    paymentModal.classList.add('hidden');
    paymentModal.classList.remove('flex');
    cardErrors.textContent = '';
});

// Confirm payment
document.getElementById('confirmPayment').addEventListener('click', async function() {
    const { token, error } = await stripe.createToken(cardElement);
    
    if (error) {
        cardErrors.textContent = error.message;
    } else {
        // Send token to your server
        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: token.id,
                    plan: selectedPlanSpan.textContent.toLowerCase(),
                    price: planPriceSpan.textContent
                }),
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Redirect to success page
                window.location.href = '/subscription-success';
            } else {
                cardErrors.textContent = result.error || 'Payment failed';
            }
        } catch (err) {
            cardErrors.textContent = 'Payment processing error';
        }
    }
});

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
