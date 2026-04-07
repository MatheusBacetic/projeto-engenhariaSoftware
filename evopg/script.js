document.addEventListener('DOMContentLoaded', () => {
    // Modal Selectors
    const termsModal = document.getElementById('checkout-terms-modal');
    const successModal = document.getElementById('checkout-success-modal');
    const supportModal = document.getElementById('support-modal');
    
    // Control Selectors
    const checkoutButtons = document.querySelectorAll('.js-start-checkout');
    const termsAcceptCheckbox = document.getElementById('checkout-terms-accept-checkbox');
    const termsContinueBtn = document.getElementById('checkout-continue-btn') || document.getElementById('checkout-terms-continue-btn');
    const termsBackBtn = document.getElementById('checkout-terms-back-btn');
    const termsCloseBtn = document.getElementById('checkout-terms-close-btn');
    const successCloseBtn = document.getElementById('checkout-success-close-btn');
    
    const supportFloatBtn = document.getElementById('support-float-btn');
    const supportCloseBtn = document.getElementById('support-modal-close');
    const supportForm = document.getElementById('support-form');
    
    /**
     * Modal Helper Functions
     */
    const openModal = (modal) => {
        if (!modal) return;
        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        modal.classList.add('is-active');
        
        // Accessibility: Focus the first interactive element or the modal itself
        const focusable = modal.querySelector('button, input, textarea, a');
        if (focusable) focusable.focus();
    };

    const closeModal = (modal) => {
        if (!modal) return;
        modal.setAttribute('hidden', '');
        document.body.style.overflow = '';
        modal.classList.remove('is-active');
    };

    /**
     * hiring flow handled by js/checkout.js
     */

    /**
     * Support Modal Logic
     */
    // Show support button after a delay or scroll
    setTimeout(() => {
        if (supportFloatBtn) supportFloatBtn.classList.add('is-visible');
    }, 2000);

    supportFloatBtn?.addEventListener('click', () => {
        openModal(supportModal);
    });

    supportCloseBtn?.addEventListener('click', () => {
        closeModal(supportModal);
    });

    if (supportForm) {
        supportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitBtn = supportForm.querySelector('button[type="submit"]');
            const feedback = document.getElementById('support-feedback');
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
            
            // Simulating API call
            setTimeout(() => {
                feedback.textContent = 'Mensagem enviada com sucesso! Entraremos em contato em breve.';
                feedback.style.color = '#22c55e';
                supportForm.reset();
                
                setTimeout(() => {
                    closeModal(supportModal);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Enviar mensagem';
                    feedback.textContent = '';
                }, 2500);
            }, 1200);
        });
    }

    /**
     * Premium Scroll Reveal (Intersection Observer)
     */
    const revealElements = document.querySelectorAll('[data-scroll-reveal]');
    
    if (revealElements.length > 0) {
        document.body.classList.add('has-premium-scroll');
        
        const observerOptions = {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-scroll-visible');
                    // Once visible, we can stop observing this specific element
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        revealElements.forEach(el => observer.observe(el));
    }
    
    // Close modals on Esc key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(supportModal);
        }
    });

    // Close modals on backdrop click
    supportModal?.addEventListener('click', (e) => {
        if (e.target === supportModal) {
            closeModal(supportModal);
        }
    });
});
