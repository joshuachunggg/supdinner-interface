document.addEventListener('DOMContentLoaded', () => {
  // --- STRIPE INIT ---
  const STRIPE_PUBLISHABLE_KEY = 'pk_test_51RoP12090xmS47wUC7t9RjXOtqLIkZnKIphRsJaB5V2mH4MyWFT3WggYIEsr2EaDot78tYF3bZ5wVr1CC1Dc6xGy00rI5QkBOa'; // test key (swap to live in prod)
  const COLLATERAL_CENTS_DEFAULT = 1000; // $10 hold
  let stripe = null;
  let elements = null;
  let cardElement = null;

  // state for Stripe modal confirmation
  let pendingClientSecret = null;
  let pendingMode = null; // 'setup' or 'payment'
  let pendingPostStripeAction = null; // deferred join after card confirm

  // --- SUPABASE CLIENT ---
  const SUPABASE_URL = 'https://ennlvlcogzowropkwbiu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubmx2bGNvZ3pvd3JvcGt3Yml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MTIyMTAsImV4cCI6MjA2OTQ4ODIxMH0.dCsyTAsAhcvSpeUMxWSyo_9praZC2wPDzmb3vCkHpPc';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- GLOBAL STATE ---
  let currentUserState = {
    isLoggedIn: false,
    userId: null,                // numeric id from public.users
    joinedTableId: null,         // future dinner only
    waitlistedTableIds: [],
    isSuspended: false,
    suspensionEndDate: null,
    name: null,
    phone: null,
  };
  let activeDate = '';
  let selectedTableId = null;
  let signupAction = 'join'; // 'join' or 'waitlist'
  let isNewUserFlow = false;

  // --- DOM REFS ---
  const dayTabsContainer = document.getElementById('day-tabs');
  const tablesContainer = document.getElementById('tables-container');
  const loadingSpinner = document.getElementById('loading-spinner');
  const noTablesMessage = document.getElementById('no-tables-message');
  const userStatusDiv = document.getElementById('user-status');
  const userGreetingSpan = document.getElementById('user-greeting');
  const logoutLink = document.getElementById('logout-link');
  const loginButton = document.getElementById('login-button');

  // Join Modal elements
  const joinModal = document.getElementById('join-modal');
  const joinModalContent = document.getElementById('modal-content');
  const modalStep1 = document.getElementById('modal-step-1');
  const modalStep3 = document.getElementById('modal-step-3');
  const modalTableDetails = document.getElementById('modal-table-details');
  const joinModalTitle = document.getElementById('join-modal-title');
  const joinSubmitButton = document.getElementById('join-submit-button');
  const successTitle = document.getElementById('success-title');
  const successMessage = document.getElementById('success-message');
  const disclaimerCheckbox = document.getElementById('disclaimer-checkbox');
  const marketingCheckbox = document.getElementById('marketing-checkbox');
  const newUserFields = document.getElementById('new-user-fields');

  // Phone-only Login Modal (legacy)
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const loginFormError = document.getElementById('login-form-error');
  const closeLoginModal = document.getElementById('close-login-modal');

  // Request Modal
  const requestTableBtn = document.getElementById('request-table-btn');
  const requestModal = document.getElementById('request-modal');
  const requestModalContent = document.getElementById('request-modal-content');
  const requestStep1 = document.getElementById('request-step-1');
  const requestStep2 = document.getElementById('request-step-2');
  const requestInfoForm = document.getElementById('request-info-form');
  const requestFormError = document.getElementById('request-form-error');
  const requestDisclaimerCheckbox = document.getElementById('request-disclaimer-checkbox');
  const requestSubmitButton = document.getElementById('request-submit-button');
  const closeRequestModal1 = document.getElementById('close-request-modal-1');
  const closeRequestModal2 = document.getElementById('close-request-modal-2');

  // Card Modal (Stripe)
  const cardModal = document.getElementById('card-modal');
  const cardModalContent = document.getElementById('card-modal-content');
  const cardForm = document.getElementById('card-form');
  const cardElementMount = document.getElementById('card-element');
  const cardErrors = document.getElementById('card-errors');
  const cardConfirmButton = document.getElementById('card-confirm-button');
  const closeCardModal = document.getElementById('close-card-modal');

  // Forms and buttons
  const userInfoForm = document.getElementById('user-info-form');
  const formError1 = document.getElementById('form-error-1');
  const closeButton1 = document.getElementById('close-modal-1');
  const closeButton3 = document.getElementById('close-modal-3');

  // --- Account Modal (email/password) REFS ---
  const accountModal = document.getElementById('account-modal');
  const accountClose = document.getElementById('account-close');
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const formLogin = document.getElementById('form-login');
  const formSignup = document.getElementById('form-signup');
  const loginErrorBox = document.getElementById('login-error');
  const signupErrorBox = document.getElementById('signup-error');

  // --- HELPERS ---
  function createButton(text, classes = [], disabled = false) {
    const button = document.createElement('button');
    button.textContent = text;
    const baseClasses = ['supdinner-button'];
    button.classList.add(...baseClasses, ...classes);
    if (disabled) button.disabled = true;
    return button;
  }

  function openModal(modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      const mc = modal.querySelector('.modal-content');
      if (mc) mc.classList.remove('scale-95');
    }, 10);
  }
  function closeModal(modal) {
    modal.classList.add('opacity-0');
    const mc = modal.querySelector('.modal-content');
    if (mc) mc.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
      const form = modal.querySelector('form');
      if (form) form.reset();
      if (modal === joinModal) {
        showModalStep(1, joinModal);
        formError1.classList.add('hidden');
        newUserFields.classList.add('hidden');
        joinSubmitButton.textContent = 'Continue';
        joinSubmitButton.disabled = false;
        isNewUserFlow = false;
      }
      if (modal === requestModal) {
        showModalStep(1, requestModal);
        requestFormError.classList.add('hidden');
        requestSubmitButton.disabled = true;
      }
      if (modal === loginModal) loginFormError.classList.add('hidden');
      refreshData();
    }, 300);
  }

  // Account modal
  function openAccount() {
    accountModal.classList.remove('hidden');
    setTimeout(() => {
      accountModal.classList.remove('opacity-0');
      accountModal.querySelector('.modal-content').classList.remove('scale-95');
    }, 10);
  }
  function closeAccount() {
    accountModal.classList.add('opacity-0');
    accountModal.querySelector('.modal-content').classList.add('scale-95');
    setTimeout(() => accountModal.classList.add('hidden'), 250);
  }

  function showModalStep(step, modal) {
    const steps = modal.querySelectorAll('[id^="modal-step-"], [id^="request-step-"]');
    steps.forEach(stepEl => {
      const stepNumber = stepEl.id.split('-').pop();
      stepEl.classList.toggle('hidden', stepNumber != step);
    });
  }
  function showSuccessStep() {
    if (signupAction === 'waitlist') {
      successTitle.textContent = "You're on the waitlist!";
      successMessage.textContent = "We'll let you know if a spot opens up. Thanks for your interest!";
    } else {
      successTitle.textContent = "You're In!";
      successMessage.textContent = "Welcome to the table! We'll send the final details to your phone soon. See you there!";
    }
    showModalStep(3, joinModal);
  }

  // ===== Auth helpers (email/password) =====
async function ensureUserRowFromSession(phoneOptional, firstNameOptional, ageRangeOptional) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || !session.user) return null;

  const authId = session.user.id;
  const email  = session.user.email ?? null;

  // already linked?
  let { data: u } = await supabaseClient
    .from('users')
    .select('id, phone_number, first_name, age_range, auth_user_id, email')
    .eq('auth_user_id', authId)
    .maybeSingle();

  // legacy row by phone? link it
  if (!u && phoneOptional) {
    const { data: legacy } = await supabaseClient
      .from('users')
      .select('id, phone_number, first_name, age_range, auth_user_id, email')
      .eq('phone_number', phoneOptional)
      .maybeSingle();

    if (legacy && !legacy.auth_user_id) {
      const patch = { auth_user_id: authId };
      if (email && !legacy.email) patch.email = email;
      if (firstNameOptional && !legacy.first_name) patch.first_name = firstNameOptional;
      if (ageRangeOptional && !legacy.age_range) patch.age_range = ageRangeOptional;
      const { error: upErr } = await supabaseClient.from('users').update(patch).eq('id', legacy.id);
      if (upErr) throw upErr;
      return legacy.id;
    }
  }

  async function linkOrCreateProfile({ first_name, phone_number, age_range } = {}) {
    // require authenticated session (JWT is sent automatically by supabase-js)
    const { data, error } = await supabaseClient.functions.invoke('link-or-create-profile', {
      body: { first_name, phone_number, age_range }
    });
    if (error) throw error;
    if (data?.user_id) {
      localStorage.setItem('supdinner_user_id', String(data.user_id));
    }
  }

  // create new if none — ensure NOT NULL columns have values
  if (!u) {
    const insert = {
      auth_user_id: authId,
      email,
      phone_number: phoneOptional || null,
      first_name: (firstNameOptional && firstNameOptional.trim()) || 'Friend',
      age_range: (ageRangeOptional && ageRangeOptional.trim()) || '23-27'
    };
    const { data: created, error: insErr } = await supabaseClient
      .from('users')
      .insert(insert)
      .select('id')
      .single();
    if (insErr) throw insErr;
    return created.id;
  }

  // backfill missing fields if we can
  const patch = {};
  if (!u.phone_number && phoneOptional) patch.phone_number = phoneOptional;
  if (!u.first_name && firstNameOptional) patch.first_name = firstNameOptional;
  if (!u.age_range && ageRangeOptional) patch.age_range = ageRangeOptional;
  if (!u.email && email) patch.email = email;
  if (Object.keys(patch).length) {
    await supabaseClient.from('users').update(patch).eq('id', u.id);
  }
  return u.id;
}

  // --- RENDER TABS ---
  const renderTabs = (dates) => {
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    dayTabsContainer.innerHTML = '';
    let tabsHtml = '';
    let previousDayIndex = -1;

    dates.forEach((dateString, index) => {
      const date = new Date(dateString + 'T00:00:00');
      const currentDayIndex = date.getDay();
      if (index > 0 && currentDayIndex < previousDayIndex) tabsHtml += `<div class="week-separator"></div>`;
      const dayName = dayNames[currentDayIndex];
      const monthName = monthNames[date.getMonth()];
      const dayOfMonth = date.getDate();
      const isActive = index === 0;
      if (isActive) activeDate = dateString;
      tabsHtml += `
        <a href="#" data-date="${dateString}" class="day-tab whitespace-nowrap text-center py-3 px-1 ${isActive ? 'border-b-2 border-brand-accent text-brand-accent' : 'border-b-2 border-transparent text-gray-500 hover:text-brand-accent hover:border-brand-accent/50'}">
          <div class="font-heading">${dayName}</div>
          <div class="font-heading text-xs">${monthName} ${dayOfMonth}</div>
        </a>
      `;
      previousDayIndex = currentDayIndex;
    });

    dayTabsContainer.innerHTML = tabsHtml;
    document.querySelectorAll('.day-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
  };

  const handleTabClick = (e) => {
    e.preventDefault();
    const tabElement = e.target.closest('.day-tab');
    if (!tabElement) return;
    activeDate = tabElement.dataset.date;
    document.querySelectorAll('.day-tab').forEach(tab => {
      tab.classList.toggle('border-brand-accent', tab.dataset.date === activeDate);
      tab.classList.toggle('text-brand-accent', tab.dataset.date === activeDate);
      tab.classList.toggle('border-transparent', tab.dataset.date !== activeDate);
      tab.classList.toggle('text-gray-500', tab.dataset.date !== activeDate);
    });
    renderTables(activeDate);
  };

  // --- TABLES LIST ---
  const renderTables = async (dateString) => {
    tablesContainer.innerHTML = '';
    loadingSpinner.classList.remove('hidden');
    noTablesMessage.classList.add('hidden');

    const { data: filteredTables, error } = await supabaseClient.rpc('get_tables_for_day', { day_string: dateString });
    if (error) {
      console.error('Error fetching tables:', error);
      loadingSpinner.classList.add('hidden');
      tablesContainer.innerHTML = `
        <div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          <p class="font-bold">Could not load tables.</p>
          <p class="text-sm mt-1"><strong>Error:</strong> ${error.message}</p>
        </div>`;
      return;
    }

    loadingSpinner.classList.add('hidden');

    if (!filteredTables || filteredTables.length === 0) {
      noTablesMessage.classList.remove('hidden');
      return;
    }

    filteredTables.forEach(table => {
        const card = document.createElement('div');
        card.className = `bg-white rounded-xl shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 ${currentUserState.joinedTableId === table.id ? 'ring-2 ring-brand-accent' : ''} ${table.is_cancelled ? 'opacity-60' : ''}`;

        const spotsLeft = table.total_spots - table.spots_filled;
        const isFull = spotsLeft <= 0;
        const isUserJoined = currentUserState.isLoggedIn && currentUserState.joinedTableId === table.id;
        const isUserWaitlisted = currentUserState.isLoggedIn && currentUserState.waitlistedTableIds.includes(table.id);

      // Past gating for actions
        const now = new Date();
        const tableStart = table.dinner_date ? new Date(table.dinner_date) : null;
        const isPast = tableStart ? tableStart < now : false;
        const requiresLogin = !currentUserState.isLoggedIn;

        let button;
        if (table.is_cancelled) {
            button = createButton('Cancelled', ['btn-disabled'], true);
        } else if (isPast) {
            button = createButton('Past', ['btn-disabled'], true);
        } else if (requiresLogin) {
            // not logged in → always funnel to Account modal
            button = createButton('Log in to Join', ['login-to-join', 'btn-primary']);
            button.dataset.tableId = table.id;
        } else if (isUserJoined) {
            if (table.is_locked) {
                button = createButton('Locked In', ['btn-disabled'], true);
            } else {
                button = createButton('Leave Table', ['leave-button', 'btn-secondary']);
                button.dataset.tableId = table.id;
            }
        } else {
            if (isFull) {
                if (isUserWaitlisted) {
                button = createButton('Leave Waitlist', ['leave-waitlist-button', 'btn-secondary']);
                button.dataset.tableId = table.id;
                } else {
                button = createButton('Join Waitlist', ['join-waitlist-button', 'btn-primary']);
                button.dataset.tableId = table.id;
                }
            } else {
                if (currentUserState.joinedTableId) {
                button = createButton('In Another Table', ['btn-disabled'], true);
                } else {
                button = createButton('Join Table', ['join-button', 'btn-primary']);
                button.dataset.tableId = table.id;
                }
            }
        }


      let bannerHTML = '';
      if (table.is_cancelled) {
        bannerHTML = '<div class="cancelled-banner text-center p-2 text-sm font-semibold font-sans">This dinner has been cancelled.</div>';
      } else if (table.is_locked && isUserJoined) {
        bannerHTML = '<div class="locked-in-banner text-center p-2 text-sm font-semibold font-sans">You are locked in for this dinner!</div>';
      }

      let themeHTML = '';
      if (table.theme) {
        themeHTML = `<span class="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${table.theme}</span>`;
      }

      // Dots (robust)
      const totalRaw  = Number(table.total_spots);
      const filledRaw = Number(table.spots_filled);
      const minRaw    = Number(table.min_spots);
      const filled = Number.isFinite(filledRaw) ? Math.max(0, filledRaw) : 0;
      let total = Number.isFinite(totalRaw) ? totalRaw : Number.isFinite(minRaw) ? minRaw : (filled > 0 ? filled : 0);
      let min   = Number.isFinite(minRaw) ? minRaw : Math.max(0, Math.min(total, filled));
      total = Math.max(total, min, filled);
      min   = Math.min(min, total);

      let dots = [];
      for (let i = 0; i < total; i++) {
        if (i < filled) {
          dots.push(`<span class="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent"></span>`);
        } else if (i < min) {
          dots.push(`<span class="inline-block h-2.5 w-2.5 rounded-full bg-brand-gray-dark"></span>`);
        } else {
          dots.push(`<span class="inline-block h-2.5 w-2.5 rounded-full bg-gray-300"></span>`);
        }
      }
      const spotsIndicatorHTML = dots.join('');
      const totalDisplay  = Number.isFinite(totalRaw)  ? totalRaw  : total;
      const filledDisplay = Number.isFinite(filledRaw) ? filledRaw : filled;

      const cardContent = document.createElement('div');
      cardContent.innerHTML = `
        ${bannerHTML}
        <div class="p-6">
          <div class="flex flex-col sm:flex-row justify-between sm:items-center">
            <div>
              <div class="flex items-center space-x-3">
                <div class="text-lg font-bold text-brand-accent font-heading">${table.time}</div>
                <div class="text-gray-400">&bull;</div>
                <div class="text-lg font-semibold text-brand-text font-heading">${table.neighborhood}</div>
              </div>
              <div class="flex items-center space-x-2 mt-1">
                <p class="text-sm text-gray-500 font-sans">Age Range: ${table.age_range}</p>
                ${themeHTML ? `<div class="text-gray-400">&bull;</div> ${themeHTML}` : ''}
              </div>
            </div>
            <div class="mt-4 sm:mt-0 flex-shrink-0" id="button-container-${table.id}"></div>
          </div>
          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="flex items-center justify-between text-sm">
              <p class="text-gray-600 font-heading">Spots Filled:</p>
              <div class="flex items-center flex-wrap gap-1">
                ${spotsIndicatorHTML}
                <span class="font-medium text-brand-text">${filledDisplay}/${totalDisplay}</span>
              </div>
            </div>
          </div>
        </div>
      `;
      card.appendChild(cardContent);
      card.querySelector(`#button-container-${table.id}`).appendChild(button);
      tablesContainer.appendChild(card);
    });

    document.querySelectorAll('.join-button').forEach(button => button.addEventListener('click', handleJoinClick));
    document.querySelectorAll('.leave-button').forEach(button => button.addEventListener('click', handleLeaveClick));
    document.querySelectorAll('.join-waitlist-button').forEach(button => button.addEventListener('click', handleJoinWaitlistClick));
    document.querySelectorAll('.leave-waitlist-button').forEach(button => button.addEventListener('click', handleLeaveWaitlistClick));
    document.querySelectorAll('.login-to-join').forEach(btn => {
        btn.addEventListener('click', () => openAccount());
    });
  };

  // --- EVENT HANDLERS ---
const handleJoinClick = async (e) => {
    if (!currentUserState.isLoggedIn) {
        // not logged in → open Account modal and stop
        openAccount();
        return;
    }
    selectedTableId = parseInt(e.target.dataset.tableId);
    signupAction = 'join';
    const { data: table } = await supabaseClient.from('tables').select('time, neighborhood').eq('id', selectedTableId).single();
    if (table) {
      modalTableDetails.innerHTML = `You're joining the <strong>${table.time}</strong> dinner in <strong>${table.neighborhood}</strong>.`;
    }
    joinModalTitle.textContent = "Join the Table";
    openModal(joinModal);
  };

const handleLeaveClick = async (e) => {
    const tableId = parseInt(e.target.dataset.tableId);
    try {
      const { error } = await supabaseClient.functions.invoke('leave-table', {
        body: { tableId, userId: currentUserState.userId }
      });
      if (error) throw error;
      await refreshData();
    } catch (error) {
      alert(`Error leaving table: ${error.message}`);
    }
  };

const handleJoinWaitlistClick = async (e) => {
    if (!currentUserState.isLoggedIn) {
        openAccount();
        return;
    }
    selectedTableId = parseInt(e.target.dataset.tableId);
    signupAction = 'waitlist';

    if (!currentUserState.isLoggedIn) {
      const { data: table } = await supabaseClient.from('tables').select('time, neighborhood').eq('id', selectedTableId).single();
      if (table) {
        modalTableDetails.innerHTML = `You're joining the waitlist for the <strong>${table.time}</strong> dinner in <strong>${table.neighborhood}</strong>.`;
      }
      joinModalTitle.textContent = "Join the Waitlist";
      openModal(joinModal);
      return;
    }

    try {
      const { error } = await supabaseClient.functions.invoke('join-waitlist', {
        body: { tableId: selectedTableId, userId: currentUserState.userId }
      });
      if (error) throw error;
      await refreshData();
    } catch (error) {
      alert(`Error joining waitlist: ${error.message}`);
    }
  };

  const handleLeaveWaitlistClick = async (e) => {
    const tableId = parseInt(e.target.dataset.tableId);
    try {
      const { error } = await supabaseClient.functions.invoke('leave-waitlist', {
        body: { tableId, userId: currentUserState.userId }
      });
      if (error) throw error;
      await refreshData();
    } catch (error) {
      alert(`Error leaving waitlist: ${error.message}`);
    }
  };

  // Join modal form (phone-first, legacy path still supported)
  userInfoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError1.classList.add('hidden');
    joinSubmitButton.disabled = true;

    if (isNewUserFlow) {
      // NEW USER
      const formData = {
        firstName: document.getElementById('first-name').value,
        phoneNumber: document.getElementById('phone-number').value,
        ageRange: document.getElementById('age-range').value,
        referralSource: document.getElementById('referral-source').value,
        marketingOptIn: document.getElementById('marketing-checkbox').checked,
        tableId: selectedTableId
      };
      if (!formData.firstName || !formData.ageRange) {
        formError1.textContent = "Please fill out all your details.";
        formError1.classList.remove('hidden');
        joinSubmitButton.disabled = false;
        return;
      }

      try {
        const functionName = signupAction === 'join' ? 'signup-and-join' : 'signup-and-waitlist';
        const { data, error } = await supabaseClient.functions.invoke(functionName, { body: formData });
        if (error) throw error;

        localStorage.setItem('supdinner_user_id', data.userId);

        // Ensure Stripe customer for this new user
        try {
          await supabaseClient.functions.invoke('stripe-create-customer', { body: { userId: currentUserState.userId } });
        } catch (err) { console.error('Error ensuring Stripe customer (new user):', err); }

        // Collateral only for join
        if (signupAction === 'join') {
          if (!selectedTableId) {
            alert('Sorry—could not determine which table you selected. Please close and try again.');
            return;
          }

          // dinner_date for daysDiff
          const { data: t } = await supabaseClient.from('tables').select('id, dinner_date').eq('id', selectedTableId).maybeSingle();
          let dinnerDate = null;
          if (t?.dinner_date) dinnerDate = new Date(t.dinner_date);
          else if (activeDate) dinnerDate = new Date(`${activeDate}T00:00:00`);

          const collateralCents = COLLATERAL_CENTS_DEFAULT;
          let daysDiff = 0;
          if (dinnerDate instanceof Date && !isNaN(dinnerDate.getTime())) {
            const now = new Date();
            daysDiff = (dinnerDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          }

          const stripeReady = !!window.Stripe && STRIPE_PUBLISHABLE_KEY && !STRIPE_PUBLISHABLE_KEY.includes('replace_me');
          if (stripeReady) {
            if (daysDiff > 7) {
              const { data: siRes, error: siErr } = await supabaseClient.functions.invoke('stripe-create-setup-intent', {
                body: { userId: data.userId, tableId: selectedTableId, collateral_cents: collateralCents }
              });
              if (siErr || !siRes?.client_secret) {
                alert('Payment setup failed. Please try again.');
                return;
              }
              await confirmSetupIntent(siRes.client_secret);
            } else {
              const { data: piRes, error: piErr } = await supabaseClient.functions.invoke('stripe-create-hold', {
                body: { userId: data.userId, tableId: selectedTableId, collateral_cents: collateralCents }
              });
              if (piErr || !piRes?.client_secret) {
                alert('Card hold failed. Please try again.');
                return;
              }
              await confirmPaymentIntent(piRes.client_secret);
            }
          } else {
            console.warn('Stripe not configured; skipping collateral flow for new user join.');
            showSuccessStep();
          }
        } else {
          showSuccessStep();
        }
      } catch (error) {
        formError1.textContent = `Error: ${error.message}`;
        formError1.classList.remove('hidden');
        joinSubmitButton.disabled = false;
      }
    } else {
      // EXISTING USER (legacy: phone lookup)
      const phoneNumber = document.getElementById('phone-number').value;
      if (!phoneNumber) {
        formError1.textContent = "Please enter your phone number.";
        formError1.classList.remove('hidden');
        joinSubmitButton.disabled = false;
        return;
      }
      try {
        const { data, error } = await supabaseClient.functions.invoke('get-user-by-phone', { body: { phoneNumber } });
        if (error) throw error;

        if (!data.userId) {
          isNewUserFlow = true;
          newUserFields.classList.remove('hidden');
          joinSubmitButton.textContent = signupAction === 'join' ? 'Confirm & Join Table' : 'Confirm & Join Waitlist';
          joinSubmitButton.disabled = !disclaimerCheckbox.checked;
        } else {
          localStorage.setItem('supdinner_user_id', data.userId);

          if (signupAction === 'join') {
            if (!selectedTableId) {
              alert('Sorry—could not determine which table you selected. Please close and try again.');
              return;
            }

            // defer actual join until Stripe confirms
            pendingPostStripeAction = async () => {
              const { error: actionError } = await supabaseClient.functions.invoke('join-table', {
                body: { tableId: selectedTableId, userId: data.userId }
              });
              if (actionError) throw actionError;
            };

            const { data: t } = await supabaseClient.from('tables').select('id, dinner_date').eq('id', selectedTableId).maybeSingle();
            let dinnerDate = null;
            if (t?.dinner_date) dinnerDate = new Date(t.dinner_date);
            else if (activeDate) dinnerDate = new Date(`${activeDate}T00:00:00`);

            const collateralCents = COLLATERAL_CENTS_DEFAULT;
            let daysDiff = 0;
            if (dinnerDate instanceof Date && !isNaN(dinnerDate.getTime())) {
              const now = new Date();
              daysDiff = (dinnerDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            }

            const stripeReady = !!window.Stripe && STRIPE_PUBLISHABLE_KEY && !STRIPE_PUBLISHABLE_KEY.includes('replace_me');
            if (!stripeReady) {
              console.warn('Stripe not configured; performing unguarded join.');
              await pendingPostStripeAction();
              pendingPostStripeAction = null;
              showSuccessStep();
              return;
            }

            if (daysDiff > 7) {
              const { data: siRes, error: siErr } = await supabaseClient.functions.invoke('stripe-create-setup-intent', {
                body: { userId: data.userId, tableId: selectedTableId, collateral_cents: collateralCents }
              });
              if (siErr || !siRes?.client_secret) {
                alert('Payment setup failed. Please try again.');
                return;
              }
              await confirmSetupIntent(siRes.client_secret);
            } else {
              const { data: piRes, error: piErr } = await supabaseClient.functions.invoke('stripe-create-hold', {
                body: { userId: data.userId, tableId: selectedTableId, collateral_cents: collateralCents }
              });
              if (piErr || !piRes?.client_secret) {
                alert('Card hold failed. Please try again.');
                return;
              }
              await confirmPaymentIntent(piRes.client_secret);
            }
          } else {
            const { error: actionError } = await supabaseClient.functions.invoke('join-waitlist', {
              body: { tableId: selectedTableId, userId: data.userId }
            });
            if (actionError) throw actionError;
            showSuccessStep();
          }
        }
      } catch (error) {
        formError1.textContent = `Error: ${error.message}`;
        formError1.classList.remove('hidden');
        joinSubmitButton.disabled = false;
      }
    }
  });

  // Logout
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('supdinner_user_id');
    supabaseClient.auth.signOut().finally(refreshData);
  });

  // Request modal
  requestTableBtn.addEventListener('click', () => openModal(requestModal));
  closeRequestModal1.addEventListener('click', () => closeModal(requestModal));
  closeRequestModal2.addEventListener('click', () => closeModal(requestModal));
  requestModal.addEventListener('click', (e) => { if (e.target === requestModal) closeModal(requestModal); });
  requestDisclaimerCheckbox.addEventListener('change', () => {
    requestSubmitButton.disabled = !requestDisclaimerCheckbox.checked;
  });
  requestInfoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    requestFormError.classList.add('hidden');
    const formData = {
      name: document.getElementById('request-name').value,
      phone: document.getElementById('request-phone').value,
      day: document.getElementById('request-day').value,
      time: document.getElementById('request-time').value,
      neighborhood: document.getElementById('request-neighborhood').value,
      ageRange: document.getElementById('request-age-range').value,
      theme: document.getElementById('request-theme').value,
    };
    try {
      const { error } = await supabaseClient.functions.invoke('send-request-notification', { body: formData });
      if (error) throw error;
      showModalStep(2, requestModal);
    } catch (error) {
      requestFormError.textContent = `Error: ${error.message}`;
      requestFormError.classList.remove('hidden');
    }
  });

  // Phone login modal (legacy)
  closeLoginModal.addEventListener('click', () => closeModal(loginModal));
  loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModal(loginModal); });
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginFormError.classList.add('hidden');
    const phoneNumber = document.getElementById('login-phone-number').value;
    if (!phoneNumber) {
      loginFormError.textContent = "Please enter your phone number.";
      loginFormError.classList.remove('hidden');
      return;
    }
    try {
      const { data, error } = await supabaseClient.functions.invoke('get-user-by-phone', { body: { phoneNumber } });
      if (error) throw error;
      if (data.userId) {
        localStorage.setItem('supdinner_user_id', data.userId);
        closeModal(loginModal);
        refreshData();
      } else {
        loginFormError.textContent = "No user found with this phone number.";
        loginFormError.classList.remove('hidden');
      }
    } catch (error) {
      loginFormError.textContent = `Error: ${error.message}`;
      loginFormError.classList.remove('hidden');
    }
  });

  // Account modal events
  loginButton.addEventListener('click', () => openAccount());
  accountClose.addEventListener('click', () => closeAccount());
  accountModal.addEventListener('click', (e) => { if (e.target === accountModal) closeAccount(); });

  tabLogin.addEventListener('click', () => {
    tabLogin.className = 'px-3 py-1 rounded bg-gray-900 text-white';
    tabSignup.className = 'px-3 py-1 rounded bg-gray-200';
    formLogin.classList.remove('hidden');
    formSignup.classList.add('hidden');
  });
  tabSignup.addEventListener('click', () => {
    tabSignup.className = 'px-3 py-1 rounded bg-gray-900 text-white';
    tabLogin.className = 'px-3 py-1 rounded bg-gray-200';
    formSignup.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorBox.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // We may not have phone/first/age here—pass empty; function won’t overwrite non-nulls.
      await linkOrCreateProfile({});

      closeAccount();
      await refreshData();
    } catch (e2) {
      loginErrorBox.textContent = e2.message || 'Login failed';
    }
  });

formSignup.addEventListener('submit', async (e) => {
  e.preventDefault();
  signupErrorBox.textContent = '';

  const first = document.getElementById('su-first').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pass  = document.getElementById('su-pass').value;
  const age   = document.getElementById('su-age').value;

  if (!first || !phone || !age) {
    signupErrorBox.textContent = 'Please fill first, phone, and age range.';
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: 'https://joshuachunggg.github.io/', // your live URL
        data: { first_name: first, phone_number: phone, age_range: age }
      }
    });
    if (error) throw error;

    // If email confirmation is ON, user may not be logged in yet.
    // After they confirm and return, we’ll run the same link call on login.

    // Try linking immediately (works if session exists right away)
    await linkOrCreateProfile({ first_name: first, phone_number: phone, age_range: age });

    closeAccount();
    await refreshData();
  } catch (err) {
    signupErrorBox.textContent = err.message || 'Signup failed';
  }
});



  // --- STRIPE MODAL CONTROLS ---
  function openCardModal() {
    cardModal.classList.remove('hidden');
    setTimeout(() => {
      cardModal.classList.remove('opacity-0');
      cardModalContent.classList.remove('scale-95');
    }, 10);
  }
  function closeCardModalModalOnly() {
    cardModal.classList.add('opacity-0');
    cardModalContent.classList.add('scale-95');
    setTimeout(() => {
      cardModal.classList.add('hidden');
      if (cardForm) cardForm.reset();
      cardErrors.classList.add('hidden');
      cardErrors.textContent = '';
      pendingClientSecret = null;
      pendingMode = null;
    }, 300);
  }

  async function initStripeIfNeeded() {
    if (!stripe) {
      stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
      elements = stripe.elements();
      cardElement = elements.create('card');
      cardElement.mount(cardElementMount);
    }
  }
  async function confirmSetupIntent(clientSecret) {
    await initStripeIfNeeded();
    pendingClientSecret = clientSecret;
    pendingMode = 'setup';
    openCardModal();
  }
  async function confirmPaymentIntent(clientSecret) {
    await initStripeIfNeeded();
    pendingClientSecret = clientSecret;
    pendingMode = 'payment';
    openCardModal();
  }

  // Stripe card form submit
  cardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingClientSecret || !pendingMode) return;

    cardConfirmButton.disabled = true;
    cardErrors.classList.add('hidden');
    cardErrors.textContent = '';

    try {
      let result;
      if (pendingMode === 'setup') {
        result = await stripe.confirmCardSetup(pendingClientSecret, { payment_method: { card: cardElement } });
      } else {
        result = await stripe.confirmCardPayment(pendingClientSecret, { payment_method: { card: cardElement } });
      }

      if (result.error) {
        cardErrors.textContent = result.error.message || 'Card confirmation failed.';
        cardErrors.classList.remove('hidden');
        cardConfirmButton.disabled = false;
        return;
      }

      // Success → perform deferred join
      closeCardModalModalOnly();
      try {
        if (typeof pendingPostStripeAction === 'function') {
          await pendingPostStripeAction();
        }
      } finally {
        pendingPostStripeAction = null;
      }

      await refreshData();
      showSuccessStep();
    } catch (err) {
      cardErrors.textContent = err.message || 'Unexpected error.';
      cardErrors.classList.remove('hidden');
      cardConfirmButton.disabled = false;
    }
  });

  // --- REFRESH LOGIC ---
  async function refreshData() {
    // If session exists, sync numeric users.id to localStorage for your existing flows
    const { data: { session} } = await supabaseClient.auth.getSession();
    if (session?.user) {
      try {
        const userId = await ensureUserRowFromSession();
        if (userId) localStorage.setItem('supdinner_user_id', String(userId));
      } catch {}
    }

    const localUserId = localStorage.getItem('supdinner_user_id');

    if (localUserId) {
      loginButton.classList.add('hidden');

      // 1) profile
      const { data: profile, error: pErr } = await supabaseClient
        .from('users')
        .select('first_name, is_suspended, suspension_end_date, phone_number')
        .eq('id', localUserId)
        .single();

      if (pErr || !profile) {
        localStorage.removeItem('supdinner_user_id');
        currentUserState = {
          isLoggedIn: false, userId: null, joinedTableId: null,
          waitlistedTableIds: [], isSuspended: false, suspensionEndDate: null
        };
        userStatusDiv.classList.add('hidden');
        if (activeDate) await renderTables(activeDate);
        return;
      }

      // 2) joinedTableId only for future dinners (RLS-safe: no join)
      const { data: mySignups } = await supabaseClient
        .from('signups')
        .select('table_id')
        .eq('user_id', localUserId);

      let joinedTableId = null;
      if (mySignups && mySignups.length) {
        const nowIso = new Date().toISOString();
        const tableIds = [...new Set(mySignups.map(s => s.table_id))];
        const { data: myTables } = await supabaseClient
          .from('tables')
          .select('id, dinner_date')
          .in('id', tableIds)
          .gte('dinner_date', nowIso)
          .order('dinner_date', { ascending: true })
          .limit(1);
        if (myTables && myTables.length) joinedTableId = myTables[0].id;
      }

      // 3) waitlists
      const { data: waitlists } = await supabaseClient
        .from('waitlists')
        .select('table_id')
        .eq('user_id', localUserId);

      // 4) state + UI
      currentUserState = {
        isLoggedIn: true,
        userId: localUserId,
        joinedTableId,
        waitlistedTableIds: waitlists ? waitlists.map(w => w.table_id) : [],
        isSuspended: profile.is_suspended,
        suspensionEndDate: profile.suspension_end_date,
        name: profile.first_name,
        phone: profile.phone_number
      };

      userGreetingSpan.textContent = `Welcome, ${profile.first_name}!`;
      userStatusDiv.classList.remove('hidden');
      const reqName = document.getElementById('request-name');
      const reqPhone = document.getElementById('request-phone');
      if (reqName) reqName.value = profile.first_name || '';
      if (reqPhone) reqPhone.value = profile.phone_number || '';

      // 5) ensure Stripe customer
      try {
        await supabaseClient.functions.invoke('stripe-create-customer', { body: { userId: currentUserState.userId } });
      } catch (err) { console.error('Error ensuring Stripe customer:', err); }

    } else {
      loginButton.classList.remove('hidden');
      currentUserState = {
        isLoggedIn: false, userId: null, joinedTableId: null,
        waitlistedTableIds: [], isSuspended: false, suspensionEndDate: null
      };
      userStatusDiv.classList.add('hidden');
    }

    if (activeDate) await renderTables(activeDate);
  }

  // --- INIT ---
  closeButton1.addEventListener('click', () => closeModal(joinModal));
  closeButton3.addEventListener('click', () => closeModal(joinModal));
  joinModal.addEventListener('click', (e) => { if (e.target === joinModal) closeModal(joinModal); });
  closeCardModal.addEventListener('click', () => closeCardModalModalOnly());
  cardModal.addEventListener('click', (e) => { if (e.target === cardModal) closeCardModalModalOnly(); });

  disclaimerCheckbox.addEventListener('change', () => {
    if (isNewUserFlow) joinSubmitButton.disabled = !disclaimerCheckbox.checked;
  });

  const initialize = async () => {
    try {
      await initStripeIfNeeded();
      const { data: dates, error: datesError } = await supabaseClient.rpc('get_distinct_upcoming_dates');
      if (datesError) throw datesError;

      if (dates && dates.length > 0) {
        renderTabs(dates);
        await refreshData();
      } else {
        loadingSpinner.classList.add('hidden');
        noTablesMessage.textContent = "No upcoming dinners are scheduled. Check back soon!";
        noTablesMessage.classList.remove('hidden');
      }
    } catch (error) {
      console.error("Initialization failed:", error);
      loadingSpinner.classList.add('hidden');
      tablesContainer.innerHTML = `<p class="text-center text-red-500">Could not initialize the application. Please try refreshing the page.</p>`;
    }
  };

  initialize();
});
