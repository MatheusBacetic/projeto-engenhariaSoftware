(() => {
  const config = window.EVOPG_CHECKOUT_CONFIG || {};

  const FUNCTION_URL = config.functionUrl || "https://iihqakwfqlkpsutnfpvq.functions.supabase.co/criar-checkout";
  const SUPABASE_ANON_KEY = config.anonKey || "SUA_SUPABASE_ANON_KEY";
  const STRIPE_PUBLISHABLE_KEY = config.stripePublishableKey || "pk_test_REPLACE_ME";
  const PRICE_ID_BASE = config.priceIdBase || "price_REPLACE_BASE";
  const PRICE_ID_EXTRA = config.priceIdExtra || "price_REPLACE_EXTRA";
  const SUCCESS_REDIRECT_URL = config.successRedirectUrl || `${window.location.origin}/index.html`;
  const CANCEL_URL = config.cancelUrl || `${window.location.origin}/index.html?checkout=cancelado`;
  const APP_REDIRECT_AFTER_LOGIN = config.appRedirectAfterLogin || `${window.location.origin}/perfil.html`;
  const topLoginBtn = document.querySelector(".top-login-btn");
  const topLoginLabel = topLoginBtn?.querySelector("span");
  const topLoginIcon = topLoginBtn?.querySelector(".material-icons");
  const topSignupBtn = document.querySelector(".top-signup-btn");
  const checkoutSuccessModal = document.getElementById("checkout-success-modal");
  const checkoutSuccessKicker = checkoutSuccessModal?.querySelector(".checkout-success-kicker");
  const checkoutSuccessTitle = document.getElementById("checkout-success-title");
  const checkoutSuccessMessage = checkoutSuccessModal?.querySelector("p");
  const checkoutSuccessLoginBtn = document.getElementById("checkout-success-login-btn");
  const checkoutSuccessLoginLabel = checkoutSuccessLoginBtn?.querySelector(".btn-label");
  const checkoutSuccessCloseBtn = document.getElementById("checkout-success-close-btn");
  let checkoutTermsModal = document.getElementById("checkout-terms-modal");
  let checkoutTermsAcceptCheckbox = document.getElementById("checkout-terms-accept-checkbox");
  let checkoutTermsContinueBtn = document.getElementById("checkout-terms-continue-btn");
  let checkoutTermsBackBtn = document.getElementById("checkout-terms-back-btn");
  let checkoutTermsCloseBtn = document.getElementById("checkout-terms-close-btn");
  const TERMS_VERSION = config.termsVersion || "2026-02-28";

  const hasPlaceholderConfig =
    FUNCTION_URL.includes("SEU_PROJECT_REF") ||
    FUNCTION_URL.includes("seu_project_ref") ||
    SUPABASE_ANON_KEY.includes("SUA_SUPABASE_ANON_KEY") ||
    STRIPE_PUBLISHABLE_KEY.includes("REPLACE_ME") ||
    PRICE_ID_BASE.includes("REPLACE_BASE");

  if (hasPlaceholderConfig) {
    console.warn("[checkout] Configure window.EVOPG_CHECKOUT_CONFIG antes de usar checkout em producao.");
  }

  const stripe = window.Stripe ? window.Stripe(STRIPE_PUBLISHABLE_KEY) : null;
  let resolveTermsAcceptance = null;
  let termsEventsBound = false;

  function refreshCheckoutTermsRefs() {
    checkoutTermsModal = document.getElementById("checkout-terms-modal");
    checkoutTermsAcceptCheckbox = document.getElementById("checkout-terms-accept-checkbox");
    checkoutTermsContinueBtn = document.getElementById("checkout-terms-continue-btn");
    checkoutTermsBackBtn = document.getElementById("checkout-terms-back-btn");
    checkoutTermsCloseBtn = document.getElementById("checkout-terms-close-btn");
  }

  function ensureCheckoutTermsModalExists() {
    if (checkoutTermsModal instanceof HTMLElement) {
      return true;
    }

    if (!(document.body instanceof HTMLElement)) {
      return false;
    }

    const fallbackModal = document.createElement("div");
    fallbackModal.id = "checkout-terms-modal";
    fallbackModal.className = "checkout-terms-modal";
    fallbackModal.hidden = true;
    fallbackModal.style.cssText =
      "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;" +
      "padding:16px;background:rgba(2,6,23,.78);backdrop-filter:blur(3px);";
    fallbackModal.innerHTML = `
      <div class="checkout-terms-modal-card" role="dialog" aria-modal="true" aria-labelledby="checkout-terms-title"
        style="width:min(760px,96vw);max-height:90vh;overflow:auto;border-radius:16px;border:1px solid #bfdbfe;background:#fff;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);">
        <div class="checkout-terms-modal-header">
          <span class="checkout-success-kicker">Contrato de uso</span>
          <button type="button" class="checkout-terms-close-btn" id="checkout-terms-close-btn" aria-label="Fechar contrato">
            <i class="material-icons" aria-hidden="true">close</i>
          </button>
        </div>
        <h2 id="checkout-terms-title">Termos de Uso e Condicoes de Servico - EvoPG</h2>
        <p class="checkout-terms-intro">Leia e aceite este contrato antes de continuar para o checkout do Stripe.</p>
        <div class="checkout-terms-scroll">
          <section class="checkout-terms-clause">
            <h3>Resumo juridico</h3>
            <p>Uso da plataforma sob modelo SaaS (obrigacao de meio), responsabilidade fiscal do usuario, fornecimento As Is e direito de arrependimento em ate 7 dias (CDC).</p>
          </section>
          <section class="checkout-terms-clause">
            <h3>LGPD e aceite</h3>
            <p>O usuario atua como Controlador dos dados que insere e o EvoPG como Operador, com aceite eletronico necessario para seguir ao pagamento.</p>
          </section>
        </div>
        <label class="checkout-terms-accept">
          <input type="checkbox" id="checkout-terms-accept-checkbox">
          <span>Li e concordo expressamente com os Termos de Uso e Condicoes de Servico.</span>
        </label>
        <div class="checkout-terms-actions">
          <button type="button" class="checkout-terms-back-btn" id="checkout-terms-back-btn">Voltar</button>
          <button type="button" class="btn-primary checkout-terms-continue-btn" id="checkout-terms-continue-btn" disabled>
            <span class="btn-energy"></span>
            <span class="btn-label">Aceitar e ir para pagamento</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(fallbackModal);
    refreshCheckoutTermsRefs();
    return checkoutTermsModal instanceof HTMLElement;
  }

  function bindCheckoutTermsEvents() {
    if (termsEventsBound) {
      return;
    }

    if (!(checkoutTermsModal instanceof HTMLElement)) {
      return;
    }

    if (checkoutTermsAcceptCheckbox instanceof HTMLInputElement) {
      checkoutTermsAcceptCheckbox.addEventListener("change", () => {
        if (checkoutTermsContinueBtn instanceof HTMLButtonElement) {
          checkoutTermsContinueBtn.disabled = !checkoutTermsAcceptCheckbox.checked;
        }
      });
    }

    if (checkoutTermsContinueBtn instanceof HTMLButtonElement) {
      checkoutTermsContinueBtn.addEventListener("click", () => {
        completeCheckoutTermsPrompt(true);
      });
    }

    if (checkoutTermsBackBtn instanceof HTMLButtonElement) {
      checkoutTermsBackBtn.addEventListener("click", () => {
        completeCheckoutTermsPrompt(false);
      });
    }

    if (checkoutTermsCloseBtn instanceof HTMLButtonElement) {
      checkoutTermsCloseBtn.addEventListener("click", () => {
        completeCheckoutTermsPrompt(false);
      });
    }

    checkoutTermsModal.addEventListener("click", (event) => {
      if (event.target === checkoutTermsModal) {
        completeCheckoutTermsPrompt(false);
      }
    });

    termsEventsBound = true;
  }

  function setCheckoutTermsModalVisible(isVisible) {
    if (!(checkoutTermsModal instanceof HTMLElement)) {
      return;
    }

    checkoutTermsModal.hidden = !isVisible;
    document.body.classList.toggle("is-modal-open", isVisible);
  }

  function resetCheckoutTermsModal() {
    if (checkoutTermsAcceptCheckbox instanceof HTMLInputElement) {
      checkoutTermsAcceptCheckbox.checked = false;
    }

    if (checkoutTermsContinueBtn instanceof HTMLButtonElement) {
      checkoutTermsContinueBtn.disabled = true;
    }
  }

  function completeCheckoutTermsPrompt(accepted) {
    setCheckoutTermsModalVisible(false);

    if (typeof resolveTermsAcceptance === "function") {
      const resolver = resolveTermsAcceptance;
      resolveTermsAcceptance = null;
      resolver(Boolean(accepted));
    }
  }

  function requestCheckoutTermsAcceptance() {
    if (!(checkoutTermsModal instanceof HTMLElement)) {
      const modalReady = ensureCheckoutTermsModalExists();
      if (!modalReady) {
        console.error("[checkout] modal de termos nao disponivel.");
        alert("Nao foi possivel exibir os Termos de Uso agora. Atualize a pagina e tente novamente.");
        return Promise.resolve(false);
      }
    }

    bindCheckoutTermsEvents();

    if (resolveTermsAcceptance) {
      return Promise.resolve(false);
    }

    resetCheckoutTermsModal();
    setCheckoutTermsModalVisible(true);

    return new Promise((resolve) => {
      resolveTermsAcceptance = resolve;
    });
  }

  function getFieldValue(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && "value" in element) {
        const value = String(element.value || "").trim();
        if (value) return value;
      }
    }

    return "";
  }

  function collectCheckoutData() {
    return {
      email: getFieldValue(["#checkout-email", "[name='email']", "[data-checkout-email]"]),
      full_name: getFieldValue(["#checkout-nome", "[name='nome']", "[data-checkout-nome]"]),
      company_name: getFieldValue(["#checkout-empresa", "[name='empresa']", "[data-checkout-empresa]"]),
      cargo: getFieldValue(["#checkout-cargo", "[name='cargo']", "[data-checkout-cargo]"]),
    };
  }

  async function callCheckoutFunction(payload) {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
      const message = data.error || `Erro HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function safelyParseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function readStoredSession() {
    const fromLocal = readStoredSessionFrom(window.localStorage);
    if (fromLocal) return fromLocal;
    return readStoredSessionFrom(window.sessionStorage);
  }

  function readStoredSessionFrom(storage) {
    try {
      if (!storage) return null;

      const keys = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith("sb-") && key.includes("-auth-token")) {
          keys.push(key);
        }
      }

      const now = Math.floor(Date.now() / 1000);
      for (const key of keys) {
        const raw = storage.getItem(key);
        const parsed = raw ? safelyParseJson(raw) : null;
        if (!parsed) continue;

        const session = parsed?.currentSession || parsed?.session || parsed || null;
        const accessToken = asText(session?.access_token);
        const expiresAt = Number(session?.expires_at || 0);
        if (!accessToken) {
          continue;
        }

        if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= now) {
          continue;
        }

        const user = session?.user || parsed?.user || null;
        if (user) {
          return {
            key,
            session,
            user,
            accessToken,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  function normalizeFirstName(raw) {
    const text = asText(raw);
    if (!text) return "";

    const firstToken = text.split(/\s+/).filter(Boolean)[0] || "";
    const firstSegment = firstToken.split(/[._-]/).filter(Boolean)[0] || firstToken;
    const limited = firstSegment.slice(0, 20);
    if (!limited) return "";

    return limited.charAt(0).toUpperCase() + limited.slice(1);
  }

  function deriveFirstNameFromUser(user) {
    if (!user || typeof user !== "object") return "";

    const candidates = [
      asText(user?.user_metadata?.nome),
      asText(user?.user_metadata?.first_name),
      asText(user?.user_metadata?.given_name),
      asText(user?.user_metadata?.full_name),
      asText(user?.user_metadata?.name),
      asText(user?.email),
    ].filter(Boolean);

    if (!candidates.length) return "";

    let base = candidates[0];
    if (base.includes("@")) {
      base = base.split("@")[0];
    }

    return normalizeFirstName(base);
  }

  async function checkCompanyAccess(accessToken) {
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "check_company_access" }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.ok) {
        return "allowed";
      }

      if (response.status === 401) {
        return "removed";
      }

      return "unknown";
    } catch {
      // Keep existing label if network fails.
      return "unknown";
    }
  }

  function clearStoredAuthTokens() {
    if (!window.localStorage || !window.sessionStorage) {
      return;
    }

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

  function setTopLoginAsDefault() {
    if (topLoginLabel instanceof HTMLElement) {
      topLoginLabel.textContent = "Login";
    }

    if (topLoginIcon instanceof HTMLElement) {
      topLoginIcon.textContent = "login";
    }
  }

  function setTopSignupVisible(isVisible) {
    if (!(topSignupBtn instanceof HTMLElement)) return;
    topSignupBtn.hidden = !isVisible;
  }

  function setCheckoutSuccessModalVisible(isVisible) {
    if (!(checkoutSuccessModal instanceof HTMLElement)) {
      return;
    }

    checkoutSuccessModal.hidden = !isVisible;
    document.body.classList.toggle("is-modal-open", isVisible);
  }

  function clearCheckoutQueryParams() {
    const url = new URL(window.location.href);
    const keys = ["checkout", "session_id", "pt"];

    keys.forEach((key) => {
      url.searchParams.delete(key);
    });

    const nextSearch = url.searchParams.toString();
    const cleanUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  function openCheckoutSuccessModal(loginUrl) {
    const targetUrl = asText(loginUrl) || APP_REDIRECT_AFTER_LOGIN;

    if (checkoutSuccessLoginBtn instanceof HTMLAnchorElement) {
      checkoutSuccessLoginBtn.href = targetUrl;
    }

    if (!(checkoutSuccessModal instanceof HTMLElement)) {
      window.location.href = targetUrl;
      return;
    }

    setCheckoutSuccessModalVisible(true);
  }

  function setCheckoutSuccessPrimaryAction(options) {
    const label = asText(options?.label);
    const href = asText(options?.href);
    const disabled = options?.disabled === true;

    if (checkoutSuccessLoginLabel instanceof HTMLElement && label) {
      checkoutSuccessLoginLabel.textContent = label;
    }

    if (checkoutSuccessLoginBtn instanceof HTMLAnchorElement) {
      if (href) {
        checkoutSuccessLoginBtn.href = href;
      }

      checkoutSuccessLoginBtn.setAttribute("aria-disabled", disabled ? "true" : "false");
      checkoutSuccessLoginBtn.style.pointerEvents = disabled ? "none" : "";
      checkoutSuccessLoginBtn.style.opacity = disabled ? "0.72" : "";
    }
  }

  function setCheckoutSuccessModalState(state, customMessage) {
    const message = asText(customMessage);

    if (state === "loading") {
      if (checkoutSuccessKicker instanceof HTMLElement) checkoutSuccessKicker.textContent = "Pagamento recebido";
      if (checkoutSuccessTitle instanceof HTMLElement) checkoutSuccessTitle.textContent = "Confirmando seu acesso...";
      if (checkoutSuccessMessage instanceof HTMLElement) {
        checkoutSuccessMessage.textContent =
          "Estamos preparando sua conta. Em instantes voce podera clicar em Login e redefinir sua senha.";
      }
      if (checkoutSuccessCloseBtn instanceof HTMLButtonElement) {
        checkoutSuccessCloseBtn.hidden = true;
      }
      setCheckoutSuccessPrimaryAction({
        label: "Confirmando...",
        href: APP_REDIRECT_AFTER_LOGIN,
        disabled: true,
      });
      return;
    }

    if (state === "error") {
      if (checkoutSuccessKicker instanceof HTMLElement) checkoutSuccessKicker.textContent = "Pagamento confirmado";
      if (checkoutSuccessTitle instanceof HTMLElement) checkoutSuccessTitle.textContent = "Proximo passo";
      if (checkoutSuccessMessage instanceof HTMLElement) {
        checkoutSuccessMessage.textContent =
          message || "Clique em Login e use Recuperar senha para definir sua senha de acesso.";
      }
      if (checkoutSuccessCloseBtn instanceof HTMLButtonElement) {
        checkoutSuccessCloseBtn.hidden = false;
      }
      setCheckoutSuccessPrimaryAction({
        label: "Ir para Login",
        href: APP_REDIRECT_AFTER_LOGIN,
        disabled: false,
      });
      return;
    }

    if (checkoutSuccessKicker instanceof HTMLElement) checkoutSuccessKicker.textContent = "Pagamento confirmado";
    if (checkoutSuccessTitle instanceof HTMLElement) checkoutSuccessTitle.textContent = "Conta criada com sucesso";
    if (checkoutSuccessMessage instanceof HTMLElement) {
      checkoutSuccessMessage.textContent =
        "Agora clique em Login e redefina sua senha para concluir o primeiro acesso na plataforma.";
    }
    if (checkoutSuccessCloseBtn instanceof HTMLButtonElement) {
      checkoutSuccessCloseBtn.hidden = false;
    }
    setCheckoutSuccessPrimaryAction({
      label: "Ir para Login e redefinir senha",
      disabled: false,
    });
  }

  async function syncTopLoginButtonName() {
    if (!(topLoginLabel instanceof HTMLElement)) return;

    const auth = readStoredSession();
    if (!auth?.user || !auth?.accessToken) {
      setTopLoginAsDefault();
      setTopSignupVisible(true);
      return;
    }

    // Render local session name first so the header does not flash "Login".
    const firstName = deriveFirstNameFromUser(auth.user);
    if (firstName) {
      topLoginLabel.textContent = firstName;

      if (topLoginIcon instanceof HTMLElement) {
        topLoginIcon.textContent = "person";
      }
    }
    setTopSignupVisible(false);

    const accessState = await checkCompanyAccess(auth.accessToken);
    if (accessState === "removed") {
      clearStoredAuthTokens();
      setTopLoginAsDefault();
      setTopSignupVisible(true);
    }
  }

  function setButtonsLoading(isLoading) {
    const buttons = document.querySelectorAll(".js-start-checkout");

    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      const label = button.querySelector(".btn-label");

      if (isLoading) {
        if (label instanceof HTMLElement) {
          label.dataset.originalText = label.dataset.originalText || (label.textContent || "");
          label.textContent = "Carregando...";
        } else {
          button.dataset.originalText = button.dataset.originalText || (button.textContent || "");
          button.textContent = "Carregando...";
        }
        button.style.pointerEvents = "none";
        button.style.opacity = "0.75";
        return;
      }

      if (label instanceof HTMLElement && label.dataset.originalText) {
        label.textContent = label.dataset.originalText;
      } else if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }

      button.style.pointerEvents = "";
      button.style.opacity = "";
    });
  }

  async function createCheckoutSessionAndRedirect() {
    setButtonsLoading(true);

    try {
      const registrationData = collectCheckoutData();

      const payload = {
        action: "create_checkout",
        price_id_base: PRICE_ID_BASE,
        price_id_extra: PRICE_ID_EXTRA,
        success_redirect_url: SUCCESS_REDIRECT_URL,
        cancel_url: CANCEL_URL,
        terms_accepted: true,
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
        ...registrationData,
      };

      const result = await callCheckoutFunction(payload);

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      if (stripe && result.sessionId) {
        const redirect = await stripe.redirectToCheckout({ sessionId: result.sessionId });
        if (redirect?.error) {
          throw new Error(redirect.error.message || "Falha ao redirecionar para o Stripe.");
        }
        return;
      }

      throw new Error("Checkout nao retornou sessionId nem checkoutUrl.");
    } catch (error) {
      console.error("[checkout] erro ao iniciar checkout:", error);
      alert(error instanceof Error ? error.message : "Erro ao iniciar pagamento.");
      setButtonsLoading(false);
    }
  }

  async function startCheckout(event) {
    event.preventDefault();

    const acceptedTerms = await requestCheckoutTermsAcceptance();
    if (!acceptedTerms) {
      return;
    }

    await createCheckoutSessionAndRedirect();
  }

  async function finalizeCheckoutFromQueryString() {
    const params = new URLSearchParams(window.location.search);

    const checkoutStatus = params.get("checkout");
    if (checkoutStatus === "cancelado") {
      clearCheckoutQueryParams();
      const acceptedTerms = await requestCheckoutTermsAcceptance();
      if (acceptedTerms) {
        await createCheckoutSessionAndRedirect();
      }
      return;
    }

    if (checkoutStatus !== "success") {
      return;
    }

    openCheckoutSuccessModal(APP_REDIRECT_AFTER_LOGIN);
    setCheckoutSuccessModalState("loading");

    const sessionId = params.get("session_id") || "";
    const provisionToken = params.get("pt") || "";

    if (!sessionId || !provisionToken) {
      setCheckoutSuccessModalState(
        "error",
        "Nao foi possivel confirmar automaticamente agora. Clique em Login e use Recuperar senha.",
      );
      return;
    }

    try {
      const result = await callCheckoutFunction({
        action: "finalize_checkout",
        session_id: sessionId,
        provision_token: provisionToken,
        redirect_to: APP_REDIRECT_AFTER_LOGIN,
      });

      if (!result.login_url) {
        throw new Error("Nao foi possivel gerar o link de login automatico.");
      }

      clearCheckoutQueryParams();
      openCheckoutSuccessModal(result.login_url);
      setCheckoutSuccessModalState("ready");
    } catch (error) {
      console.error("[checkout] erro ao finalizar checkout:", error);
      setCheckoutSuccessModalState(
        "error",
        "Pagamento aprovado. Agora clique em Login e use Recuperar senha para definir seu acesso.",
      );
    }
  }

  document.querySelectorAll(".js-start-checkout").forEach((button) => {
    button.addEventListener("click", startCheckout);
  });

  bindCheckoutTermsEvents();

  if (checkoutSuccessCloseBtn instanceof HTMLButtonElement) {
    checkoutSuccessCloseBtn.addEventListener("click", () => {
      setCheckoutSuccessModalVisible(false);
    });
  }

  if (checkoutSuccessModal instanceof HTMLElement) {
    checkoutSuccessModal.addEventListener("click", (event) => {
      if (event.target === checkoutSuccessModal) {
        setCheckoutSuccessModalVisible(false);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (checkoutTermsModal instanceof HTMLElement && !checkoutTermsModal.hidden) {
      completeCheckoutTermsPrompt(false);
      return;
    }

    if (checkoutSuccessModal instanceof HTMLElement && !checkoutSuccessModal.hidden) {
      setCheckoutSuccessModalVisible(false);
    }
  });

  void syncTopLoginButtonName();
  finalizeCheckoutFromQueryString();
})();
