document.addEventListener('DOMContentLoaded', () => {

    // --- SUPABASE CLIENT INITIALIZATION ---
    const SUPABASE_URL = 'https://ennlvlcogzowropkwbiu.supabase.co'; // PASTE YOUR PROJECT URL HERE
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubmx2bGNvZ3pvd3JvcGt3Yml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MTIyMTAsImV4cCI6MjA2OTQ4ODIxMH0.dCsyTAsAhcvSpeUMxWSyo_9praZC2wPDzmb3vCkHpPc'; // PASTE YOUR ANON PUBLIC KEY HERE
    
    if (SUPABASE_URL.includes('your-project-ref') || SUPABASE_ANON_KEY.includes('your-long-anon-key')) {
        const container = document.querySelector('.container');
        container.innerHTML = `<div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <h2 class="font-bold text-lg">Configuration Needed</h2>
            <p class="mt-2">Please open the HTML code and replace the placeholder <strong>SUPABASE_URL</strong> and <strong>SUPABASE_ANON_KEY</strong> with your actual keys from your Supabase project dashboard.</p>
        </div>`;
        return;
    }

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- GLOBAL STATE ---
    let currentUserState = {
        isLoggedIn: false,
        userId: null,
        joinedTableId: null,
        waitlistedTableIds: [],
        isSuspended: false,
        suspensionEndDate: null
    };
    let activeDate = '';
    let selectedTableId = null;
    let signupAction = 'join'; // 'join' or 'waitlist'
    let isNewUserFlow = false;

    // --- DOM ELEMENT REFERENCES ---
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

    // Login Modal elements
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginFormError = document.getElementById('login-form-error');
    const closeLoginModal = document.getElementById('close-login-modal');

    // Request Modal elements
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

    // Forms and buttons
    const userInfoForm = document.getElementById('user-info-form');
    const formError1 = document.getElementById('form-error-1');
    const closeButton1 = document.getElementById('close-modal-1');
    const closeButton3 = document.getElementById('close-modal-3');

    // --- CORE FUNCTIONS ---

    const renderTables = async (dateString) => {
        tablesContainer.innerHTML = '';
        loadingSpinner.classList.remove('hidden');
        noTablesMessage.classList.add('hidden');

        const { data: filteredTables, error } = await supabaseClient.rpc('get_tables_for_day', {
            day_string: dateString
        });

        if (error) {
            console.error('Error fetching tables:', error);
            loadingSpinner.classList.add('hidden');
            tablesContainer.innerHTML = `<div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                <p class="font-bold">Could not load tables.</p>
                <p class="text-sm mt-1"><strong>Error:</strong> ${error.message}</p>
                <p class="text-xs mt-2">Please check your Supabase URL, anon key, and that you have enabled Row Level Security (RLS) with a read policy on the 'tables' table.</p>
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

            let button;
            if (table.is_cancelled) {
                button = createButton('Cancelled', ['btn-disabled'], true);
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
            if(table.theme) {
                themeHTML = `<span class="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${table.theme}</span>`;
            }

            // FIX: Rewrote dot rendering logic to be more robust and handle null values.
            const total = parseInt(table.total_spots, 10) || 0;
            const filled = parseInt(table.spots_filled, 10) || 0;
            let min = parseInt(table.min_spots, 10);
            if (isNaN(min) || min < 0) min = 0; // Only set to 0 if invalid
            
            let dots = [];
            for (let i = 0; i < total; i++) {
                if (i < filled) {
                    // Orange: filled
                    dots.push(`<span class="h-2.5 w-2.5 rounded-full bg-brand-accent"></span>`);
                } else if (i < min) {
                    // Dark grey: required but not filled
                    dots.push(`<span class="h-2.5 w-2.5 rounded-full bg-brand-gray-dark"></span>`);
                } else {
                    // Light grey: optional, not filled
                    dots.push(`<span class="h-2.5 w-2.5 rounded-full bg-gray-300"></span>`);
                }
            }
            const spotsIndicatorHTML = dots.join('');


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
                        <div class="mt-4 sm:mt-0 flex-shrink-0" id="button-container-${table.id}">
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-200">
                        <div class="flex items-center justify-between text-sm">
                            <p class="text-gray-600 font-heading">Spots Filled:</p>
                            <div class="flex items-center space-x-1.5">
                                ${spotsIndicatorHTML}
                                <span class="font-medium text-brand-text">${table.spots_filled}/${table.total_spots}</span>
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
    };

    function createButton(text, classes = [], disabled = false) {
        const button = document.createElement('button');
        button.textContent = text;
        const baseClasses = ['supdinner-button'];
        button.classList.add(...baseClasses, ...classes);
        if (disabled) {
            button.disabled = true;
        }
        return button;
    }
    
    const renderTabs = (dates) => {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        dayTabsContainer.innerHTML = '';
        let tabsHtml = '';
        let previousDayIndex = -1;

        dates.forEach((dateString, index) => {
            const date = new Date(dateString + 'T00:00:00'); 
            const currentDayIndex = date.getDay();
            
            if (index > 0 && currentDayIndex < previousDayIndex) {
                tabsHtml += `<div class="week-separator"></div>`;
            }
            
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

    // --- EVENT HANDLERS ---
    
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

    const handleJoinClick = async (e) => {
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

    userInfoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formError1.classList.add('hidden');
        joinSubmitButton.disabled = true;

        if (isNewUserFlow) {
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
                showSuccessStep();
            } catch(error) {
                formError1.textContent = `Error: ${error.message}`;
                formError1.classList.remove('hidden');
                joinSubmitButton.disabled = false;
            }
        } else {
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
                    const functionName = signupAction === 'join' ? 'join-table' : 'join-waitlist';
                    const { error: actionError } = await supabaseClient.functions.invoke(functionName, {
                        body: {
                            tableId: selectedTableId,
                            userId: data.userId
                        }
                    });

                    if (actionError) throw actionError;
                    
                    showSuccessStep();
                }
            } catch (error) {
                formError1.textContent = `Error: ${error.message}`;
                formError1.classList.remove('hidden');
                joinSubmitButton.disabled = false;
            }
        }
    });

    logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('supdinner_user_id');
        refreshData();
    });
    
    requestTableBtn.addEventListener('click', () => {
        openModal(requestModal);
    });

    loginButton.addEventListener('click', () => {
        openModal(loginModal);
    });

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
            } else {
                loginFormError.textContent = "No user found with this phone number.";
                loginFormError.classList.remove('hidden');
            }
        } catch(error) {
            loginFormError.textContent = `Error: ${error.message}`;
            loginFormError.classList.remove('hidden');
        }
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
        } catch(error) {
            requestFormError.textContent = `Error: ${error.message}`;
            requestFormError.classList.remove('hidden');
        }
    });

    disclaimerCheckbox.addEventListener('change', () => {
        if (isNewUserFlow) {
            joinSubmitButton.disabled = !disclaimerCheckbox.checked;
        }
    });

    requestDisclaimerCheckbox.addEventListener('change', () => {
        requestSubmitButton.disabled = !requestDisclaimerCheckbox.checked;
    });


    // --- MODAL CONTROLS ---
    
    function openModal(modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.modal-content').classList.remove('scale-95');
        }, 10);
    }

    function closeModal(modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('.modal-content').classList.add('scale-95');
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
            if (modal === loginModal) {
                loginFormError.classList.add('hidden');
            }
            refreshData();
        }, 300);
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

    closeButton1.addEventListener('click', () => closeModal(joinModal));
    closeButton3.addEventListener('click', () => closeModal(joinModal));
    joinModal.addEventListener('click', (e) => { if (e.target === joinModal) closeModal(joinModal); });

    closeLoginModal.addEventListener('click', () => closeModal(loginModal));
    loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModal(loginModal); });

    closeRequestModal1.addEventListener('click', () => closeModal(requestModal));
    closeRequestModal2.addEventListener('click', () => closeModal(requestModal));
    requestModal.addEventListener('click', (e) => { if (e.target === requestModal) closeModal(requestModal); });


    // --- INITIALIZATION & REFRESH LOGIC ---

    async function refreshData() {
        const localUserId = localStorage.getItem('supdinner_user_id');

        if (localUserId) {
            loginButton.classList.add('hidden');
            const { data: profile } = await supabaseClient.from('users').select('first_name, is_suspended, suspension_end_date, phone_number').eq('id', localUserId).single();
            const { data: signup } = await supabaseClient.from('signups').select('table_id').eq('user_id', localUserId).maybeSingle();
            const { data: waitlists } = await supabaseClient.from('waitlists').select('table_id').eq('user_id', localUserId);

            if (profile) {
                currentUserState = {
                    isLoggedIn: true,
                    userId: localUserId,
                    joinedTableId: signup ? signup.table_id : null,
                    waitlistedTableIds: waitlists ? waitlists.map(w => w.table_id) : [],
                    isSuspended: profile.is_suspended,
                    suspensionEndDate: profile.suspension_end_date,
                    name: profile.first_name,
                    phone: profile.phone_number
                };
                userGreetingSpan.textContent = `Welcome, ${profile.first_name}!`;
                userStatusDiv.classList.remove('hidden');
                document.getElementById('request-name').value = profile.first_name;
                document.getElementById('request-phone').value = profile.phone_number;
            } else {
                localStorage.removeItem('supdinner_user_id');
                currentUserState = { isLoggedIn: false, userId: null, joinedTableId: null, waitlistedTableIds: [], isSuspended: false, suspensionEndDate: null };
                userStatusDiv.classList.add('hidden');
            }
        } else {
            loginButton.classList.remove('hidden');
            currentUserState = { isLoggedIn: false, userId: null, joinedTableId: null, waitlistedTableIds: [], isSuspended: false, suspensionEndDate: null };
            userStatusDiv.classList.add('hidden');
        }
        
        if (activeDate) {
            await renderTables(activeDate);
        }
    };

    const initialize = async () => {
        try {
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

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- GLOBAL STATE ---
    let currentUserState = {
        isLoggedIn: false,
        userId: null,
        joinedTableId: null,
        waitlistedTableIds: [],
        isSuspended: false,
        suspensionEndDate: null
    };
    let activeDate = '';
    let selectedTableId = null;
    let signupAction = 'join'; // 'join' or 'waitlist'
    let isNewUserFlow = false;

    // --- DOM ELEMENT REFERENCES ---
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

    // Login Modal elements
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const loginFormError = document.getElementById('login-form-error');
    const closeLoginModal = document.getElementById('close-login-modal');

    // Request Modal elements
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

    // Forms and buttons
    const userInfoForm = document.getElementById('user-info-form');
    const formError1 = document.getElementById('form-error-1');
    const closeButton1 = document.getElementById('close-modal-1');
    const closeButton3 = document.getElementById('close-modal-3');

    // --- CORE FUNCTIONS ---

    const renderTables = async (dateString) => {
        tablesContainer.innerHTML = '';
        loadingSpinner.classList.remove('hidden');
        noTablesMessage.classList.add('hidden');

        const { data: filteredTables, error } = await supabaseClient.rpc('get_tables_for_day', {
            day_string: dateString
        });

        if (error) {
            console.error('Error fetching tables:', error);
            loadingSpinner.classList.add('hidden');
            tablesContainer.innerHTML = `<div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                <p class="font-bold">Could not load tables.</p>
                <p class="text-sm mt-1"><strong>Error:</strong> ${error.message}</p>
                <p class="text-xs mt-2">Please check your Supabase URL, anon key, and that you have enabled Row Level Security (RLS) with a read policy on the 'tables' table.</p>
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

            let button;
            if (table.is_cancelled) {
                button = createButton('Cancelled', ['btn-disabled'], true);
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
            if(table.theme) {
                themeHTML = `<span class="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${table.theme}</span>`;
            }

            // FIX: Rewrote dot rendering logic to be more robust and handle null values.
            const total = parseInt(table.total_spots, 10) || 0;
            const filled = parseInt(table.spots_filled, 10) || 0;
            let min = parseInt(table.min_spots, 10) || 0;
            if (min <= 0) {
                min = total;
            }
            let dots = [];
            for (let i = 0; i < total; i++) {
                if (i < filled) {
                    dots.push(`<span class="h-2.5 w-2.5 rounded-full bg-brand-accent"></span>`);
                } else if (i < min) {
                    dots.push(`<span class="h-2.5 w-2.5 rounded-full bg-brand-gray-dark"></span>`);
                } else {
                    dots.push(`<span class="h-2.5 w-2.5 rounded-full bg-gray-300"></span>`);
                }
            }
            const spotsIndicatorHTML = dots.join('');


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
                        <div class="mt-4 sm:mt-0 flex-shrink-0" id="button-container-${table.id}">
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-200">
                        <div class="flex items-center justify-between text-sm">
                            <p class="text-gray-600 font-heading">Spots Filled:</p>
                            <div class="flex items-center space-x-1.5">
                                ${spotsIndicatorHTML}
                                <span class="font-medium text-brand-text">${table.spots_filled}/${table.total_spots}</span>
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
    };

    function createButton(text, classes = [], disabled = false) {
        const button = document.createElement('button');
        button.textContent = text;
        const baseClasses = ['supdinner-button'];
        button.classList.add(...baseClasses, ...classes);
        if (disabled) {
            button.disabled = true;
        }
        return button;
    }
    
    const renderTabs = (dates) => {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        dayTabsContainer.innerHTML = '';
        let tabsHtml = '';
        let previousDayIndex = -1;

        dates.forEach((dateString, index) => {
            const date = new Date(dateString + 'T00:00:00'); 
            const currentDayIndex = date.getDay();
            
            if (index > 0 && currentDayIndex < previousDayIndex) {
                tabsHtml += `<div class="week-separator"></div>`;
            }
            
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

    // --- EVENT HANDLERS ---
    
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

    const handleJoinClick = async (e) => {
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

    userInfoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formError1.classList.add('hidden');
        joinSubmitButton.disabled = true;

        if (isNewUserFlow) {
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
                showSuccessStep();
            } catch(error) {
                formError1.textContent = `Error: ${error.message}`;
                formError1.classList.remove('hidden');
                joinSubmitButton.disabled = false;
            }
        } else {
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
                    const functionName = signupAction === 'join' ? 'join-table' : 'join-waitlist';
                    const { error: actionError } = await supabaseClient.functions.invoke(functionName, {
                        body: {
                            tableId: selectedTableId,
                            userId: data.userId
                        }
                    });

                    if (actionError) throw actionError;
                    
                    showSuccessStep();
                }
            } catch (error) {
                formError1.textContent = `Error: ${error.message}`;
                formError1.classList.remove('hidden');
                joinSubmitButton.disabled = false;
            }
        }
    });

    logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('supdinner_user_id');
        refreshData();
    });
    
    requestTableBtn.addEventListener('click', () => {
        openModal(requestModal);
    });

    loginButton.addEventListener('click', () => {
        openModal(loginModal);
    });

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
            } else {
                loginFormError.textContent = "No user found with this phone number.";
                loginFormError.classList.remove('hidden');
            }
        } catch(error) {
            loginFormError.textContent = `Error: ${error.message}`;
            loginFormError.classList.remove('hidden');
        }
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
        } catch(error) {
            requestFormError.textContent = `Error: ${error.message}`;
            requestFormError.classList.remove('hidden');
        }
    });

    disclaimerCheckbox.addEventListener('change', () => {
        if (isNewUserFlow) {
            joinSubmitButton.disabled = !disclaimerCheckbox.checked;
        }
    });

    requestDisclaimerCheckbox.addEventListener('change', () => {
        requestSubmitButton.disabled = !requestDisclaimerCheckbox.checked;
    });


    // --- MODAL CONTROLS ---
    
    function openModal(modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.modal-content').classList.remove('scale-95');
        }, 10);
    }

    function closeModal(modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('.modal-content').classList.add('scale-95');
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
            if (modal === loginModal) {
                loginFormError.classList.add('hidden');
            }
            refreshData();
        }, 300);
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

    closeButton1.addEventListener('click', () => closeModal(joinModal));
    closeButton3.addEventListener('click', () => closeModal(joinModal));
    joinModal.addEventListener('click', (e) => { if (e.target === joinModal) closeModal(joinModal); });

    closeLoginModal.addEventListener('click', () => closeModal(loginModal));
    loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModal(loginModal); });

    closeRequestModal1.addEventListener('click', () => closeModal(requestModal));
    closeRequestModal2.addEventListener('click', () => closeModal(requestModal));
    requestModal.addEventListener('click', (e) => { if (e.target === requestModal) closeModal(requestModal); });


    // --- INITIALIZATION & REFRESH LOGIC ---

    async function refreshData() {
        const localUserId = localStorage.getItem('supdinner_user_id');

        if (localUserId) {
            loginButton.classList.add('hidden');
            const { data: profile } = await supabaseClient.from('users').select('first_name, is_suspended, suspension_end_date, phone_number').eq('id', localUserId).single();
            const { data: signup } = await supabaseClient.from('signups').select('table_id').eq('user_id', localUserId).maybeSingle();
            const { data: waitlists } = await supabaseClient.from('waitlists').select('table_id').eq('user_id', localUserId);

            if (profile) {
                currentUserState = {
                    isLoggedIn: true,
                    userId: localUserId,
                    joinedTableId: signup ? signup.table_id : null,
                    waitlistedTableIds: waitlists ? waitlists.map(w => w.table_id) : [],
                    isSuspended: profile.is_suspended,
                    suspensionEndDate: profile.suspension_end_date,
                    name: profile.first_name,
                    phone: profile.phone_number
                };
                userGreetingSpan.textContent = `Welcome, ${profile.first_name}!`;
                userStatusDiv.classList.remove('hidden');
                document.getElementById('request-name').value = profile.first_name;
                document.getElementById('request-phone').value = profile.phone_number;
            } else {
                localStorage.removeItem('supdinner_user_id');
                currentUserState = { isLoggedIn: false, userId: null, joinedTableId: null, waitlistedTableIds: [], isSuspended: false, suspensionEndDate: null };
                userStatusDiv.classList.add('hidden');
            }
        } else {
            loginButton.classList.remove('hidden');
            currentUserState = { isLoggedIn: false, userId: null, joinedTableId: null, waitlistedTableIds: [], isSuspended: false, suspensionEndDate: null };
            userStatusDiv.classList.add('hidden');
        }
        
        if (activeDate) {
            await renderTables(activeDate);
        }
    };

    const initialize = async () => {
        try {
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
