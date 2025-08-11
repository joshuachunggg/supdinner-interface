// main.js

document.addEventListener("DOMContentLoaded", () => {
  // ---- JOIN FLOW STATE (safe across re-renders/modals) -----------------------
  const JoinState = (() => {
    const KEY = "supdinner_join_state";
    function get() {
      try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch { return {}; }
    }
    function set(patch) {
      const cur = get();
      sessionStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }));
    }
    function clear() { sessionStorage.removeItem(KEY); }
    return { get, set, clear };
  })();
  
  // --- STRIPE INIT ---
  const STRIPE_PUBLISHABLE_KEY =
    "pk_test_51RoP12090xmS47wUC7t9RjXOtqLIkZnKIphRsJaB5V2mH4MyWFT3WggYIEsr2EaDot78tYF3bZ5wVr1CC1Dc6xGy00rI5QkBOa"; // test key (swap to live in prod)
  const COLLATERAL_CENTS_DEFAULT = 1000; // $10 hold
  let stripe = null;
  let elements = null;
  let cardElement = null;

  // --- REDIRECT URL ---
  const EMAIL_REDIRECT_TO = `https://sup-380d9c.webflow.io/sign-up`; // or "/" if your app lives at root

  // state for Stripe modal confirmation
  let pendingClientSecret = null;
  let pendingMode = null; // 'setup' or 'payment'
  let pendingPostStripeAction = null; // deferred join after card confirm

  // --- SUPABASE CLIENT ---
  // Use production Supabase for development (easier than recreating everything locally)
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  const SUPABASE_URL = "https://ennlvlcogzowropkwbiu.supabase.co";  // Always use production for now
  
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubmx2bGNvZ3pvd3JvcGt3Yml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MTIyMTAsImV4cCI6MjA2OTQ4ODIxMH0.dCsyTAsAhcvSpeUMxWSyo_9praZC2wPDzmb3vCkHpPc";  // Production
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
        // Environment is production Supabase for development

  // 🔧 FIX: Simplified auth state change handler
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      const meta = session.user.user_metadata || {};
      try {
        // Simplified: just try to link/create profile once
        await linkOrCreateProfile({
          first_name: meta.first_name,
          phone_number: meta.phone_number,
          age_range: meta.age_range,
        });
      } catch (e) {
        console.warn("[post-confirm] profile setup failed:", e?.message || e);
      } finally {
        const accountModal = document.getElementById("account-modal");
        if (accountModal && !accountModal.classList.contains("hidden")) {
          accountModal.classList.add("hidden");
        }
        await refreshData();
      }
    }
  });

  // --- GLOBAL STATE ---
  let currentUserState = {
    isLoggedIn: false,
    userId: null, // numeric id from public.users
    joinedTableId: null, // future dinner only
    waitlistedTableIds: [],
    isSuspended: false,
    suspensionEndDate: null,
    name: null,
    phone: null,
  };
  let activeDate = "";
  let selectedTableId = null;
  let signupAction = "join"; // 'join' or 'waitlist'
  let isNewUserFlow = false;

  // --- DOM REFS ---
  const dayTabsContainer = document.getElementById("day-tabs");
  const tablesContainer = document.getElementById("tables-container");
  const loadingSpinner = document.getElementById("loading-spinner");
  const noTablesMessage = document.getElementById("no-tables-message");
  const userStatusDiv = document.getElementById("user-status");
  const userGreetingSpan = document.getElementById("user-greeting");
  const logoutLink = document.getElementById("logout-link");
  const loginButton = document.getElementById("login-button");

  // Page capability flags (safe even if modals aren't on this page)
  const HAS_TABLES_UI  = !!(dayTabsContainer && tablesContainer);
  const HAS_REQUEST_UI = !!document.getElementById("request-modal");
  const HAS_ACCOUNT_UI = !!document.getElementById("account-modal");

  // Safe event binding helper
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Join Modal elements
  const joinModal = document.getElementById("join-modal");
  const joinModalContent = document.getElementById("modal-content");
  const modalStep1 = document.getElementById("modal-step-1");
  const modalStep3 = document.getElementById("modal-step-3");
  const modalTableDetails = document.getElementById("modal-table-details");
  const joinModalTitle = document.getElementById("join-modal-title");
  const joinSubmitButton = document.getElementById("join-submit-button");
  const successTitle = document.getElementById("success-title");
  const successMessage = document.getElementById("success-message");
  const disclaimerCheckbox = document.getElementById("disclaimer-checkbox");
  const marketingCheckbox = document.getElementById("marketing-checkbox");
  const newUserFields = document.getElementById("new-user-fields");

  // Request Modal
  const requestTableBtn = document.getElementById("request-table-btn");
  const requestModal = document.getElementById("request-modal");
  const requestModalContent = document.getElementById("request-modal-content");
  const requestStep1 = document.getElementById("request-step-1");
  const requestStep2 = document.getElementById("request-step-2");
  const requestInfoForm = document.getElementById("request-info-form");
  const requestFormError = document.getElementById("request-form-error");
  const requestDisclaimerCheckbox = document.getElementById("request-disclaimer-checkbox");
  const requestSubmitButton = document.getElementById("request-submit-button");
  const closeRequestModal1 = document.getElementById("close-request-modal-1");
  const closeRequestModal2 = document.getElementById("close-request-modal-2");

  // Card Modal (Stripe)
  const cardModal = document.getElementById("card-modal");
  const cardModalContent = document.getElementById("card-modal-content");
  const cardForm = document.getElementById("card-form");
  const cardElementMount = document.getElementById("card-element");
  const cardErrors = document.getElementById("card-errors");
  const cardConfirmButton = document.getElementById("card-confirm-button");
  const closeCardModal = document.getElementById("close-card-modal");

  // Forms and buttons
  const userInfoForm = document.getElementById("user-info-form");
  const formError1 = document.getElementById("form-error-1");
  const closeButton1 = document.getElementById("close-modal-1");
  const closeButton3 = document.getElementById("close-modal-3");

  // --- Account Modal (email/password) REFS ---
  const accountModal = document.getElementById("account-modal");
  const accountClose = document.getElementById("account-close");
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const formLogin = document.getElementById("form-login");
  const formSignup = document.getElementById("form-signup");
  const loginErrorBox = document.getElementById("login-error");
  const signupErrorBox = document.getElementById("signup-error");

  // --- HELPERS ---
  function createButton(text, classes = [], disabled = false) {
    const button = document.createElement("button");
    button.textContent = text;
    const baseClasses = ["supdinner-button"];
    button.classList.add(...baseClasses, ...classes);
    if (disabled) button.disabled = true;
    return button;
  }

  function openModal(modal) {
    modal.classList.remove("hidden");
    setTimeout(() => {
      modal.classList.remove("opacity-0");
      const mc = modal.querySelector(".modal-content");
      if (mc) mc.classList.remove("scale-95");
    }, 10);
  }

  function closeModal(modal) {
    modal.classList.add("opacity-0");
    const mc = modal.querySelector(".modal-content");
    if (mc) mc.classList.add("scale-95");
    setTimeout(() => {
      modal.classList.add("hidden");
      const form = modal.querySelector("form");
      if (form) form.reset();
      if (modal === joinModal) {
        showModalStep(1, joinModal);
        formError1.classList.add("hidden");
        newUserFields.classList.add("hidden");
        joinSubmitButton.textContent = "Continue";
        joinSubmitButton.disabled = false;
        isNewUserFlow = false;
      }
      if (modal === requestModal) {
        showModalStep(1, requestModal);
        requestFormError.classList.add("hidden");
        requestSubmitButton.disabled = true;
      }
      refreshData();
    }, 300);
  }

  // 🔧 FIX: Simplified profile management - removed redundant client-side logic
  // All profile creation/linking is now handled by the Edge Function

  // === Top-level: link or create profile via Edge Function ===
  async function linkOrCreateProfile({ first_name, phone_number, age_range } = {}) {
      try {
          const { data, error } = await supabaseClient.functions.invoke('link-or-create-profile', {
              body: { first_name, phone_number, age_range }
          });
          if (error) throw error;
          if (data?.user_id) localStorage.setItem('supdinner_user_id', String(data.user_id));
          return true;
      } catch (err) {
          // 401 is normal if no session yet (e.g., before email confirm)
          if (err?.status === 401) {
              console.warn('[link-or-create-profile] 401 (no session yet).');
              return false;
          }
          console.error('[link-or-create-profile] failed', err);
          // Don't rethrow—return false so UI can continue (prevents spinner hang)
          return false;
      }
  }

  // 🔧 FIX: Simplified user ID retrieval
  async function ensureNumericUserIdStrict() {
    // Check cache first
    let localUserId = Number(localStorage.getItem("supdinner_user_id") ?? NaN);
    if (Number.isFinite(localUserId)) return localUserId;

    // Ensure session exists
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user) return NaN;

    // Try to get/create profile via Edge Function
    try {
      const meta = session.user.user_metadata || {};
      const { data, error } = await supabaseClient.functions.invoke("link-or-create-profile", {
        body: {
          first_name: meta.first_name,
          phone_number: meta.phone_number,
          age_range: meta.age_range
        }
      });
      if (!error && data?.user_id) {
        localStorage.setItem("supdinner_user_id", String(data.user_id));
        return Number(data.user_id);
      }
    } catch (err) {
      console.warn("[ensureNumericUserIdStrict] profile creation failed:", err);
    }

    return NaN;
  }

  // Account modal functions
  function openAccount() {
    accountModal.classList.remove("hidden");
    setTimeout(() => {
      accountModal.classList.remove("opacity-0");
      accountModal.querySelector(".modal-content").classList.remove("scale-95");
    }, 10);
  }

  function closeAccount() {
    accountModal.classList.add("opacity-0");
    accountModal.querySelector(".modal-content").classList.add("scale-95");
    setTimeout(() => accountModal.classList.add("hidden"), 250);
  }

  function showModalStep(step, modal) {
    const steps = modal.querySelectorAll(
      '[id^="modal-step-"], [id^="request-step-"]'
    );
    steps.forEach((stepEl) => {
      const stepNumber = stepEl.id.split("-").pop();
      stepEl.classList.toggle("hidden", stepNumber != step);
    });
  }

  function showSuccessStep() {
    if (signupAction === "waitlist") {
      successTitle.textContent = "You're on the waitlist!";
      successMessage.textContent =
        "We'll let you know if a spot opens up. Thanks for your interest!";
    } else {
      successTitle.textContent = "You're In!";
      successMessage.textContent =
        "Welcome to the table! We'll send the final details to your phone soon. See you there!";
    }
    showModalStep(3, joinModal);
  }

  async function waitForSignup(tableId, userId, timeoutMs = 12000) {
    const tid = Number.isFinite(Number(tableId)) ? Number(tableId) : null;
    const uid = Number.isFinite(Number(userId)) ? Number(userId) : null;
    if (tid === null || uid === null) {
      console.warn("[waitForSignup] invalid ids:", { tableId, userId });
      return false;
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabaseClient
        .from("signups")
        .select("id")
        .eq("table_id", tid)
        .eq("user_id", uid)
        .limit(1);

      if (error) {
        console.warn("[waitForSignup] query error:", error);
        // brief backoff to avoid hammering if RLS/other transient issues
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      if (Array.isArray(data) && data.length > 0) return true;

      await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  }

  // --- RENDER TABS ---
  const renderTabs = (dates) => {
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    dayTabsContainer.innerHTML = "";
    let tabsHtml = "";
    let previousDayIndex = -1;

    dates.forEach((dateString, index) => {
      const date = new Date(dateString + "T00:00:00");
      const currentDayIndex = date.getDay();
      if (index > 0 && currentDayIndex < previousDayIndex)
        tabsHtml += `<div class="week-separator"></div>`;
      const dayName = dayNames[currentDayIndex];
      const monthName = monthNames[date.getMonth()];
      const dayOfMonth = date.getDate();
      const isActive = index === 0;
      if (isActive) activeDate = dateString;
      tabsHtml += `
        <a href="#" data-date="${dateString}" class="day-tab whitespace-nowrap text-center py-3 px-1 ${
        isActive
          ? "border-b-2 border-brand-accent text-brand-accent"
          : "border-b-2 border-transparent text-gray-500 hover:text-brand-accent hover:border-brand-accent/50"
      }">
          <div class="font-heading">${dayName}</div>
          <div class="font-heading text-xs">${monthName} ${dayOfMonth}</div>
        </a>
      `;
      previousDayIndex = currentDayIndex;
    });

    dayTabsContainer.innerHTML = tabsHtml;
    document
      .querySelectorAll(".day-tab")
      .forEach((tab) => tab.addEventListener("click", handleTabClick));
  };

  const handleTabClick = (e) => {
    e.preventDefault();
    const tabElement = e.target.closest(".day-tab");
    if (!tabElement) return;
    activeDate = tabElement.dataset.date;
    document.querySelectorAll(".day-tab").forEach((tab) => {
      tab.classList.toggle(
        "border-brand-accent",
        tab.dataset.date === activeDate
      );
      tab.classList.toggle(
        "text-brand-accent",
        tab.dataset.date === activeDate
      );
      tab.classList.toggle(
        "border-transparent",
        tab.dataset.date !== activeDate
      );
      tab.classList.toggle("text-gray-500", tab.dataset.date !== activeDate);
    });
    renderTables(activeDate);
  };

  // --- TABLES LIST ---
  const renderTables = async (dateString) => {
      tablesContainer.innerHTML = "";
      loadingSpinner.classList.remove("hidden");
      noTablesMessage.classList.add("hidden");

      try {
          const { data: filteredTables, error } = await supabaseClient.rpc(
              "get_tables_for_day",
              { day_string: dateString }
          );
          if (error) throw error;

          if (!filteredTables || filteredTables.length === 0) {
              noTablesMessage.classList.remove("hidden");
              return;
          }

          filteredTables.forEach((table) => {
              const card = document.createElement("div");
              card.className =
                  `bg-white rounded-xl shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 ` +
                  `${currentUserState.joinedTableId === table.id ? "ring-2 ring-brand-accent" : ""} ` +
                  `${table.is_cancelled ? "opacity-60" : ""}`;

              const spotsLeft = table.total_spots - table.spots_filled;
              const isFull = spotsLeft <= 0;
              const isUserJoined = currentUserState.isLoggedIn && currentUserState.joinedTableId === table.id;
              const isUserWaitlisted = currentUserState.isLoggedIn && currentUserState.waitlistedTableIds.includes(table.id);

              // Past gating: if dinner already started, no actions
              const now = new Date();
              const tableStart = table.dinner_date ? new Date(table.dinner_date) : null;
              const isPast = tableStart ? tableStart < now : false;

              const requiresLogin = !currentUserState.isLoggedIn;

              let button;
              if (table.is_cancelled) {
                  button = createButton("Cancelled", ["btn-disabled"], true);
              } else if (isPast) {
                  button = createButton("Past", ["btn-disabled"], true);
              } else if (requiresLogin) {
                  // Not logged in → always funnel to Account modal
                  button = createButton("Log in to Join", ["login-to-join", "btn-primary"]);
                  button.dataset.tableId = table.id;
              } else if (isUserJoined) {
                  // User is in this table
                  if (table.is_locked) {
                      button = createButton("Locked In", ["btn-disabled"], true);
                  } else {
                      button = createButton("Leave Table", ["leave-button", "btn-secondary"]);
                      button.dataset.tableId = table.id;
                  }
              } else {
                  // User not in this table
                  if (isFull) {
                      if (isUserWaitlisted) {
                          button = createButton("Leave Waitlist", ["leave-waitlist-button", "btn-secondary"]);
                          button.dataset.tableId = table.id;
                      } else {
                          button = createButton("Join Waitlist", ["join-waitlist-button", "btn-primary"]);
                          button.dataset.tableId = table.id;
                      }
                  } else {
                      // Table has open spots
                      if (currentUserState.joinedTableId) {
                          // already in another future table → block joining
                          button = createButton("In Another Table", ["btn-disabled"], true);
                      } else {
                          button = createButton("Join Table", ["join-button", "btn-primary"]);
                          button.setAttribute("data-table-id", table.id);
                          button.dataset.tableId = table.id;
                      }
                  }
              }

              let bannerHTML = "";
              if (table.is_cancelled) {
                  bannerHTML = '<div class="cancelled-banner text-center p-2 text-sm font-semibold font-sans">This dinner has been cancelled.</div>';
              } else if (table.is_locked && isUserJoined) {
                  bannerHTML = '<div class="locked-in-banner text-center p-2 text-sm font-semibold font-sans">You are locked in for this dinner!</div>';
              }

              let themeHTML = "";
              if (table.theme) {
                  themeHTML = `<span class="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${table.theme}</span>`;
              }

              // Dots (robust)
              const totalRaw  = Number(table.total_spots);
              const filledRaw = Number(table.spots_filled);
              const minRaw    = Number(table.min_spots);
              const filled = Number.isFinite(filledRaw) ? Math.max(0, filledRaw) : 0;
              let total = Number.isFinite(totalRaw) ? totalRaw
                          : Number.isFinite(minRaw) ? minRaw
                          : (filled > 0 ? filled : 0);
              let min = Number.isFinite(minRaw) ? minRaw : Math.max(0, Math.min(total, filled));
              total = Math.max(total, min, filled);
              min   = Math.min(min, total);

              const dots = [];
              for (let i = 0; i < total; i++) {
                  if (i < filled) {
                      dots.push('<span class="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent"></span>');
                  } else if (i < min) {
                      dots.push('<span class="inline-block h-2.5 w-2.5 rounded-full bg-brand-gray-dark"></span>');
                  } else {
                      dots.push('<span class="inline-block h-2.5 w-2.5 rounded-full bg-gray-300"></span>');
                  }
              }
              const spotsIndicatorHTML = dots.join("");
              const totalDisplay  = Number.isFinite(totalRaw)  ? totalRaw  : total;
              const filledDisplay = Number.isFinite(filledRaw) ? filledRaw : filled;

              const cardContent = document.createElement("div");
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
                                  ${themeHTML ? `<div class="text-gray-400">&bull;</div> ${themeHTML}` : ""}
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

          // Bind actions
          document.querySelectorAll(".join-button").forEach((btn) => btn.addEventListener("click", handleJoinClick));
          document.querySelectorAll(".leave-button").forEach((btn) => btn.addEventListener("click", handleLeaveClick));
          document.querySelectorAll(".join-waitlist-button").forEach((btn) => btn.addEventListener("click", handleJoinWaitlistClick));
          document.querySelectorAll(".leave-waitlist-button").forEach((btn) => btn.addEventListener("click", handleLeaveWaitlistClick));
          document.querySelectorAll(".login-to-join").forEach((btn) => btn.addEventListener("click", () => openAccount()));
      } catch (err) {
          console.error("Error fetching tables:", err);
          tablesContainer.innerHTML = `
              <div class="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                  <p class="font-bold">Could not load tables.</p>
                  <p class="text-sm mt-1"><strong>Error:</strong> ${err.message || err}</p>
              </div>`;
      } finally {
          // ALWAYS clear spinner
          loadingSpinner.classList.add("hidden");
      }
  };

  // --- EVENT HANDLERS ---
  const handleJoinClick = async (e) => {
    // Must have an auth session at least
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user) {
      openAccount();
      return;
    }

    // Get the tableId from the button (handle clicks on child elements)
    const btn = e.target.closest('.join-button');
    const tableId = btn?.dataset?.tableId;
    
    if (!tableId) {
      showError("Could not figure out which table to join. Please try again.");
      return;
    }
    
    selectedTableId = Number(tableId);
    signupAction = "join";

    // 🔒 Ensure users.id exists before proceeding (no modal bounce)
    let uid = await ensureNumericUserIdStrict();
    if (!Number.isFinite(uid)) {
      // Still no users row — guide the user
      alert("We couldn't finish setting up your account. Please log out/in and try again.");
      openAccount();
      return;
    }

    // Proceed to Stripe path
    // Compute days until dinner
    const { data: t } = await supabaseClient
      .from("tables")
      .select("id, dinner_date")
      .eq("id", selectedTableId)
      .maybeSingle();

    let dinnerDate = t?.dinner_date ? new Date(t.dinner_date) : null;
    if (!dinnerDate && activeDate) dinnerDate = new Date(`${activeDate}T00:00:00`);

    let daysDiff = 0;
    if (dinnerDate instanceof Date && !isNaN(dinnerDate.getTime())) {
      const now = new Date();
      daysDiff = (dinnerDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    }

    try {
      const stripeReady = await initStripeIfNeeded();
      if (!stripeReady) {
        console.warn("Stripe unavailable; proceeding without collateral.");
        showSuccessStep();
        await refreshData();
        return;
      }

      const collateral_cents = COLLATERAL_CENTS_DEFAULT;
      const payload = { userId: uid, tableId: selectedTableId, collateral_cents };
      console.log("[join] creating intent with payload:", payload);

      if (daysDiff > 7) {
        const { data, error } = await supabaseClient.functions.invoke(
          "stripe-create-setup-intent",
          { body: payload }
        );
        if (error) throw new Error(error.message || "stripe-create-setup-intent failed");
        const clientSecret = data?.client_secret;
        if (!clientSecret || !String(clientSecret).includes("_secret_")) {
          throw new Error("Server did not return a SetupIntent client_secret.");
        }
        JoinState.set({ mode: "setup", clientSecret });
        openCardModal();
      } else {
        const { data, error } = await supabaseClient.functions.invoke(
          "stripe-create-hold",
          { body: payload }
        );
        if (error) throw new Error(error.message || "stripe-create-hold failed");
        const clientSecret = data?.client_secret;
        if (!clientSecret || !String(clientSecret).includes("_secret_")) {
          throw new Error("Server did not return a PaymentIntent client_secret.");
        }
        JoinState.set({ mode: "payment", clientSecret });
        openCardModal();
      }
    } catch (err) {
      alert(`Could not start join: ${err?.message || err}`);
    }
  };

  const handleLeaveClick = async (e) => {
    const tableId = Number((/** @type {HTMLElement} */(e.currentTarget))?.dataset?.tableId ?? NaN);
    if (!Number.isFinite(tableId)) return;
    try {
      const { error } = await supabaseClient.functions.invoke("leave-table", {
        body: { tableId, userId: currentUserState.userId },
      });
      if (error) throw error;
      await refreshData();
    } catch (error) {
      alert(`Error leaving table: ${error.message}`);
    }
  };

  const handleJoinWaitlistClick = async (e) => {
    if (!currentUserState.isLoggedIn) { openAccount(); return; }
    const tableId = Number((/** @type {HTMLElement} */(e.currentTarget))?.dataset?.tableId ?? NaN);
    if (!Number.isFinite(tableId)) return;
    selectedTableId = tableId;
    signupAction = "waitlist";
    try {
      const { error } = await supabaseClient.functions.invoke("join-waitlist", {
        body: { tableId: selectedTableId, userId: currentUserState.userId },
      });
      if (error) throw error;
      await refreshData();
    } catch (error) {
      alert(`Error joining waitlist: ${error.message}`);
    }
  };


  const handleLeaveWaitlistClick = async (e) => {
    const tableId = Number((/** @type {HTMLElement} */(e.currentTarget))?.dataset?.tableId ?? NaN);
    if (!Number.isFinite(tableId)) return;
    try {
      const { error } = await supabaseClient.functions.invoke(
        "leave-waitlist",
        {
          body: { tableId, userId: currentUserState.userId },
        }
      );
      if (error) throw error;
      await refreshData();
    } catch (error) {
      alert(`Error leaving waitlist: ${error.message}`);
    }
  };

  // Join modal form (phone-first, legacy path still supported)
  on(userInfoForm, "submit", async (e) => {
    e.preventDefault();
    formError1.classList.add("hidden");
    joinSubmitButton.disabled = true;

    // If not logged in, force account signup/login (applies to both legacy + brand new)
    if (!currentUserState.isLoggedIn) {
      closeModal(joinModal);
      openAccount();
      joinSubmitButton.disabled = false;
      return;
    }

    // Logged in users: the only valid action here is "waitlist" (no card required).
    // Joining a table is now handled directly by the Join button (see handleJoinClick).
    if (signupAction === "waitlist") {
      try {
        const { error } = await supabaseClient.functions.invoke("join-waitlist", {
          body: { tableId: selectedTableId, userId: currentUserState.userId },
        });
        if (error) throw error;
        showSuccessStep();
        await refreshData();
      } catch (error) {
        formError1.textContent = `Error: ${error.message}`;
        formError1.classList.remove("hidden");
      } finally {
        joinSubmitButton.disabled = false;
      }
    } else {
      // Defensive: if someone submits this form in "join" mode, steer them back
      formError1.textContent = "Please use the Join button above to continue.";
      formError1.classList.remove("hidden");
      joinSubmitButton.disabled = false;
    }
  });

  // Logout
  on(logoutLink, "click", (e) => {
    e.preventDefault();
    localStorage.removeItem("supdinner_user_id");
    supabaseClient.auth.signOut().finally(refreshData);
  });

  // Request modal
  if(HAS_REQUEST_UI) {
    on(requestTableBtn, "click", () => openModal(requestModal));
    on(closeRequestModal1, "click", () => closeModal(requestModal));
    on(closeRequestModal2, "click", () => closeModal(requestModal));
    on(requestModal, "click", (e) => { if (e.target === requestModal) closeModal(requestModal); });
    on(requestDisclaimerCheckbox, "change", () => { requestSubmitButton.disabled = !requestDisclaimerCheckbox.checked; });
    on(requestInfoForm, "submit", async (e) => {
      e.preventDefault();
      requestFormError.classList.add("hidden");
      const formData = {
        name: document.getElementById("request-name").value,
        phone: document.getElementById("request-phone").value,
        day: document.getElementById("request-day").value,
        time: document.getElementById("request-time").value,
        neighborhood: document.getElementById("request-neighborhood").value,
        ageRange: document.getElementById("request-age-range").value,
        theme: document.getElementById("request-theme").value,
      };
      try {
        const { error } = await supabaseClient.functions.invoke(
          "send-request-notification",
          { body: formData }
        );
        if (error) throw error;
        showModalStep(2, requestModal);
      } catch (error) {
        requestFormError.textContent = `Error: ${error.message}`;
        requestFormError.classList.remove("hidden");
      }
    });
  }

  // Account modal events
  on(loginButton, "click", () => openAccount());
  on(accountClose, "click", () => closeAccount());
  on(accountModal, "click", (e) => {
    if (e.target === accountModal) closeAccount();
  });

  on(tabLogin, "click", () => {
    tabLogin.className = "px-3 py-1 rounded bg-gray-900 text-white";
    tabSignup.className = "px-3 py-1 rounded bg-gray-200";
    formLogin.classList.remove("hidden");
    formSignup.classList.add("hidden");
  });
  on(tabSignup, "click", () => {
    tabSignup.className = "px-3 py-1 rounded bg-gray-900 text-white";
    tabLogin.className = "px-3 py-1 rounded bg-gray-200";
    formSignup.classList.remove("hidden");
    formLogin.classList.add("hidden");
  });

  on(formLogin, "submit", async (e) => {
    e.preventDefault();
    loginErrorBox.textContent = "";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Pass whatever metadata the auth user has (from sign-up)
      const { data: { session } } = await supabaseClient.auth.getSession();
      const meta = session?.user?.user_metadata || {};
      try {
        await linkOrCreateProfile({
          first_name: meta.first_name,
          phone_number: meta.phone_number,
          age_range: meta.age_range,
        });
      } catch (e1) {
        console.warn("[login] link/create skipped:", e1?.message || e1);
      }

      closeAccount();
      await refreshData();
    } catch (e2) {
      loginErrorBox.textContent = e2.message || "Login failed";
    }
  });

  on(formSignup, "submit", async (e) => {
      e.preventDefault();
      signupErrorBox.textContent = "";

      const first = document.getElementById("su-first").value.trim();
      const phone = document.getElementById("su-phone").value.trim();
      const email = document.getElementById("su-email").value.trim();
      const pass  = document.getElementById("su-pass").value;
      const age   = document.getElementById("su-age").value;

      if (!first || !phone || !age) {
          signupErrorBox.textContent = "Please fill first, phone, and age range.";
          return;
      }

      try {
          const { error } = await supabaseClient.auth.signUp({
              email,
              password: pass,
              options: {
                  // make sure EMAIL_REDIRECT_TO is set once near top: const EMAIL_REDIRECT_TO = `${location.origin}/sign-up`;
                  emailRedirectTo: EMAIL_REDIRECT_TO,
                  data: { first_name: first, phone_number: phone, age_range: age }
              }
          });
          if (error) throw error;

          // Do we already have a session? (happens if confirmations are disabled)
          const { data: { session } } = await supabaseClient.auth.getSession();

          if (session?.user) {
              // Logged in right away → safe to create/link profile now
              await linkOrCreateProfile({ first_name: first, phone_number: phone, age_range: age });
              closeAccount();
              await refreshData();
          } else {
              // No session yet → user must confirm email first
              signupErrorBox.textContent = "Check your email to confirm your account, then return here and log in.";
              // Don't auto-switch tabs; keep them on Signup so the message is visible.
              // If you prefer to switch to Login, mirror the message there too:
              const loginError = document.getElementById("login-error");
              if (loginError) loginError.textContent = "After confirming via email, enter your email and password here to log in.";
          }
      } catch (err) {
          signupErrorBox.textContent = err.message || "Signup failed";
      }
  });


  // --- STRIPE MODAL CONTROLS ---
  function openCardModal() {
    cardModal.classList.remove("hidden");
    setTimeout(() => {
      cardModal.classList.remove("opacity-0");
      cardModalContent.classList.remove("scale-95");
    }, 10);
  }

  function closeCardModalModalOnly() {
    cardModal.classList.add("opacity-0");
    cardModalContent.classList.add("scale-95");
    setTimeout(() => {
      cardModal.classList.add("hidden");
      if (cardForm) cardForm.reset();
      cardErrors.classList.add("hidden");
      cardErrors.textContent = "";
      pendingClientSecret = null;
      pendingMode = null;
    }, 300);
  }

  async function initStripeIfNeeded() {
    if (!stripe) {
      if (!window.Stripe) {
        console.warn('Stripe not available; skipping card UI.');
        return null;
      }
      if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.includes('replace_me')) {
        console.warn('Stripe key missing; skipping card UI.');
        return null;
      }
      stripe   = window.Stripe(STRIPE_PUBLISHABLE_KEY);
      elements = stripe.elements();
      if (cardElementMount) {
        cardElement = elements.create("card");
        cardElement.mount(cardElementMount);
      } else {
        // No card UI on this page; that's fine.
        cardElement = null;
      }
    }
    return stripe;
  }

  async function confirmSetupIntent(clientSecret) {
    await initStripeIfNeeded();
    pendingClientSecret = clientSecret;
    pendingMode = "setup";
    openCardModal();
  }

  async function confirmPaymentIntent(clientSecret) {
    await initStripeIfNeeded();
    pendingClientSecret = clientSecret;
    pendingMode = "payment";
    openCardModal();
  }

  // Stripe card form submit
  on(cardForm, "submit", async (e) => {
    e.preventDefault();
    cardErrors.classList.add("hidden");
    cardErrors.textContent = "";

    const { mode, clientSecret } = JoinState.get();
    if (!stripe || !cardElement || !mode || !clientSecret) {
      cardErrors.textContent = "Card is not ready. Please close and try again.";
      cardErrors.classList.remove("hidden");
      return;
    }

    cardConfirmButton.disabled = true;

    try {
      let intentId = null;
      let paymentMethodId = null;

      if (mode === "setup") {
        const result = await stripe.confirmCardSetup(clientSecret, { payment_method: { card: cardElement } });
        if (result.error) throw new Error(result.error.message || "Card confirmation failed.");
        intentId = result.setupIntent.id;
        paymentMethodId = result.setupIntent.payment_method || null;
      } else {
        const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement } });
        if (result.error) throw new Error(result.error.message || "Card confirmation failed.");
        intentId = result.paymentIntent.id;
        paymentMethodId = result.paymentIntent.payment_method || null;
      }

      // Finalize join on the server — send only clientSecret (server derives everything)
      const { data: jfRes, error: jfErr } = await supabaseClient.functions.invoke("join-after-confirm", {
        body: {
          clientSecret,                 // <-- single source of truth
          // Optional extras (nice but not required):
          intentType: mode,             // "payment" | "setup"
          intentId,                     // pi_... or si_...
          paymentMethodId: paymentMethodId || null,
        }
      });
      if (jfErr) throw new Error(jfErr.message || "Could not finalize your join.");
      if (!jfRes?.ok) throw new Error("Join not finalized yet. Please wait a moment and refresh.");

      JoinState.clear();
      closeCardModalModalOnly?.();
      await refreshData();
      showSuccessStep?.();
    } catch (err) {
      cardErrors.textContent = err.message || "Unexpected error. Please try again.";
      cardErrors.classList.remove("hidden");
    } finally {
      cardConfirmButton.disabled = false;
    }
  });

  // --- REFRESH LOGIC ---
  async function refreshData() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    // If we have a session but no numeric user id yet, try to create/link via Edge Function first.
    let localUserId = localStorage.getItem("supdinner_user_id");
    if (session?.user && !localUserId) {
      const meta = session.user.user_metadata || {};
      try {
        const ok = await linkOrCreateProfile({
          first_name: meta.first_name,
          phone_number: meta.phone_number,
          age_range: meta.age_range,
        });
        if (ok) localUserId = localStorage.getItem("supdinner_user_id");
      } catch {}
    }

    // Fallback: create the row from the client (RLS must allow it)
    if (session?.user && !localUserId) {
      const meta = session.user.user_metadata || {};
      try {
        const userId = await ensureUserRowFromSession(
          meta.phone_number,
          meta.first_name,
          meta.age_range
        );
        if (userId) localUserId = String(userId);
        if (userId) localStorage.setItem("supdinner_user_id", String(userId));
      } catch {}
    }

    // Reflect auth in UI immediately
    if (loginButton) {
      if (session?.user) loginButton.classList.add("hidden");
      else               loginButton.classList.remove("hidden");
    }

    if (localUserId) {
      // 1) profile
      const { data: profile, error: pErr } = await supabaseClient
        .from("users")
        .select("first_name, is_suspended, suspension_end_date, phone_number")
        .eq("id", localUserId)
        .single();

      if (pErr || !profile) {
        localStorage.removeItem("supdinner_user_id");
        currentUserState = {
          isLoggedIn: false,
          userId: null,
          joinedTableId: null,
          waitlistedTableIds: [],
          isSuspended: false,
          suspensionEndDate: null,
        };
        if (userStatusDiv) userStatusDiv.classList.add("hidden");
        if (HAS_TABLES_UI && activeDate) await renderTables(activeDate);
        return;
      }

      // 2) joined table (future only)
      const { data: mySignups } = await supabaseClient
        .from("signups")
        .select("table_id")
        .eq("user_id", localUserId);

      let joinedTableId = null;
      if (mySignups?.length) {
        const nowIso = new Date().toISOString();
        const tableIds = [...new Set(mySignups.map((s) => s.table_id))];
        const { data: myTables } = await supabaseClient
          .from("tables")
          .select("id, dinner_date")
          .in("id", tableIds)
          .gte("dinner_date", nowIso)
          .order("dinner_date", { ascending: true })
          .limit(1);
        if (myTables?.length) joinedTableId = myTables[0].id;
      }

      // 3) waitlists
      const { data: waitlists } = await supabaseClient
        .from("waitlists")
        .select("table_id")
        .eq("user_id", localUserId);

      // 4) state + UI
      currentUserState = {
        isLoggedIn: true,
        userId: localUserId,
        joinedTableId,
        waitlistedTableIds: waitlists ? waitlists.map((w) => w.table_id) : [],
        isSuspended: profile.is_suspended,
        suspensionEndDate: profile.suspension_end_date,
        name: profile.first_name,
        phone: profile.phone_number,
      };

      if (userGreetingSpan) userGreetingSpan.textContent = `Welcome, ${profile.first_name}!`;
      if (userStatusDiv) userStatusDiv.classList.remove("hidden");

      const reqName  = document.getElementById("request-name");
      const reqPhone = document.getElementById("request-phone");
      if (reqName)  reqName.value  = profile.first_name || "";
      if (reqPhone) reqPhone.value = profile.phone_number || "";

      // 5) ensure Stripe customer (ignore errors)
      try {
        await supabaseClient.functions.invoke("stripe-create-customer", {
          body: { userId: currentUserState.userId },
        });
      } catch (err) {
        console.error("Error ensuring Stripe customer:", err);
      }
    } else {
      // No numeric user row yet
      if (loginButton && !session?.user) loginButton.classList.remove("hidden");
      currentUserState = {
        isLoggedIn: !!session?.user,
        userId: null,
        joinedTableId: null,
        waitlistedTableIds: [],
        isSuspended: false,
        suspensionEndDate: null,
      };
      if (session?.user) {
        if (userGreetingSpan) userGreetingSpan.textContent = "Welcome!";
        if (userStatusDiv) userStatusDiv.classList.remove("hidden");
      } else {
        if (userStatusDiv) userStatusDiv.classList.add("hidden");
      }
    }

    if (HAS_TABLES_UI && activeDate) await renderTables(activeDate);
  }

  // --- INIT ---
  on(closeButton1, "click", () => closeModal(joinModal));
  on(closeButton3, "click", () => closeModal(joinModal));
  on(joinModal, "click", (e) => { if (e.target === joinModal) closeModal(joinModal); });
  on(closeCardModal, "click", () => closeCardModalModalOnly());
  on(cardModal, "click", (e) => { if (e.target === cardModal) closeCardModalModalOnly(); });

  on(disclaimerCheckbox, "change", () => {
    if (isNewUserFlow) joinSubmitButton.disabled = !disclaimerCheckbox.checked;
  });

  const initialize = async () => {
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
    try {
      await initStripeIfNeeded();
      await refreshData();

      if (HAS_TABLES_UI) {
        const { data: dates, error: datesError } = await supabaseClient.rpc('get_distinct_upcoming_dates');
        if (datesError) throw datesError;

        if (dates && dates.length > 0) {
          renderTabs(dates);
          await renderTables(activeDate);
        } else if (noTablesMessage) {
          noTablesMessage.textContent = 'No upcoming dinners are scheduled. Check back soon!';
          noTablesMessage.classList.remove('hidden');
        }
      }
    } catch (err) {
      console.error('Initialization failed:', err);
      if (tablesContainer) {
        tablesContainer.innerHTML = `
          <p class="text-center text-red-500">
            Could not initialize. Please refresh. Error: ${err.message || err}
          </p>`;
      }
    } finally {
      if (loadingSpinner) loadingSpinner.classList.add('hidden');
    }
  };

  // Make spinner resilient against any unexpected script errors
  window.addEventListener("error", () => {
    try { loadingSpinner?.classList.add("hidden"); } catch {}
  });
  window.addEventListener("unhandledrejection", () => {
    try { loadingSpinner?.classList.add("hidden"); } catch {}
  });

  initialize();
});
// Force rebuild Mon Aug 11 11:15:58 EDT 2025
