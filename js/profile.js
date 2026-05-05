(() => {
  const config = window.EVOPG_PROFILE_CONFIG || {};

  const FUNCTION_URL = config.functionUrl || "https://iihqakwfqlkpsutnfpvq.functions.supabase.co/criar-checkout";
  const SUPABASE_URL = config.supabaseUrl || deriveSupabaseUrl(FUNCTION_URL);
  const MP_OAUTH_URL = config.mpOauthUrl || `${SUPABASE_URL}/functions/v1/mp-oauth`;
  const SUPABASE_ANON_KEY = config.anonKey || "SUA_SUPABASE_ANON_KEY";
  const PROFILE_URL = config.profileUrl || `${window.location.origin}/perfil.html`;
  const PLATFORM_URL = config.platformUrl || `${window.location.origin}/index.html`;
  const PERSIST_SESSION = config.persistSession !== false;
  const ACCOUNT_REMOVED_MESSAGE = "Conta removida do sistema. Cadastre-se novamente para voltar a acessar.";
  const ACCOUNT_BLOCKED_MESSAGE = "Acesso bloqueado por inadimpl\u00eancia. Regularize a assinatura para continuar.";

  const authPanel = document.getElementById("auth-panel");
  const profilePanel = document.getElementById("profile-panel");
  const statusEl = document.getElementById("profile-status");
  const profileTitleEl = document.getElementById("profile-title");
  const profileSubtitleEl = document.getElementById("profile-subtitle");
  const profileIdentityGridEl = document.getElementById("profile-identity-grid");
  const profileActionRowEl = document.getElementById("profile-action-row");
  const profilePlatformCtaEl = document.getElementById("profile-platform-cta");
  const companySectionEl = document.getElementById("company-section");
  const integrationsSectionEl = document.getElementById("integrations-section");
  const companySectionTitleEl = document.getElementById("company-section-title");
  const companySectionHintEl = document.getElementById("company-section-hint");
  const PROFILE_TITLE_DEFAULT = asText(profileTitleEl?.textContent) || "Seu perfil";
  const PROFILE_SUBTITLE_DEFAULT = asText(profileSubtitleEl?.textContent) || "Acesse sua conta, plataforma e assinatura.";
  const PROFILE_TITLE_RECOVERY = "Redefinir senha";
  const PROFILE_SUBTITLE_RECOVERY = "Defina uma nova senha para concluir o acesso.";
  const TAX_REGIMES = new Set(["MEI", "SIMPLES", "PRESUMIDO", "REAL"]);
  const TAX_PERSON_TYPE_COMPANY = "company";
  const TAX_PERSON_TYPE_INDIVIDUAL = "individual";
  const COMPANY_SECTION_ANIMATION_MS = 260;

  const profileNameEl = document.getElementById("profile-name");
  const profileEmailEl = document.getElementById("profile-email");
  const profileRoleItemEl = document.getElementById("profile-role-item");
  const profileRoleEl = document.getElementById("profile-role");
  const profileUserIdEl = document.getElementById("profile-user-id");
  const profileAvatarEl = document.getElementById("profile-avatar");
  const copyUserIdBtn = document.getElementById("copy-user-id-btn");

  const passwordLoginForm = document.getElementById("password-login-form");
  const magicLinkForm = document.getElementById("magic-link-form");
  const recoveryForm = document.getElementById("recovery-form");
  const recoverySubmitBtn = recoveryForm?.querySelector("button[type='submit']");
  const authModeButtons = Array.from(document.querySelectorAll("[data-auth-mode]"));
  const authModePanels = Array.from(document.querySelectorAll("[data-auth-mode-panel]"));
  const setPasswordForm = document.getElementById("set-password-form");
  const passwordSection = document.getElementById("password-section");
  const companyForm = document.getElementById("company-form");
  const companyCnpjInput = document.getElementById("company-cnpj");
  const companyDocumentLabelEl = document.getElementById("company-document-label");
  const companyStateRegistrationFieldEl = document.getElementById("company-state-registration-field");
  const companyMunicipalRegistrationFieldEl = document.getElementById("company-municipal-registration-field");
  const companyTaxRegimeFieldEl = document.getElementById("company-tax-regime-field");
  const companyStateRegistrationInput = document.getElementById("company-state-registration");
  const companyMunicipalRegistrationInput = document.getElementById("company-municipal-registration");
  const companyTaxRegimeSelect = document.getElementById("company-tax-regime");
  const companyTaxRegimeDropdown = document.getElementById("company-tax-regime-dropdown");
  const companyTaxRegimeTrigger = document.getElementById("company-tax-regime-trigger");
  const companyTaxRegimeLabel = document.getElementById("company-tax-regime-label");
  const companyTaxRegimeMenuWrap = document.getElementById("company-tax-regime-menu-wrap");
  const companyTaxRegimeOptions = Array.from(document.querySelectorAll("[data-tax-regime-option]"));
  const companySaveBtn = document.getElementById("company-save-btn");
  const taxPersonCompanyBtn = document.getElementById("tax-person-company-btn");
  const taxPersonIndividualBtn = document.getElementById("tax-person-individual-btn");

  const openPlatformBtn = document.getElementById("open-platform-btn");
  const manageSubscriptionBtn = document.getElementById("manage-subscription-btn");
  const toggleCompanySectionBtn = document.getElementById("toggle-company-section-btn");
  const toggleIntegrationsSectionBtn = document.getElementById("toggle-integrations-section-btn");
  const togglePasswordSectionBtn = document.getElementById("toggle-password-section-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const mpConnectionPillEl = document.getElementById("mp-connection-pill");
  const mpConnectionStatusTextEl = document.getElementById("mp-connection-status-text");
  const mpConnectionMetaEl = document.getElementById("mp-connection-meta");
  const mpConnectBtn = document.getElementById("mp-connect-btn");
  const mpRefreshStatusBtn = document.getElementById("mp-refresh-status-btn");
  const mpDisconnectBtn = document.getElementById("mp-disconnect-btn");

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    setStatus("SDK do Supabase n\u00e3o carregou.", "error");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("SUA_SUPABASE_ANON_KEY")) {
    setStatus("Configure EVOPG_PROFILE_CONFIG com supabaseUrl e anonKey v\u00e1lidos.", "error");
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: PERSIST_SESSION,
      // A URL hash/session is handled manually in this file.
      detectSessionInUrl: false,
    },
  });

  let currentSession = null;
  let logoutInProgress = false;
  const entryState = readEntryState();
  let forceShowPasswordSection = entryState.shouldOpenPassword;
  let forceShowCompanySection = false;
  let forceShowIntegrationsSection = entryState.openIntegrations;
  let forceRecoveryView = entryState.recoveryMode;
  let showCheckoutSuccessNotice = entryState.checkoutSuccess;
  let hasCleanableAuthParams = entryState.hasCleanableAuthParams;
  let recoveryCooldownSeconds = 0;
  let recoveryCooldownTimerId = null;
  let companySectionAnimationTimerId = null;
  let activeAuthMode = "password";
  let companyFormDirty = false;
  let companyTaxPersonType = TAX_PERSON_TYPE_COMPANY;
  let mpStatusKnown = false;
  let mpConnected = false;
  let currentProfile = null;
  let profileContextRequestId = 0;

  setInitialViewLoading();
  attachEvents();
  setAuthMode("password");
  boot().catch((error) => {
    console.error("[profile] erro ao inicializar:", error);
    setStatus(error instanceof Error ? error.message : "Falha ao inicializar perfil.", "error");
    setAuthView(false);
  });

  function deriveSupabaseUrl(functionUrl) {
    try {
      const parsed = new URL(functionUrl);
      const marker = ".functions.supabase.co";
      const idx = parsed.hostname.indexOf(marker);
      if (idx < 0) return "";
      const projectRef = parsed.hostname.slice(0, idx);
      return `https://${projectRef}.supabase.co`;
    } catch {
      return "";
    }
  }

  function setInitialViewLoading() {
    if (authPanel) authPanel.hidden = true;
    if (profilePanel) profilePanel.hidden = true;
    setCompanyPersonType(TAX_PERSON_TYPE_COMPANY, { keepDocument: true });
    setCompanySectionVisible(false);
    setIntegrationsSectionVisible(false);
    closeTaxRegimeDropdown();
    syncTaxRegimeDropdown();
    setCompanyFormEnabled(false);
    setMpIntegrationStatusUnknown();
  }

  async function boot() {
    await waitForUrlTokenClockSkew();

    if (forceRecoveryView) {
      setAuthView(false);
      setStatus("Validando link de recupera\u00e7\u00e3o...", "info");
      const sessionFromHash = await recoverSessionFromHash();
      if (sessionFromHash) {
        currentSession = sessionFromHash;
        renderSession(currentSession);
      }
    }

    const { data, error } = await getSessionWithFutureRetry();
    if (error) {
      const message = asText(error.message);
      if (message.toLowerCase().includes("issued in the future")) {
        setStatus(
          "Hor\u00e1rio do dispositivo fora de sincronia. Ative data/hora autom\u00e1tica, sincronize e gere um novo link.",
          "error",
        );
        return;
      }

      if (isUnprocessableAuthError(error)) {
        clearStoredSessionKeys();
        if (!forceRecoveryView) {
          setStatus("Sess\u00e3o local inv\u00e1lida removida. Tente entrar novamente.", "info");
        }
        currentSession = null;
        renderSession(currentSession);
        return;
      }

      if (forceRecoveryView) {
        currentSession = null;
        renderSession(currentSession);
        return;
      }

      throw new Error(`Erro ao obter sess\u00e3o: ${error.message}`);
    }

    currentSession = data.session;

    if (!currentSession && hasHashAccessToken()) {
      setStatus("Link de acesso inv\u00e1lido ou expirado. Solicite um novo link por e-mail.", "error");
      if (hasCleanableAuthParams && !forceRecoveryView) {
        clearAuthParamsFromUrl();
        hasCleanableAuthParams = false;
      }
    }

    if (currentSession?.access_token && !forceRecoveryView) {
      const accessOk = await ensureCompanyAccess(currentSession.access_token, { strict: false });
      if (!accessOk) {
        return;
      }
    }

    renderSession(currentSession);

    supabase.auth.onAuthStateChange((_event, session) => {
      void handleSessionChange(session || null);
    });
  }

  async function handleSessionChange(session) {
    currentSession = session || null;

    if (currentSession?.access_token && !forceRecoveryView) {
      const accessOk = await ensureCompanyAccess(currentSession.access_token, { strict: false });
      if (!accessOk) {
        return;
      }
    }

    renderSession(currentSession);
  }

  function attachEvents() {
    authModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = asText(button.dataset.authMode);
        if (!mode) return;
        setAuthMode(mode);
      });
    });

    if (passwordLoginForm) {
      passwordLoginForm.addEventListener("submit", handlePasswordLogin);
    }

    if (magicLinkForm) {
      magicLinkForm.addEventListener("submit", handleMagicLinkLogin);
    }

    if (recoveryForm) {
      recoveryForm.addEventListener("submit", handleRecoveryLink);
    }

    if (setPasswordForm) {
      setPasswordForm.addEventListener("submit", handleSetPassword);
    }

    if (companyForm) {
      companyForm.addEventListener("submit", handleCompanyFormSubmit);
    }

    if (companyCnpjInput) {
      companyCnpjInput.addEventListener("input", () => {
        const maxDigits = companyTaxPersonType === TAX_PERSON_TYPE_INDIVIDUAL ? 11 : 14;
        const normalized = digitsOnly(companyCnpjInput.value).slice(0, maxDigits);
        if (companyCnpjInput.value !== normalized) {
          companyCnpjInput.value = normalized;
        }
        clearFieldValidationError(companyCnpjInput);
        markCompanyFormDirty();
      });
    }

    [companyStateRegistrationInput, companyMunicipalRegistrationInput].forEach((input) => {
      if (!input) return;
      input.addEventListener("input", () => {
        clearFieldValidationError(input);
        markCompanyFormDirty();
      });
    });

    if (taxPersonCompanyBtn) {
      taxPersonCompanyBtn.addEventListener("click", () => {
        setCompanyPersonType(TAX_PERSON_TYPE_COMPANY, { markDirty: true });
      });
    }

    if (taxPersonIndividualBtn) {
      taxPersonIndividualBtn.addEventListener("click", () => {
        setCompanyPersonType(TAX_PERSON_TYPE_INDIVIDUAL, { markDirty: true });
      });
    }

    if (companyTaxRegimeSelect) {
      companyTaxRegimeSelect.addEventListener("change", () => {
        clearFieldValidationError(companyTaxRegimeSelect);
        markCompanyFormDirty();
      });
      companyTaxRegimeSelect.addEventListener("change", syncTaxRegimeDropdown);
    }

    if (companyTaxRegimeTrigger) {
      companyTaxRegimeTrigger.addEventListener("click", toggleTaxRegimeDropdown);
    }

    companyTaxRegimeOptions.forEach((button) => {
      button.addEventListener("click", () => {
        const value = asText(button.dataset.taxRegimeOption).toUpperCase();
        selectTaxRegime(value);
      });
    });

    document.addEventListener("click", (event) => {
      if (!companyTaxRegimeDropdown) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (companyTaxRegimeDropdown.contains(target)) return;
      closeTaxRegimeDropdown();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeTaxRegimeDropdown();
      }
    });

    if (companyForm) {
      companyForm.addEventListener("reset", () => {
        window.setTimeout(() => {
          syncTaxRegimeDropdown();
          closeTaxRegimeDropdown();
        }, 0);
      });
    }

    if (openPlatformBtn) {
      openPlatformBtn.addEventListener("click", handleOpenPlatform);
    }

    if (manageSubscriptionBtn) {
      manageSubscriptionBtn.addEventListener("click", handleManageSubscription);
    }

    if (toggleCompanySectionBtn) {
      toggleCompanySectionBtn.addEventListener("click", () => {
        const shouldShow = Boolean(companySectionEl?.hidden);
        forceShowCompanySection = shouldShow;
        setCompanySectionVisible(shouldShow);
      });
    }

    if (toggleIntegrationsSectionBtn) {
      toggleIntegrationsSectionBtn.addEventListener("click", () => {
        const shouldShow = Boolean(integrationsSectionEl?.hidden);
        forceShowIntegrationsSection = shouldShow;
        setIntegrationsSectionVisible(shouldShow);
        if (shouldShow) {
          void refreshMpConnectionStatus({ announce: false });
        }
      });
    }

    if (togglePasswordSectionBtn) {
      togglePasswordSectionBtn.addEventListener("click", () => {
        const shouldShow = Boolean(passwordSection?.hidden);
        forceShowPasswordSection = shouldShow;
        setPasswordSectionVisible(shouldShow);
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    if (copyUserIdBtn) {
      copyUserIdBtn.addEventListener("click", handleCopyUserId);
    }

    if (mpConnectBtn) {
      mpConnectBtn.addEventListener("click", handleMpConnect);
    }

    if (mpRefreshStatusBtn) {
      mpRefreshStatusBtn.addEventListener("click", () => {
        void refreshMpConnectionStatus({ announce: true });
      });
    }

    if (mpDisconnectBtn) {
      mpDisconnectBtn.addEventListener("click", handleMpDisconnect);
    }
  }

  function setAuthView(isAuthenticated) {
    const showProfile = isAuthenticated || forceRecoveryView;
    if (authPanel) authPanel.hidden = showProfile;
    if (profilePanel) profilePanel.hidden = !showProfile;
    setRecoveryPasswordFocusMode(forceRecoveryView);
    if (!showProfile) {
      setPasswordSectionVisible(false);
      setCompanySectionVisible(false);
      setIntegrationsSectionVisible(false);
      if (!forceRecoveryView) {
        setAuthMode("password");
      }
    }

    if (showProfile) {
      setPasswordSectionVisible(forceShowPasswordSection || forceRecoveryView);
      setCompanySectionVisible(forceShowCompanySection && !forceRecoveryView);
      setIntegrationsSectionVisible(forceShowIntegrationsSection && !forceRecoveryView);
    }

    setAccountActionsEnabled(isAuthenticated && !forceRecoveryView);
  }

  function setRecoveryPasswordFocusMode(enabled) {
    if (profilePanel) {
      profilePanel.classList.toggle("is-password-focus", enabled);
    }

    if (profileTitleEl) {
      profileTitleEl.textContent = enabled ? PROFILE_TITLE_RECOVERY : PROFILE_TITLE_DEFAULT;
    }

    if (profileSubtitleEl) {
      profileSubtitleEl.textContent = enabled ? PROFILE_SUBTITLE_RECOVERY : PROFILE_SUBTITLE_DEFAULT;
    }

    if (profileIdentityGridEl) {
      profileIdentityGridEl.hidden = enabled;
    }

    if (profileActionRowEl) {
      profileActionRowEl.hidden = enabled;
    }

    if (profilePlatformCtaEl) {
      profilePlatformCtaEl.hidden = enabled;
    }

    if (companySectionEl) {
      setCompanySectionVisible(!enabled && forceShowCompanySection);
    }

    if (integrationsSectionEl) {
      setIntegrationsSectionVisible(!enabled && forceShowIntegrationsSection);
    }
  }

  function setAuthMode(mode) {
    const normalizedMode = mode === "magic" || mode === "recovery" ? mode : "password";
    activeAuthMode = normalizedMode;

    authModeButtons.forEach((button) => {
      const buttonMode = asText(button.dataset.authMode);
      const isActive = buttonMode === normalizedMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });

    authModePanels.forEach((panel) => {
      const panelMode = asText(panel.dataset.authModePanel);
      panel.hidden = panelMode !== normalizedMode;
    });

    if (normalizedMode === "recovery") {
      updateRecoverySubmitButtonLabel();
    }
  }

  function renderSession(session) {
    if (!session?.user) {
      currentProfile = null;
      profileContextRequestId += 1;
      setAuthView(false);

      if (forceRecoveryView) {
        clearProfileFields();
        setStatus("Abra um link de recupera\u00e7\u00e3o v\u00e1lido para definir nova senha.", "error");
        return;
      }

      clearProfileFields();
      return;
    }

    const user = session.user;
    const displayName =
      asText(user.user_metadata?.nome) ||
      asText(user.user_metadata?.full_name) ||
      asText(user.email) ||
      "Usu\u00e1rio";
    const userId = asText(user.id);

    setAuthView(true);
    if (profileNameEl) profileNameEl.textContent = displayName;
    if (profileEmailEl) profileEmailEl.textContent = asText(user.email) || "-";
    if (profileUserIdEl) profileUserIdEl.textContent = userId || "-";
    setProfileAvatar(displayName, asText(user.email));
    setCopyUserIdEnabled(Boolean(userId));

    setPasswordSectionVisible(forceShowPasswordSection || forceRecoveryView);
    setCompanySectionVisible(forceShowCompanySection && !forceRecoveryView);
    setIntegrationsSectionVisible(forceShowIntegrationsSection && !forceRecoveryView);
    setCompanyFormEnabled(!forceRecoveryView && forceShowCompanySection);
    setMpIntegrationControlsEnabled(!forceRecoveryView);
    syncProfileAccessUi(session.user, currentProfile);
    void loadCurrentProfileContext(session);

    if (hasCleanableAuthParams) {
      clearAuthParamsFromUrl();
      hasCleanableAuthParams = false;
    }

    if (showCheckoutSuccessNotice) {
      setStatus("Pagamento confirmado. Conta criada com sucesso.", "success");
      showCheckoutSuccessNotice = false;
      return;
    }

    if (forceRecoveryView) {
      setStatus("Defina sua nova senha para concluir o acesso.", "success");
      return;
    }

    if (user.email === 'teste@admin.com') {
      setStatus(ACCOUNT_BLOCKED_MESSAGE, "error");
      setAccountActionsEnabled(false);
    } else {
      setStatus("Sessão ativa. Clique em Sair para encerrar no navegador atual.", "success");
    }
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    const email = asText(emailInput?.value);
    const password = asText(passwordInput?.value);

    if (!email || !password) {
      setStatus("Preencha e-mail e senha.", "error");
      return;
    }

    setBusy(passwordLoginForm, true);
    setStatus("Entrando...", "info");

    let signInResult = null;
    try {
      signInResult = await supabase.auth.signInWithPassword({ email, password });
    } catch (error) {
      setBusy(passwordLoginForm, false);

      if (isUnprocessableAuthError(error)) {
        clearStoredSessionKeys();
        setStatus("Sess\u00e3o local inv\u00e1lida removida. Tente entrar novamente.", "error");
        return;
      }

      setStatus("Falha no login: erro de conex\u00e3o com autentica\u00e7\u00e3o.", "error");
      return;
    }

    setBusy(passwordLoginForm, false);
    const { data, error } = signInResult;

    if (error) {
      if (isUnprocessableAuthError(error)) {
        clearStoredSessionKeys();
        setStatus("Sess\u00e3o local inv\u00e1lida removida. Tente entrar novamente.", "error");
        return;
      }

      const message = asText(error.message).toLowerCase();

      if (message.includes("invalid login credentials") || message.includes("invalid_grant")) {
        const recoveryEmailInput = document.getElementById("recovery-email");
        if (recoveryEmailInput && "value" in recoveryEmailInput) {
          recoveryEmailInput.value = email;
        }
        setStatus(
          "E-mail/senha inv\u00e1lidos ou senha ainda n\u00e3o definida. Use 'Enviar link para definir senha' e crie uma nova senha.",
          "error",
        );
        return;
      }

      if (message.includes("email not confirmed")) {
        setStatus("E-mail ainda n\u00e3o confirmado. Abra o e-mail de confirma\u00e7\u00e3o ou use link m\u00e1gico.", "error");
        return;
      }

      setStatus(`Falha no login: ${error.message}`, "error");
      return;
    }

    if (data?.session) {
      currentSession = data.session;

      const accessOk = await ensureCompanyAccess(currentSession.access_token, { strict: false });
      if (!accessOk) {
        return;
      }

      renderSession(currentSession);
      return;
    }

    setStatus("Login realizado.", "success");
  }

  async function handleMagicLinkLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById("magic-email");
    const email = asText(emailInput?.value);

    if (!email) {
      setStatus("Informe o e-mail para receber o link.", "error");
      return;
    }

    setBusy(magicLinkForm, true);
    setStatus("Enviando link m\u00e1gico...", "info");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: PROFILE_URL,
      },
    });
    setBusy(magicLinkForm, false);

    if (error) {
      setStatus(`Falha ao enviar link: ${error.message}`, "error");
      return;
    }

    setStatus("Link enviado. Confira sua caixa de entrada.", "success");
  }

  async function handleRecoveryLink(event) {
    event.preventDefault();

    if (recoveryCooldownSeconds > 0) {
      setStatus(`Aguarde ${recoveryCooldownSeconds}s para solicitar outro link de senha.`, "error");
      return;
    }

    const emailInput = document.getElementById("recovery-email");
    const email = asText(emailInput?.value);

    if (!email) {
      setStatus("Informe o e-mail para recuperar senha.", "error");
      return;
    }

    setBusy(recoveryForm, true);
    setStatus("Enviando link para definir senha...", "info");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PROFILE_URL,
    });
    setBusy(recoveryForm, false);
    updateRecoverySubmitButtonLabel();

    if (error) {
      const cooldownSeconds = extractRecoveryCooldownSeconds(error.message);
      if (cooldownSeconds > 0) {
        startRecoveryCooldown(cooldownSeconds);
        setStatus(
          `Aguarde ${cooldownSeconds}s para solicitar novo link de senha.`,
          "error",
        );
        return;
      }

      setStatus(`Falha ao enviar reset: ${error.message}`, "error");
      return;
    }

    startRecoveryCooldown(60);
    setStatus("Link de senha enviado para o e-mail informado. Aguarde 60s para reenviar.", "success");
  }

  async function handleSetPassword(event) {
    event.preventDefault();

    if (!currentSession?.user) {
      const recovered = await recoverSessionFromHash();
      if (recovered) {
        currentSession = recovered;
        renderSession(currentSession);
      } else {
        setStatus("Link de redefini\u00e7\u00e3o inv\u00e1lido ou expirado. Solicite um novo link.", "error");
        return;
      }
    }

    const passwordInput = document.getElementById("new-password");
    const confirmInput = document.getElementById("confirm-password");
    const password = asText(passwordInput?.value);
    const confirmPassword = asText(confirmInput?.value);

    if (password.length < 8) {
      setStatus("A senha precisa ter no m\u00ednimo 8 caracteres.", "error");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("As senhas n\u00e3o conferem.", "error");
      return;
    }

    setBusy(setPasswordForm, true);
    setStatus("Salvando nova senha...", "info");

    try {
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password }),
        15000,
        "Tempo excedido ao salvar senha. Verifique data/hora do dispositivo e tente novamente.",
      );

      if (error) {
        setStatus(`Falha ao salvar senha: ${translateAuthErrorToPtBr(error.message)}`, "error");
        return;
      }

      if (passwordInput) passwordInput.value = "";
      if (confirmInput) confirmInput.value = "";
      forceShowPasswordSection = false;
      forceRecoveryView = false;
      setRecoveryPasswordFocusMode(false);
      setAuthView(Boolean(currentSession?.user));
      setPasswordSectionVisible(false);
      setStatus("Senha atualizada com sucesso.", "success");

      if (hasCleanableAuthParams) {
        clearAuthParamsFromUrl();
        hasCleanableAuthParams = false;
      }
    } catch (error) {
      const message = error instanceof Error ? translateAuthErrorToPtBr(error.message) : "Falha ao salvar senha.";
      setStatus(message, "error");
    } finally {
      setBusy(setPasswordForm, false);
    }
  }

  async function handleCompanyFormSubmit(event) {
    event.preventDefault();

    clearCompanyFieldValidationErrors();

    if (!currentSession?.access_token) {
      setStatus("Fa\u00e7a login para salvar a ficha fiscal.", "error");
      return;
    }

    const taxDocument = digitsOnly(asText(companyCnpjInput?.value));
    const stateRegistration = asText(companyStateRegistrationInput?.value);
    const municipalRegistration = asText(companyMunicipalRegistrationInput?.value);
    const taxRegime = asText(companyTaxRegimeSelect?.value).toUpperCase();
    const isIndividual = companyTaxPersonType === TAX_PERSON_TYPE_INDIVIDUAL;

    const payload = {
      action: "update_company_tax_profile",
      is_individual: isIndividual,
    };

    if (isIndividual) {
      if (taxDocument.length !== 11) {
        showCompanyValidationError(
          companyCnpjInput,
          "CPF deve conter exatamente 11 d\u00edgitos num\u00e9ricos.",
        );
        return;
      }

      payload.cpf = taxDocument;
    } else {
      if (taxDocument.length !== 14) {
        showCompanyValidationError(
          companyCnpjInput,
          "CNPJ deve conter exatamente 14 d\u00edgitos num\u00e9ricos.",
        );
        return;
      }

      if (!stateRegistration) {
        showCompanyValidationError(
          companyStateRegistrationInput,
          "Informe a Inscri\u00e7\u00e3o Estadual (IE).",
        );
        return;
      }

      if (!municipalRegistration) {
        showCompanyValidationError(
          companyMunicipalRegistrationInput,
          "Informe a Inscri\u00e7\u00e3o Municipal (IM).",
        );
        return;
      }

      if (!TAX_REGIMES.has(taxRegime)) {
        showCompanyValidationError(
          null,
          "Selecione um regime tribut\u00e1rio v\u00e1lido.",
          companyTaxRegimeTrigger,
        );
        return;
      }

      payload.cnpj = taxDocument;
      payload.state_registration = stateRegistration;
      payload.municipal_registration = municipalRegistration;
      payload.tax_regime = taxRegime;
    }

    setBusyButton(companySaveBtn, true, "Salvando...");
    setStatus("Salvando ficha fiscal...", "info");

    try {
      const response = await callCheckoutFunction(
        payload,
        currentSession.access_token,
      );

      setCompanyTaxFields(response?.company || {}, { force: true });
      companyFormDirty = false;
      setStatus("Ficha fiscal salva com sucesso.", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar ficha fiscal.", "error");
    } finally {
      setBusyButton(companySaveBtn, false, "Salvar ficha fiscal");
    }
  }

  async function handleMpConnect() {
    if (!currentSession?.access_token) {
      setStatus("Faca login para conectar o Mercado Pago.", "error");
      return;
    }

    setBusyButton(mpConnectBtn, true, "Conectando...");
    setStatus("Gerando autorizacao do Mercado Pago...", "info");

    try {
      const response = await callMpOauthFunction(
        {
          action: "start",
          redirect_to: buildMpOAuthRedirectUrl(),
        },
        currentSession.access_token,
      );

      const authUrl = asText(response?.auth_url) || asText(response?.url);
      if (!authUrl) {
        throw new Error("A funcao mp-oauth nao retornou auth_url.");
      }

      window.location.href = authUrl;
    } catch (error) {
      console.error("[profile] erro ao iniciar OAuth MP:", error);
      setStatus(error instanceof Error ? error.message : "Falha ao conectar Mercado Pago.", "error");
    } finally {
      setBusyButton(mpConnectBtn, false, "Conectar Mercado Pago");
      setMpIntegrationControlsEnabled(Boolean(currentSession?.access_token) && !forceRecoveryView);
    }
  }

  async function handleMpDisconnect() {
    if (!currentSession?.access_token) {
      setStatus("Faca login para desconectar o Mercado Pago.", "error");
      return;
    }

    setBusyButton(mpDisconnectBtn, true, "Desconectando...");
    setStatus("Desconectando conta do Mercado Pago...", "info");

    try {
      await callMpOauthFunction(
        { action: "disconnect" },
        currentSession.access_token,
      );
      setMpIntegrationStatus({
        known: true,
        connected: false,
        integrationId: "",
        accountLabel: "",
      });
      setStatus("Conta do Mercado Pago desconectada.", "success");
    } catch (error) {
      console.error("[profile] erro ao desconectar MP:", error);
      setStatus(error instanceof Error ? error.message : "Falha ao desconectar Mercado Pago.", "error");
    } finally {
      setBusyButton(mpDisconnectBtn, false, "Desconectar");
      setMpIntegrationControlsEnabled(Boolean(currentSession?.access_token) && !forceRecoveryView);
    }
  }

  async function refreshMpConnectionStatus(options = {}) {
    const announce = options && options.announce === true;
    const quiet = options && options.quiet === true;

    if (!currentSession?.access_token || forceRecoveryView) {
      setMpIntegrationStatusUnknown();
      return;
    }

    if (!quiet) {
      setBusyButton(mpRefreshStatusBtn, true, "Consultando...");
    }

    try {
      const response = await callMpOauthFunction(
        { action: "status" },
        currentSession.access_token,
      );
      const parsed = parseMpStatusResponse(response);
      setMpIntegrationStatus(parsed);

      if (announce) {
        setStatus(
          parsed.connected
            ? "Mercado Pago conectado com sucesso."
            : "Mercado Pago ainda nao esta conectado.",
          parsed.connected ? "success" : "info",
        );
      }
    } catch (error) {
      console.error("[profile] erro ao consultar status MP:", error);
      const message =
        error instanceof Error ? error.message : "Falha ao consultar status da integracao Mercado Pago.";
      setMpIntegrationStatusUnknown(message);
      if (announce) {
        setStatus(message, "error");
      }
    } finally {
      if (!quiet) {
        setBusyButton(mpRefreshStatusBtn, false, "Atualizar status");
      }
      setMpIntegrationControlsEnabled(Boolean(currentSession?.access_token) && !forceRecoveryView);
    }
  }

  function parseMpStatusResponse(response) {
    const candidates = [response, response?.data, response?.integracao, response?.integration].filter((value) => {
      return value && typeof value === "object";
    });

    let connectedFlag = null;
    let integrationId = "";
    let accountLabel = "";

    candidates.forEach((source) => {
      if (connectedFlag === null) {
        if (Object.prototype.hasOwnProperty.call(source, "connected")) {
          connectedFlag = parseBoolean(source.connected);
        } else if (Object.prototype.hasOwnProperty.call(source, "is_connected")) {
          connectedFlag = parseBoolean(source.is_connected);
        } else if (Object.prototype.hasOwnProperty.call(source, "active")) {
          connectedFlag = parseBoolean(source.active);
        } else if (Object.prototype.hasOwnProperty.call(source, "ativo")) {
          connectedFlag = parseBoolean(source.ativo);
        } else if (Object.prototype.hasOwnProperty.call(source, "status")) {
          const status = asLooseText(source.status).toLowerCase();
          if (status.includes("disconnect")) {
            connectedFlag = false;
          } else if (status.includes("connect")) {
            connectedFlag = true;
          }
        }
      }

      if (!integrationId) {
        integrationId = asLooseText(
          source.integracao_id ??
            source.integration_id ??
            source.id ??
            source.mp_user_id ??
            "",
        );
      }

      if (!accountLabel) {
        accountLabel = asLooseText(
          source.account_email ??
            source.email ??
            source.nickname ??
            source.user_email ??
            source.user_id ??
            source.collector_id ??
            "",
        );
      }
    });

    const connectedFallback = Boolean(integrationId);
    const connected = connectedFlag === null ? connectedFallback : connectedFlag;
    const known = connectedFlag !== null || Boolean(integrationId) || Boolean(accountLabel);

    return {
      known,
      connected,
      integrationId,
      accountLabel,
    };
  }

  function setMpIntegrationStatus(payload = {}) {
    mpStatusKnown = payload && payload.known === true;
    mpConnected = payload && payload.connected === true;
    const integrationId = asLooseText(payload.integrationId);
    const accountLabel = asLooseText(payload.accountLabel);

    if (mpConnectionPillEl) {
      mpConnectionPillEl.classList.remove("is-connected", "is-disconnected", "is-unknown");
      if (!mpStatusKnown) {
        mpConnectionPillEl.classList.add("is-unknown");
        mpConnectionPillEl.textContent = "Nao verificado";
      } else if (mpConnected) {
        mpConnectionPillEl.classList.add("is-connected");
        mpConnectionPillEl.textContent = "Conectado";
      } else {
        mpConnectionPillEl.classList.add("is-disconnected");
        mpConnectionPillEl.textContent = "Desconectado";
      }
    }

    if (mpConnectionStatusTextEl) {
      if (!mpStatusKnown) {
        mpConnectionStatusTextEl.textContent = "Status nao consultado.";
      } else if (mpConnected) {
        mpConnectionStatusTextEl.textContent = "Sua conta Mercado Pago esta conectada.";
      } else {
        mpConnectionStatusTextEl.textContent = "Nenhuma conta Mercado Pago conectada.";
      }
    }

    if (mpConnectionMetaEl) {
      const details = [];
      if (integrationId) {
        details.push(`Integra\u00e7\u00e3o #${integrationId}`);
      }
      if (accountLabel) {
        details.push(`Conta: ${accountLabel}`);
      }

      if (details.length > 0) {
        mpConnectionMetaEl.textContent = details.join(" | ");
      } else if (mpStatusKnown && !mpConnected) {
        mpConnectionMetaEl.textContent = "Clique em Conectar Mercado Pago para iniciar o OAuth.";
      } else if (mpConnected) {
        mpConnectionMetaEl.textContent = "Conta conectada e pronta para checkout na area de pedidos.";
      } else {
        mpConnectionMetaEl.textContent = "Use os botoes abaixo para conectar, consultar status ou desconectar.";
      }
    }
  }

  function setMpIntegrationStatusUnknown(message) {
    setMpIntegrationStatus({
      known: false,
      connected: false,
      integrationId: "",
      accountLabel: "",
    });

    const errorMessage = asText(message);
    if (errorMessage && mpConnectionStatusTextEl) {
      mpConnectionStatusTextEl.textContent = "Nao foi possivel consultar o status agora.";
    }
    if (errorMessage && mpConnectionMetaEl) {
      mpConnectionMetaEl.textContent = errorMessage;
    }
  }

  function setMpIntegrationControlsEnabled(enabled) {
    const canUse = Boolean(enabled) && Boolean(currentSession?.access_token);
    if (mpConnectBtn) {
      mpConnectBtn.disabled = !canUse;
    }
    if (mpRefreshStatusBtn) {
      mpRefreshStatusBtn.disabled = !canUse;
    }
    if (mpDisconnectBtn) {
      mpDisconnectBtn.disabled = !canUse || !mpStatusKnown || !mpConnected;
    }
  }

  function buildMpOAuthRedirectUrl() {
    try {
      const redirectUrl = new URL(PROFILE_URL || window.location.href, window.location.href);
      redirectUrl.searchParams.set("section", "integracoes");
      redirectUrl.hash = "";
      return redirectUrl.toString();
    } catch {
      const fallback = new URL(window.location.href);
      fallback.searchParams.set("section", "integracoes");
      fallback.hash = "";
      return fallback.toString();
    }
  }

  async function handleManageSubscription() {
    if (!currentSession?.access_token) {
      setStatus("Fa\u00e7a login para abrir o portal da assinatura.", "error");
      return;
    }

    setBusyButton(manageSubscriptionBtn, true, "Abrindo...");
    setStatus("Gerando portal de assinatura...", "info");

    try {
      const response = await callCheckoutFunction(
        {
          action: "create_portal_session",
          return_url: PROFILE_URL,
        },
        currentSession.access_token,
      );

      if (!response?.url) {
        throw new Error("Portal n\u00e3o retornou URL.");
      }

      window.location.href = response.url;
    } catch (error) {
      console.error("[profile] erro ao abrir portal:", error);
      setStatus(error instanceof Error ? error.message : "Falha ao abrir portal da assinatura.", "error");
    } finally {
      setBusyButton(manageSubscriptionBtn, false, "Gerenciar assinatura");
    }
  }

  async function handleOpenPlatform() {
    if (!currentSession?.access_token) {
      setStatus("Fa\u00e7a login para abrir a plataforma.", "error");
      return;
    }

    if (openPlatformBtn) {
      openPlatformBtn.disabled = true;
    }

    try {
      const accessOk = await ensureCompanyAccess(currentSession.access_token, { strict: true });
      if (!accessOk) {
        return;
      }

      window.location.href = PLATFORM_URL;
    } finally {
      if (openPlatformBtn) {
        openPlatformBtn.disabled = false;
      }
    }
  }

  async function handleLogout() {
    if (logoutInProgress) {
      return;
    }

    const logoutTimeoutMessage = "Tempo excedido ao sair. A sess\u00e3o local foi limpa.";

    logoutInProgress = true;
    setBusyButton(logoutBtn, true, "Saindo...");

    try {
      const { error } = await withTimeout(
        supabase.auth.signOut({ scope: "local" }),
        8000,
        logoutTimeoutMessage,
      );

      if (error) {
        throw new Error(error.message);
      }

      currentSession = null;
      setAuthView(false);
      clearProfileFields();
      setStatus("Sess\u00e3o encerrada.", "success");
    } catch (error) {
      clearStoredSessionKeys();
      currentSession = null;
      setAuthView(false);
      clearProfileFields();
      const message = error instanceof Error ? error.message : "";
      if (message && message !== logoutTimeoutMessage) {
        setStatus(message, "error");
      } else {
        setStatus("Sess\u00e3o encerrada.", "success");
      }
    } finally {
      logoutInProgress = false;
      setBusyButton(logoutBtn, false, "Sair");
    }
  }

  async function ensureCompanyAccess(accessToken, options = {}) {
    const strict = options.strict === true;

    if (!accessToken) {
      return false;
    }

    const result = await checkCompanyAccess(accessToken);
    if (result.allowed) {
      return true;
    }

    if (result.status === 403) {
      setStatus(ACCOUNT_BLOCKED_MESSAGE, "error");
      return !strict;
    }

    if (result.status === 401) {
      await forceLogout(ACCOUNT_REMOVED_MESSAGE);
      return false;
    }

    if (result.status === 404) {
      if (strict) {
        setStatus("Conta sem empresa vinculada no momento.", "error");
        return false;
      }
      return true;
    }

    if (strict) {
      setStatus(result.message || "N\u00e3o foi poss\u00edvel validar o acesso da conta agora.", "error");
      return false;
    }

    return true;
  }

  async function checkCompanyAccess(accessToken) {
    let response = null;
    try {
      response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "check_company_access" }),
      });
    } catch {
      return {
        allowed: false,
        status: 0,
        message: "Falha de conex\u00e3o ao validar acesso da empresa.",
      };
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (response.ok) {
      return {
        allowed: Boolean(data.allowed),
        status: response.status,
        message: "",
      };
    }

    return {
      allowed: false,
      status: response.status,
      message: asText(data.error) || `Erro HTTP ${response.status}`,
    };
  }

  async function forceLogout(message) {
    try {
      await withTimeout(
        supabase.auth.signOut({ scope: "local" }),
        6000,
        "Tempo excedido ao encerrar sess\u00e3o local.",
      );
    } catch {
      // Keep going and clear local tokens even if signOut fails.
    }

    clearStoredSessionKeys();
    currentSession = null;
    forceRecoveryView = false;
    setAuthView(false);
    clearProfileFields();
    setStatus(message, "error");
  }

  async function callMpOauthFunction(payload, accessToken) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken || ""}`,
    };

    if (SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("SUA_SUPABASE_ANON_KEY")) {
      headers.apikey = SUPABASE_ANON_KEY;
    }

    const response = await fetch(MP_OAUTH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message = asText(data.error) || `Erro HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function callCheckoutFunction(payload, accessToken) {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message = asText(data.error) || `Erro HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async function getSessionWithFutureRetry() {
    let lastResult = { data: { session: null }, error: null };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await supabase.auth.getSession();
        const message = asText(result.error?.message).toLowerCase();

        if (message.includes("issued in the future")) {
          await sleep((attempt + 1) * 1500);
          lastResult = result;
          continue;
        }

        return result;
      } catch (error) {
        if (isAbortLikeError(error)) {
          await sleep((attempt + 1) * 1200);
          continue;
        }
        throw error;
      }
    }

    return lastResult;
  }

  async function recoverSessionFromHash() {
    const accessToken = getHashParam("access_token");
    const refreshToken = getHashParam("refresh_token");

    if (!accessToken || !refreshToken) {
      return null;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!error && data?.session) {
          return data.session;
        }

        const message = asText(error?.message).toLowerCase();
        if (message.includes("issued in the future")) {
          await sleep((attempt + 1) * 1500);
          continue;
        }

        break;
      } catch (error) {
        if (isAbortLikeError(error)) {
          await sleep((attempt + 1) * 1200);
          continue;
        }
        break;
      }
    }

    return null;
  }

  function isAbortLikeError(error) {
    if (!error) return false;
    const name = asText(error.name).toLowerCase();
    const message = asText(error.message).toLowerCase();
    return name === "aborterror" || message.includes("signal is aborted");
  }

  function isUnprocessableAuthError(error) {
    if (!error || typeof error !== "object") return false;
    const status = Number(error.status || 0);
    const message = asText(error.message).toLowerCase();

    if (status === 422) return true;
    if (!message) return false;

    return (
      message.includes("unprocessable") ||
      message.includes("invalid jwt") ||
      message.includes("bad jwt") ||
      message.includes("invalid claim") ||
      message.includes("sub claim")
    );
  }

  function translateAuthErrorToPtBr(message) {
    const text = asText(message);
    const lower = text.toLowerCase();

    if (!lower) return "Falha ao salvar senha.";

    if (lower.includes("new password should be different from the old password")) {
      return "A nova senha deve ser diferente da senha antiga.";
    }

    if (lower.includes("password should be at least")) {
      return "A senha precisa ter o tamanho m\u00ednimo exigido.";
    }

    if (lower.includes("invalid login credentials")) {
      return "Credenciais inv\u00e1lidas. Fa\u00e7a login novamente e tente outra vez.";
    }

    return text;
  }

  async function waitForUrlTokenClockSkew() {
    const accessToken = getHashParam("access_token");
    if (!accessToken) {
      return;
    }

    const payload = decodeJwtPayload(accessToken);
    if (!payload) {
      return;
    }

    const iat = Number(payload.iat || 0);
    const nbf = Number(payload.nbf || 0);
    const tokenStart = Math.max(iat, nbf);

    if (!Number.isFinite(tokenStart) || tokenStart <= 0) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const skewSeconds = tokenStart - now;

    if (skewSeconds <= 0) {
      return;
    }

    if (skewSeconds > 120) {
      setStatus(
        "Hor\u00e1rio do dispositivo est\u00e1 muito adiantado/atrasado. Corrija data/hora do Windows e gere novo link.",
        "error",
      );
      return;
    }

    setStatus(`Sincronizando login (${skewSeconds}s)...`, "info");
    await sleep((skewSeconds + 1) * 1000);
  }

  function hasHashAccessToken() {
    return Boolean(getHashParam("access_token"));
  }

  function getHashParam(key) {
    const hashRaw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const hash = new URLSearchParams(hashRaw);
    return asText(hash.get(key));
  }

  function decodeJwtPayload(token) {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    try {
      const json = decodeBase64Url(parts[1]);
      const payload = JSON.parse(json);
      return payload && typeof payload === "object" ? payload : null;
    } catch {
      return null;
    }
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - (normalized.length % 4)) % 4;
    const padded = `${normalized}${"=".repeat(padding)}`;
    return window.atob(padded);
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function readEntryState() {
    const query = new URLSearchParams(window.location.search);
    const hashRaw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const hash = new URLSearchParams(hashRaw);
    const section = asText(query.get("section")).toLowerCase();
    const pathname = asText(window.location.pathname).toLowerCase();

    const type = asText(hash.get("type") || query.get("type"));
    const checkoutSuccess = query.get("checkout") === "success";
    const fromPasswordSetupFlow = type === "recovery" || type === "invite";
    const openIntegrations =
      section === "integracoes" ||
      section === "integrations" ||
      query.get("integracoes") === "1" ||
      pathname.endsWith("/integracoes") ||
      pathname.endsWith("/integrations");

    const hasAuthHashData =
      Boolean(hash.get("access_token")) ||
      Boolean(hash.get("refresh_token")) ||
      Boolean(hash.get("expires_in")) ||
      Boolean(hash.get("token_type")) ||
      Boolean(hash.get("error_code")) ||
      Boolean(hash.get("error_description"));

    const hasCleanableAuthParams =
      checkoutSuccess ||
      Boolean(query.get("session_id")) ||
      Boolean(query.get("pt")) ||
      hasAuthHashData ||
      Boolean(type);

    const recoveryMode =
      fromPasswordSetupFlow ||
      (hasAuthHashData && (type === "recovery" || Boolean(hash.get("access_token"))));

    return {
      shouldOpenPassword: checkoutSuccess || fromPasswordSetupFlow,
      recoveryMode,
      checkoutSuccess,
      hasCleanableAuthParams,
      openIntegrations,
    };
  }

  function clearAuthParamsFromUrl() {
    const url = new URL(window.location.href);
    const queryKeysToRemove = ["checkout", "session_id", "pt", "type"];

    queryKeysToRemove.forEach((key) => {
      url.searchParams.delete(key);
    });

    url.hash = "";

    const nextSearch = url.searchParams.toString();
    const cleanUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  function setPasswordSectionVisible(visible) {
    if (passwordSection) {
      passwordSection.hidden = !visible;
    }

    if (togglePasswordSectionBtn) {
      togglePasswordSectionBtn.textContent = visible ? "Ocultar senha" : "Alterar senha";
    }
  }

  function setIntegrationsSectionVisible(visible) {
    const canShow =
      Boolean(visible) &&
      Boolean(currentSession?.user) &&
      !forceRecoveryView &&
      canManageCompanySettings();

    if (integrationsSectionEl) {
      integrationsSectionEl.hidden = !canShow;
    }

    if (toggleIntegrationsSectionBtn) {
      toggleIntegrationsSectionBtn.textContent = canShow
        ? "Ocultar integra\u00e7\u00f5es"
        : "Integra\u00e7\u00f5es";
    }

    setMpIntegrationControlsEnabled(Boolean(currentSession?.user) && !forceRecoveryView);
  }

  function setCompanySectionVisible(visible) {
    const canManageCompany = canManageCompanySettings();

    if (companySectionAnimationTimerId !== null) {
      window.clearTimeout(companySectionAnimationTimerId);
      companySectionAnimationTimerId = null;
    }

    if (!companySectionEl) {
      const canEditCompanyForm = canManageCompany && visible;
      setCompanyFormEnabled(canEditCompanyForm);
      if (toggleCompanySectionBtn) {
        toggleCompanySectionBtn.textContent = visible ? "Ocultar configuração da empresa" : "Configuração da empresa";
      }
      return;
    }

    if (visible && canManageCompany) {
      companySectionEl.hidden = false;
      companySectionEl.classList.remove("is-hiding");
      companySectionEl.style.removeProperty("--company-section-max-height");

      const measuredHeight = Math.max(220, companySectionEl.scrollHeight + 10);
      companySectionEl.style.setProperty("--company-section-max-height", `${measuredHeight}px`);

      if (!prefersReducedMotion()) {
        companySectionEl.classList.add("is-hiding");
        window.requestAnimationFrame(() => {
          companySectionEl.classList.remove("is-hiding");
        });

        companySectionAnimationTimerId = window.setTimeout(() => {
          if (!companySectionEl.classList.contains("is-hiding")) {
            companySectionEl.style.removeProperty("--company-section-max-height");
          }
          companySectionAnimationTimerId = null;
        }, COMPANY_SECTION_ANIMATION_MS + 40);
      } else {
        companySectionEl.style.removeProperty("--company-section-max-height");
      }
    } else {
      closeTaxRegimeDropdown();

      if (companySectionEl.hidden) {
        companySectionEl.classList.remove("is-hiding");
        companySectionEl.style.removeProperty("--company-section-max-height");
      } else if (prefersReducedMotion()) {
        companySectionEl.hidden = true;
        companySectionEl.classList.remove("is-hiding");
        companySectionEl.style.removeProperty("--company-section-max-height");
      } else {
        const measuredHeight = Math.max(220, companySectionEl.scrollHeight + 10);
        companySectionEl.style.setProperty("--company-section-max-height", `${measuredHeight}px`);
        companySectionEl.classList.add("is-hiding");

        companySectionAnimationTimerId = window.setTimeout(() => {
          companySectionEl.hidden = true;
          companySectionEl.classList.remove("is-hiding");
          companySectionEl.style.removeProperty("--company-section-max-height");
          companySectionAnimationTimerId = null;
        }, COMPANY_SECTION_ANIMATION_MS);
      }
    }

    const canEditCompanyForm = canManageCompany && visible;
    setCompanyFormEnabled(canEditCompanyForm);

    if (toggleCompanySectionBtn) {
      toggleCompanySectionBtn.textContent = visible ? "Ocultar configuração da empresa" : "Configuração da empresa";
    }
  }

  function prefersReducedMotion() {
    if (!window.matchMedia) {
      return false;
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function syncTaxRegimeDropdown() {
    const value = asText(companyTaxRegimeSelect?.value).toUpperCase();
    const label = getTaxRegimeLabel(value);

    if (companyTaxRegimeLabel) {
      companyTaxRegimeLabel.textContent = label;
    }

    companyTaxRegimeOptions.forEach((button) => {
      const buttonValue = asText(button.dataset.taxRegimeOption).toUpperCase();
      const selected = Boolean(value) && value === buttonValue;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function getTaxRegimeLabel(value) {
    const normalized = asText(value).toUpperCase();
    if (!normalized) {
      return "Selecione o regime";
    }

    const matched = companyTaxRegimeOptions.find((button) => {
      return asText(button.dataset.taxRegimeOption).toUpperCase() === normalized;
    });

    return asText(matched?.textContent) || "Selecione o regime";
  }

  function selectTaxRegime(value) {
    const normalized = asText(value).toUpperCase();
    if (companyTaxRegimeSelect) {
      companyTaxRegimeSelect.value = TAX_REGIMES.has(normalized) ? normalized : "";
      clearFieldValidationError(companyTaxRegimeSelect);
    }

    markCompanyFormDirty();
    syncTaxRegimeDropdown();
    closeTaxRegimeDropdown();
  }

  function toggleTaxRegimeDropdown() {
    if (!companyTaxRegimeTrigger || companyTaxRegimeTrigger.disabled) {
      return;
    }

    const isOpen = companyTaxRegimeDropdown?.classList.contains("is-open");
    if (isOpen) {
      closeTaxRegimeDropdown();
      return;
    }

    openTaxRegimeDropdown();
  }

  function openTaxRegimeDropdown() {
    if (!companyTaxRegimeMenuWrap || !companyTaxRegimeDropdown || !companyTaxRegimeTrigger) {
      return;
    }

    companyTaxRegimeMenuWrap.hidden = false;
    const triggerRect = companyTaxRegimeTrigger.getBoundingClientRect();
    const maxMenuHeight = 260;
    const desiredMenuHeight = Math.min(companyTaxRegimeMenuWrap.scrollHeight || 0, maxMenuHeight) + 8;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const shouldOpenUp = spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow;
    companyTaxRegimeDropdown.classList.toggle("is-open-up", shouldOpenUp);
    companyTaxRegimeDropdown.classList.add("is-open");
    companyTaxRegimeTrigger.setAttribute("aria-expanded", "true");
  }

  function closeTaxRegimeDropdown() {
    if (!companyTaxRegimeMenuWrap || !companyTaxRegimeDropdown || !companyTaxRegimeTrigger) {
      return;
    }

    companyTaxRegimeMenuWrap.hidden = true;
    companyTaxRegimeDropdown.classList.remove("is-open");
    companyTaxRegimeDropdown.classList.remove("is-open-up");
    companyTaxRegimeTrigger.setAttribute("aria-expanded", "false");
  }

  function setAccountActionsEnabled(enabled) {
    const isTestAccount = currentSession?.user?.email === 'teste@admin.com';
    if (isTestAccount) {
      enabled = false;
    }

    if (openPlatformBtn) openPlatformBtn.disabled = !enabled;
    const canManageCompany = canManageCompanySettings();

    if (manageSubscriptionBtn) {
      manageSubscriptionBtn.disabled = isTestAccount ? false : (!enabled || !canManageCompany);
    }
    if (logoutBtn) logoutBtn.disabled = false;

    if (toggleCompanySectionBtn) {
      toggleCompanySectionBtn.disabled = !enabled || forceRecoveryView || !canManageCompany;
    }
    if (toggleIntegrationsSectionBtn) {
      toggleIntegrationsSectionBtn.disabled = !enabled || forceRecoveryView || !canManageCompany;
    }
    if (copyUserIdBtn) {
      copyUserIdBtn.disabled = !enabled || asText(profileUserIdEl?.textContent) === "-";
    }
    setCompanyFormEnabled(enabled && !forceRecoveryView && forceShowCompanySection && canManageCompany);
    setMpIntegrationControlsEnabled(enabled && !forceRecoveryView && canManageCompany);

    if (togglePasswordSectionBtn) {
      togglePasswordSectionBtn.disabled = !enabled && !forceRecoveryView;
    }
  }

  function clearProfileFields() {
    if (profileNameEl) profileNameEl.textContent = "-";
    if (profileEmailEl) profileEmailEl.textContent = "-";
    if (profileRoleEl) profileRoleEl.textContent = "-";
    if (profileRoleItemEl) profileRoleItemEl.hidden = true;
    if (profileUserIdEl) profileUserIdEl.textContent = "-";
    if (profileAvatarEl) profileAvatarEl.textContent = "--";
    setCopyUserIdEnabled(false);
    forceShowCompanySection = false;
    forceShowIntegrationsSection = false;
    setCompanySectionVisible(false);
    setIntegrationsSectionVisible(false);
    clearCompanyTaxFields();
    setMpIntegrationStatusUnknown();
  }

  async function loadCurrentProfileContext(session) {
    const requestId = ++profileContextRequestId;
    const userId = asText(session?.user?.id);

    if (!userId) {
      currentProfile = null;
      syncProfileAccessUi(null, null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("cargo, permissoes, company_id")
        .eq("id", userId)
        .maybeSingle();

      if (requestId !== profileContextRequestId) {
        return;
      }

      if (error) {
        console.error("[profile] erro ao carregar profile:", error);
        currentProfile = null;
      } else {
        currentProfile = data || null;
      }
    } catch (error) {
      if (requestId !== profileContextRequestId) {
        return;
      }

      console.error("[profile] falha ao carregar contexto do profile:", error);
      currentProfile = null;
    }

    syncProfileAccessUi(session.user, currentProfile);
  }

  function syncProfileAccessUi(user, profile) {
    const isAdmin = isCompanyAdmin(user, profile);
    const collaboratorRole = getCollaboratorRole(user, profile);

    if (profileRoleEl) {
      profileRoleEl.textContent = collaboratorRole || "-";
    }

    if (profileRoleItemEl) {
      profileRoleItemEl.hidden = forceRecoveryView || isAdmin || !collaboratorRole;
    }

    if (manageSubscriptionBtn) {
      const isTestAccount = user?.email === 'teste@admin.com';
      manageSubscriptionBtn.hidden = isTestAccount ? false : !isAdmin;
    }

    if (toggleCompanySectionBtn) {
      toggleCompanySectionBtn.hidden = !isAdmin;
    }

    if (toggleIntegrationsSectionBtn) {
      toggleIntegrationsSectionBtn.hidden = !isAdmin;
    }

    if (!isAdmin) {
      forceShowCompanySection = false;
      forceShowIntegrationsSection = false;
      setCompanySectionVisible(false);
      setIntegrationsSectionVisible(false);
      setMpIntegrationStatusUnknown();
    } else if (currentSession?.access_token && !forceRecoveryView) {
      void loadCompanyTaxProfile(currentSession.access_token);
      void refreshMpConnectionStatus({ announce: false, quiet: true });
    }

    setAccountActionsEnabled(Boolean(currentSession?.user) && !forceRecoveryView);
  }

  function canManageCompanySettings() {
    return isCompanyAdmin(currentSession?.user, currentProfile);
  }

  function isCompanyAdmin(user, profile) {
    const role = normalizeRole(
      profile?.permissoes?.role ||
      profile?.permissoes?.perfil ||
      user?.user_metadata?.role ||
      user?.app_metadata?.role,
    );

    if (role) {
      return role === "admin" || role === "administrador" || role === "owner" || role === "proprietario";
    }

    const cargo = normalizeRole(profile?.cargo || user?.user_metadata?.cargo);
    return cargo === "admin" || cargo === "administrador" || cargo === "owner" || cargo === "proprietario";
  }

  function getCollaboratorRole(user, profile) {
    const cargo = asText(profile?.cargo || user?.user_metadata?.cargo);
    return cargo || "Colaborador";
  }

  function normalizeRole(value) {
    return asText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  async function loadCompanyTaxProfile(accessToken) {
    if (!accessToken || forceRecoveryView) return;

    try {
      const response = await callCheckoutFunction(
        { action: "get_company_tax_profile" },
        accessToken,
      );
      setCompanyTaxFields(response?.company || {});
    } catch (error) {
      console.error("[profile] erro ao carregar ficha fiscal:", error);
    }
  }

  function setCompanyTaxFields(company, options = {}) {
    const force = options && options.force === true;
    if (companyFormDirty && !force) {
      return;
    }

    const isIndividual =
      parseBoolean(company?.is_individual) ||
      (digitsOnly(asText(company?.cpf)).length === 11 && digitsOnly(asText(company?.cnpj)).length !== 14);

    setCompanyPersonType(
      isIndividual ? TAX_PERSON_TYPE_INDIVIDUAL : TAX_PERSON_TYPE_COMPANY,
      { keepDocument: true },
    );

    if (companyCnpjInput) {
      companyCnpjInput.value = isIndividual
        ? digitsOnly(asText(company?.cpf)).slice(0, 11)
        : digitsOnly(asText(company?.cnpj)).slice(0, 14);
    }

    if (companyStateRegistrationInput) {
      companyStateRegistrationInput.value = asText(company?.state_registration);
    }

    if (companyMunicipalRegistrationInput) {
      companyMunicipalRegistrationInput.value = asText(company?.municipal_registration);
    }

    if (companyTaxRegimeSelect) {
      const regime = asText(company?.tax_regime).toUpperCase();
      companyTaxRegimeSelect.value = TAX_REGIMES.has(regime) ? regime : "";
    }

    companyFormDirty = false;
    syncTaxRegimeDropdown();
  }

  function clearCompanyTaxFields() {
    setCompanyPersonType(TAX_PERSON_TYPE_COMPANY, { keepDocument: false });
    if (companyCnpjInput) companyCnpjInput.value = "";
    if (companyStateRegistrationInput) companyStateRegistrationInput.value = "";
    if (companyMunicipalRegistrationInput) companyMunicipalRegistrationInput.value = "";
    if (companyTaxRegimeSelect) companyTaxRegimeSelect.value = "";
    companyFormDirty = false;
    syncTaxRegimeDropdown();
    closeTaxRegimeDropdown();
  }

  function setCompanyFormEnabled(enabled) {
    const controls = [
      companyCnpjInput,
      companyStateRegistrationInput,
      companyMunicipalRegistrationInput,
      companyTaxRegimeSelect,
      companySaveBtn,
      taxPersonCompanyBtn,
      taxPersonIndividualBtn,
    ];

    controls.forEach((control) => {
      if (control && "disabled" in control) {
        control.disabled = !enabled;
      }
    });

    if (companyTaxRegimeTrigger && "disabled" in companyTaxRegimeTrigger) {
      companyTaxRegimeTrigger.disabled = !enabled;
    }

    companyTaxRegimeOptions.forEach((button) => {
      button.disabled = !enabled;
    });

    if (!enabled) {
      closeTaxRegimeDropdown();
    }
  }

  function clearFieldValidationError(input) {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) {
      return;
    }

    input.setCustomValidity("");
  }

  function clearCompanyFieldValidationErrors() {
    clearFieldValidationError(companyCnpjInput);
    clearFieldValidationError(companyStateRegistrationInput);
    clearFieldValidationError(companyMunicipalRegistrationInput);
    clearFieldValidationError(companyTaxRegimeSelect);
  }

  function showCompanyValidationError(input, message, focusTarget) {
    setStatus(message, "error");

    if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) {
      input.setCustomValidity(message);
      input.reportValidity();
      input.focus();
      return;
    }

    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus();
    }
  }

  function setCompanyPersonType(type, options = {}) {
    const normalizedType = type === TAX_PERSON_TYPE_INDIVIDUAL ? TAX_PERSON_TYPE_INDIVIDUAL : TAX_PERSON_TYPE_COMPANY;
    const keepDocument = options && options.keepDocument === true;
    const shouldMarkDirty = options && options.markDirty === true;
    const previousType = companyTaxPersonType;

    companyTaxPersonType = normalizedType;
    const isIndividual = companyTaxPersonType === TAX_PERSON_TYPE_INDIVIDUAL;
    clearCompanyFieldValidationErrors();

    if (taxPersonCompanyBtn) {
      const active = !isIndividual;
      taxPersonCompanyBtn.classList.toggle("is-active", active);
      taxPersonCompanyBtn.setAttribute("aria-pressed", active ? "true" : "false");
    }

    if (taxPersonIndividualBtn) {
      const active = isIndividual;
      taxPersonIndividualBtn.classList.toggle("is-active", active);
      taxPersonIndividualBtn.setAttribute("aria-pressed", active ? "true" : "false");
    }

    if (companySectionTitleEl) {
      companySectionTitleEl.textContent = isIndividual ? "Ficha fiscal da pessoa f\u00edsica" : "Ficha fiscal da empresa";
    }

    if (companySectionHintEl) {
      companySectionHintEl.textContent = isIndividual
        ? "Preencha os dados fiscais para concluir seu cadastro no EvoPG."
        : "Preencha os dados fiscais para concluir o cadastro da empresa no EvoPG.";
    }

    if (companyDocumentLabelEl) {
      companyDocumentLabelEl.textContent = isIndividual ? "CPF" : "CNPJ";
    }

    if (companyCnpjInput) {
      companyCnpjInput.maxLength = isIndividual ? 11 : 14;
      companyCnpjInput.placeholder = isIndividual
        ? "Somente n\u00fameros (11 d\u00edgitos)"
        : "Somente n\u00fameros (14 d\u00edgitos)";
      companyCnpjInput.setAttribute("aria-label", isIndividual ? "CPF" : "CNPJ");

      if (!keepDocument && previousType !== normalizedType) {
        companyCnpjInput.value = "";
      }
    }

    if (companyStateRegistrationFieldEl) {
      companyStateRegistrationFieldEl.hidden = isIndividual;
    }

    if (companyMunicipalRegistrationFieldEl) {
      companyMunicipalRegistrationFieldEl.hidden = isIndividual;
    }

    if (companyTaxRegimeFieldEl) {
      companyTaxRegimeFieldEl.hidden = isIndividual;
    }

    if (companyStateRegistrationInput) {
      companyStateRegistrationInput.required = !isIndividual;
      if (isIndividual) {
        companyStateRegistrationInput.value = "";
      }
    }

    if (companyMunicipalRegistrationInput) {
      companyMunicipalRegistrationInput.required = !isIndividual;
      if (isIndividual) {
        companyMunicipalRegistrationInput.value = "";
      }
    }

    if (companyTaxRegimeSelect) {
      companyTaxRegimeSelect.required = !isIndividual;
      if (isIndividual) {
        companyTaxRegimeSelect.value = "";
      }
    }

    syncTaxRegimeDropdown();

    if (isIndividual) {
      closeTaxRegimeDropdown();
    }

    if (shouldMarkDirty) {
      markCompanyFormDirty();
    }
  }

  async function handleCopyUserId() {
    const id = asText(profileUserIdEl?.textContent);
    if (!id || id === "-") {
      setStatus("ID de usu\u00e1rio indispon\u00edvel para c\u00f3pia.", "error");
      return;
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(id);
      } else {
        fallbackCopyText(id);
      }
      setStatus("ID copiado.", "success");
    } catch {
      setStatus("N\u00e3o foi poss\u00edvel copiar o ID automaticamente.", "error");
    }
  }

  function setCopyUserIdEnabled(enabled) {
    if (copyUserIdBtn) {
      copyUserIdBtn.disabled = !enabled;
    }
  }

  function setProfileAvatar(displayName, email) {
    if (!profileAvatarEl) return;
    profileAvatarEl.textContent = buildInitials(displayName || email || "--");
  }

  function markCompanyFormDirty() {
    companyFormDirty = true;
  }

  function buildInitials(value) {
    const text = asText(value);
    if (!text) return "--";

    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "--";

    const parts = normalized.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    const compact = parts[0].replace(/[^a-z0-9]/gi, "");
    if (!compact) return "--";
    return compact.slice(0, 2).toUpperCase();
  }

  function digitsOnly(value) {
    return asText(value).replace(/\D+/g, "");
  }

  function parseBoolean(value) {
    if (typeof value === "boolean") return value;

    const text = asText(value).toLowerCase();
    if (!text) return false;

    return text === "true" || text === "1" || text === "sim";
  }

  function fallbackCopyText(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);
    input.focus();
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }

  function startRecoveryCooldown(seconds) {
    const parsed = Number(seconds);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    recoveryCooldownSeconds = Math.max(1, Math.floor(parsed));
    updateRecoverySubmitButtonLabel();

    if (recoveryCooldownTimerId !== null) {
      window.clearInterval(recoveryCooldownTimerId);
    }

    recoveryCooldownTimerId = window.setInterval(() => {
      recoveryCooldownSeconds -= 1;
      if (recoveryCooldownSeconds <= 0) {
        recoveryCooldownSeconds = 0;
        if (recoveryCooldownTimerId !== null) {
          window.clearInterval(recoveryCooldownTimerId);
          recoveryCooldownTimerId = null;
        }
      }

      updateRecoverySubmitButtonLabel();
    }, 1000);
  }

  function updateRecoverySubmitButtonLabel() {
    if (!(recoverySubmitBtn instanceof HTMLButtonElement)) {
      return;
    }

    recoverySubmitBtn.dataset.defaultLabel = recoverySubmitBtn.dataset.defaultLabel || recoverySubmitBtn.textContent || "";

    if (recoveryCooldownSeconds > 0) {
      recoverySubmitBtn.textContent = `Reenviar em ${recoveryCooldownSeconds}s`;
      recoverySubmitBtn.disabled = true;
      return;
    }

    recoverySubmitBtn.textContent = recoverySubmitBtn.dataset.defaultLabel || "Enviar link para definir senha";
    recoverySubmitBtn.disabled = false;
  }

  function extractRecoveryCooldownSeconds(message) {
    const text = asText(message).toLowerCase();
    if (!text) {
      return 0;
    }

    const englishSeconds = findSecondsAfterPrefix(text, ["after", "in"], ["seconds", "second"]);
    if (englishSeconds > 0) {
      return englishSeconds;
    }

    const portugueseSeconds = findSecondsAfterPrefix(text, ["aguarde", "em"], ["segundos", "segundo", "s"]);
    if (portugueseSeconds > 0) {
      return portugueseSeconds;
    }

    const fallbackPortugueseSeconds = findSecondsBeforeUnit(text, ["segundos", "segundo"]);
    if (fallbackPortugueseSeconds > 0) {
      return fallbackPortugueseSeconds;
    }

    if (text.includes("security purposes") || text.includes("too many requests") || text.includes("rate limit")) {
      return 60;
    }

    return 0;
  }

  function findSecondsAfterPrefix(text, prefixes, units) {
    for (const prefix of prefixes) {
      let fromIndex = 0;

      while (fromIndex < text.length) {
        const prefixIndex = text.indexOf(prefix, fromIndex);
        if (prefixIndex < 0) {
          break;
        }

        fromIndex = prefixIndex + prefix.length;
        if (!hasTokenBoundary(text, prefixIndex, prefix.length)) {
          continue;
        }

        const parsed = readIntegerAfter(text, fromIndex);
        if (parsed.value <= 0) {
          continue;
        }

        if (startsWithAnyUnit(text, parsed.nextIndex, units)) {
          return parsed.value;
        }
      }
    }

    return 0;
  }

  function findSecondsBeforeUnit(text, units) {
    for (const unit of units) {
      let fromIndex = 0;

      while (fromIndex < text.length) {
        const unitIndex = text.indexOf(unit, fromIndex);
        if (unitIndex < 0) {
          break;
        }

        fromIndex = unitIndex + unit.length;
        if (!hasTokenBoundary(text, unitIndex, unit.length)) {
          continue;
        }

        let endIndex = unitIndex;
        while (endIndex > 0 && isSkippableSeparator(text[endIndex - 1])) {
          endIndex -= 1;
        }

        let startIndex = endIndex;
        while (startIndex > 0 && isDigit(text[startIndex - 1])) {
          startIndex -= 1;
        }

        if (startIndex === endIndex) {
          continue;
        }

        const value = Number(text.slice(startIndex, endIndex));
        if (Number.isFinite(value) && value > 0) {
          return Math.floor(value);
        }
      }
    }

    return 0;
  }

  function readIntegerAfter(text, startIndex) {
    let index = startIndex;

    while (index < text.length && isSkippableSeparator(text[index])) {
      index += 1;
    }

    const numberStart = index;
    while (index < text.length && isDigit(text[index])) {
      index += 1;
    }

    if (numberStart === index) {
      return { value: 0, nextIndex: startIndex };
    }

    const value = Number(text.slice(numberStart, index));
    if (!Number.isFinite(value) || value <= 0) {
      return { value: 0, nextIndex: index };
    }

    return { value: Math.floor(value), nextIndex: index };
  }

  function startsWithAnyUnit(text, startIndex, units) {
    let index = startIndex;
    while (index < text.length && isSkippableSeparator(text[index])) {
      index += 1;
    }

    for (const unit of units) {
      if (!text.startsWith(unit, index)) {
        continue;
      }

      if (hasTokenBoundary(text, index, unit.length)) {
        return true;
      }
    }

    return false;
  }

  function hasTokenBoundary(text, startIndex, tokenLength) {
    const before = startIndex > 0 ? text[startIndex - 1] : "";
    const afterIndex = startIndex + tokenLength;
    const after = afterIndex < text.length ? text[afterIndex] : "";

    return !isTokenChar(before) && !isTokenChar(after);
  }

  function isSkippableSeparator(char) {
    return char === " " || char === "\t" || char === "\n" || char === "\r" || char === ":" || char === "-";
  }

  function isDigit(char) {
    const code = char.charCodeAt(0);
    return code >= 48 && code <= 57;
  }

  function isTokenChar(char) {
    if (!char) {
      return false;
    }

    const code = char.charCodeAt(0);
    const isAsciiLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const isAsciiDigit = code >= 48 && code <= 57;

    return isAsciiLetter || isAsciiDigit || char === "_" || code > 127;
  }

  function clearStoredSessionKeys() {
    const shouldClear = (key) => key.startsWith("sb-") && key.includes("-auth-token");

    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && shouldClear(key)) {
        window.localStorage.removeItem(key);
      }
    }

    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key && shouldClear(key)) {
        window.sessionStorage.removeItem(key);
      }
    }
  }

  async function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function asLooseText(value) {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function setBusy(form, isBusy) {
    if (!(form instanceof HTMLFormElement)) return;
    const controls = form.querySelectorAll("input, button");
    controls.forEach((control) => {
      if ("disabled" in control) {
        control.disabled = isBusy;
      }
    });
  }

  function setBusyButton(button, isBusy, busyLabel) {
    if (!(button instanceof HTMLButtonElement)) return;
    if (isBusy) {
      button.dataset.originalHtml = button.innerHTML || "";
      button.dataset.originalLabel = button.textContent || "";
      button.textContent = busyLabel;
      button.disabled = true;
      return;
    }

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent || "";
    }
    button.disabled = false;
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("is-success", "is-error");
    if (type === "success") statusEl.classList.add("is-success");
    if (type === "error") statusEl.classList.add("is-error");
  }
})();
