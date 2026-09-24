/* Main: nav, billing toggle, signup form */
(function () {
  'use strict';

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function initNav() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');

    window.addEventListener('scroll', () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 10);
    }, { passive: true });

    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    links.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initBilling() {
    const toggle = document.getElementById('billingSwitch');
    const amounts = document.querySelectorAll('.price__amount');

    toggle.addEventListener('click', () => {
      const yearly = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(yearly));
      amounts.forEach((el) => {
        el.textContent = '$' + (yearly ? el.dataset.yearly : el.dataset.monthly);
      });
    });
  }

  function initForm() {
    const form = document.getElementById('signupForm');
    const input = document.getElementById('email');
    const message = document.getElementById('formMessage');

    function show(text, type) {
      message.textContent = text;
      message.className = 'form__message is-' + type;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!EMAIL_PATTERN.test(email)) {
        show('Please enter a valid email address.', 'error');
        input.focus();
        return;
      }
      show('Thanks! You\'re on the list.', 'success');
      form.reset();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initBilling();
    initForm();
    document.getElementById('year').textContent = new Date().getFullYear();
  });
})();
