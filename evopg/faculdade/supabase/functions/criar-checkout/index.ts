import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "";
const DEFAULT_BASE_COLLABORATORS = 3;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, unknown>;

type ProvisionResult = {
  userId: string;
  companyId: string;
  alreadyExisted: boolean;
};

type AuthenticatedUser = {
  id: string;
  email: string;
};

function jsonResponse(status: number, payload: JsonObject) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function limit(value: string, max = 200): string {
  if (!value) return "";
  return value.length <= max ? value : value.slice(0, max);
}

function normalizeEmail(value: unknown): string {
  const email = toText(value).toLowerCase();
  if (!email) return "";
  return isLikelyEmail(email) ? email : "";
}

function isLikelyEmail(email: string): boolean {
  let atIndex = -1;
  let atCount = 0;

  for (let i = 0; i < email.length; i += 1) {
    const char = email[i];
    if (isWhitespaceChar(char)) {
      return false;
    }

    if (char === "@") {
      atCount += 1;
      atIndex = i;
      if (atCount > 1) {
        return false;
      }
    }
  }

  if (atCount !== 1 || atIndex <= 0 || atIndex >= email.length - 1) {
    return false;
  }

  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf(".");

  return dotIndex > 0 && dotIndex < domain.length - 1;
}

function isWhitespaceChar(char: string): boolean {
  return char.trim().length === 0;
}

function normalizeCargo(value: unknown): string {
  const raw = toText(value).toLowerCase();
  const allowed = new Set([
    "admin",
    "administrador",
    "gerente",
    "vendedor",
    "financeiro",
    "entregador",
    "outro",
  ]);

  if (allowed.has(raw)) {
    return raw;
  }

  return "administrador";
}

function normalizeDigits(value: unknown, max = 40): string {
  const raw = toText(value);
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  return digits.length <= max ? digits : digits.slice(0, max);
}

function normalizeTaxRegime(value: unknown): string {
  const raw = toText(value).toUpperCase();
  const allowed = new Set(["MEI", "SIMPLES", "PRESUMIDO", "REAL"]);
  return allowed.has(raw) ? raw : "";
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const raw = toText(value).toLowerCase();
  if (!raw) {
    return false;
  }

  return raw === "true" || raw === "1" || raw === "sim";
}

function isValidCnpj(value: string): boolean {
  return /^[0-9]{14}$/.test(value);
}

function isValidCpf(value: string): boolean {
  return /^[0-9]{11}$/.test(value);
}

function isValidPriceId(value: string): boolean {
  return value.startsWith("price_");
}

function getBaseSiteUrl(req: Request): string {
  const origin = req.headers.get("origin")?.trim();
  const base = SITE_URL || origin || "http://localhost:5501";
  return base.replace(/\/$/, "");
}

function buildSuccessUrl(successRedirectBase: string, provisionToken: string): string {
  const separator = successRedirectBase.includes("?") ? "&" : "?";
  return `${successRedirectBase}${separator}checkout=success&session_id={CHECKOUT_SESSION_ID}&pt=${encodeURIComponent(provisionToken)}`;
}

function getBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authHeader.slice("bearer ".length).trim();
}

async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return null;
  }

  const email = normalizeEmail(data.user.email || "");
  if (!email) {
    return null;
  }

  return {
    id: data.user.id,
    email,
  };
}

function compactMetadata(metadata: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const cleaned = limit(value, 200);
    if (cleaned) {
      output[key] = cleaned;
    }
  }

  return output;
}

function getCustomFieldValue(session: Stripe.Checkout.Session, key: string): string {
  const fields = (session as any).custom_fields ?? [];

  for (const field of fields) {
    if (field.key !== key) continue;

    if (field.type === "text") {
      return toText(field.text?.value ?? "");
    }

    if (field.type === "dropdown") {
      return toText(field.dropdown?.value ?? "");
    }
  }

  return "";
}

function getCheckoutCustomerId(session: Stripe.Checkout.Session): string {
  if (typeof session.customer === "string") {
    return session.customer;
  }

  if (session.customer && typeof session.customer === "object" && "id" in session.customer) {
    return toText(session.customer.id);
  }

  return "";
}

function getCheckoutSubscriptionId(session: Stripe.Checkout.Session): string {
  if (typeof session.subscription === "string") {
    return session.subscription;
  }

  if (session.subscription && typeof session.subscription === "object" && "id" in session.subscription) {
    return toText(session.subscription.id);
  }

  return "";
}

function isStripeCustomer(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
): customer is Stripe.Customer {
  return !("deleted" in customer && customer.deleted);
}

async function findStripeCustomerForUser(userId: string, email: string): Promise<string> {
  const candidates: Stripe.Customer[] = [];
  const seen = new Set<string>();

  const byEmail = await stripe.customers.list({ email, limit: 100 });
  for (const customer of byEmail.data) {
    if (!isStripeCustomer(customer)) continue;
    if (seen.has(customer.id)) continue;
    seen.add(customer.id);
    candidates.push(customer);
  }

  try {
    const query = `metadata['supabase_user_id']:'${userId}'`;
    const byMetadata = await stripe.customers.search({ query, limit: 20 });
    for (const customer of byMetadata.data) {
      if (!isStripeCustomer(customer)) continue;
      if (seen.has(customer.id)) continue;
      seen.add(customer.id);
      candidates.push(customer);
    }
  } catch {
    // Search endpoint may be unavailable depending on account settings.
  }

  const exact = candidates.find((customer) => toText(customer.metadata?.supabase_user_id) === userId);
  if (exact) {
    return exact.id;
  }

  return candidates[0]?.id || "";
}

function temporaryPassword(): string {
  return `${crypto.randomUUID()}Aa1!`;
}

async function parseBody(req: Request): Promise<JsonObject> {
  try {
    const data = await req.json();
    if (data && typeof data === "object") {
      return data as JsonObject;
    }
  } catch {
    // ignore and return empty object
  }

  return {};
}

async function findAuthUserByEmail(email: string) {
  if (!supabaseAdmin) {
    return null;
  }

  const perPage = 200;

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`Erro ao listar usuarios auth: ${error.message}`);
    }

    const users = data?.users ?? [];

    const found = users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
}

async function createCompany(nome: string, maxColaboradores: number) {
  if (!supabaseAdmin) {
    throw new Error("Cliente admin do Supabase nao configurado.");
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("companies")
    .insert({
      nome,
      plano: "Pro",
      max_colaboradores: maxColaboradores,
      payment_status: "em_dia",
      payment_last_paid_at: nowIso,
      payment_overdue_since: null,
      payment_grace_until: null,
      payment_blocked_at: null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Erro ao criar company: ${error?.message ?? "id nao retornado"}`);
  }

  return data.id as string;
}

async function markCompanyPaymentAsPaid(params: {
  companyId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  const updates: Record<string, unknown> = {
    payment_status: "em_dia",
    payment_last_paid_at: new Date().toISOString(),
    payment_overdue_since: null,
    payment_grace_until: null,
    payment_blocked_at: null,
  };

  if (toText(params.stripeCustomerId).startsWith("cus_")) {
    updates.stripe_customer_id = params.stripeCustomerId;
  }

  if (toText(params.stripeSubscriptionId).startsWith("sub_")) {
    updates.stripe_subscription_id = params.stripeSubscriptionId;
  }

  const { error } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", params.companyId);

  if (error) {
    throw new Error(`Erro ao atualizar status de pagamento da company: ${error.message}`);
  }
}

async function ensureProvisionedAccount(params: {
  email: string;
  nome: string;
  companyName: string;
  cargo: string;
  maxColaboradores: number;
}): Promise<ProvisionResult> {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  const { email, nome, companyName, cargo, maxColaboradores } = params;

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(`Erro ao buscar profile existente: ${existingProfileError.message}`);
  }

  if (existingProfile?.id) {
    let companyId = existingProfile.company_id as string | null;

    if (!companyId) {
      companyId = await createCompany(companyName, maxColaboradores);

      const { error: updateProfileCompanyError } = await supabaseAdmin
        .from("profiles")
        .update({ company_id: companyId })
        .eq("id", existingProfile.id);

      if (updateProfileCompanyError) {
        throw new Error(`Erro ao vincular company no profile existente: ${updateProfileCompanyError.message}`);
      }
    } else {
      const { error: updateCompanyError } = await supabaseAdmin
        .from("companies")
        .update({
          nome: companyName,
          plano: "Pro",
          max_colaboradores: maxColaboradores,
        })
        .eq("id", companyId);

      if (updateCompanyError) {
        throw new Error(`Erro ao atualizar company existente: ${updateCompanyError.message}`);
      }
    }

    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nome: nome || null,
        cargo,
        status: "ativo",
      })
      .eq("id", existingProfile.id);

    if (updateProfileError) {
      throw new Error(`Erro ao atualizar profile existente: ${updateProfileError.message}`);
    }

    return {
      userId: existingProfile.id,
      companyId,
      alreadyExisted: true,
    };
  }

  let authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword(),
      email_confirm: true,
      user_metadata: {
        nome,
        cargo,
        company_name: companyName,
      },
    });

    if (createUserError || !createdUser?.user?.id) {
      throw new Error(`Erro ao criar usuario auth: ${createUserError?.message ?? "usuario nao retornado"}`);
    }

    authUser = createdUser.user;
  }

  const { data: profileById, error: profileByIdError } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileByIdError) {
    throw new Error(`Erro ao buscar profile por id: ${profileByIdError.message}`);
  }

  if (profileById?.id) {
    let companyId = profileById.company_id as string | null;

    if (!companyId) {
      companyId = await createCompany(companyName, maxColaboradores);
    } else {
      const { error: updateExistingCompanyError } = await supabaseAdmin
        .from("companies")
        .update({
          nome: companyName,
          plano: "Pro",
          max_colaboradores: maxColaboradores,
        })
        .eq("id", companyId);

      if (updateExistingCompanyError) {
        throw new Error(`Erro ao atualizar company vinculada ao profile existente: ${updateExistingCompanyError.message}`);
      }
    }

    const { error: updateProfileByIdError } = await supabaseAdmin
      .from("profiles")
      .update({
        email,
        company_id: companyId,
        nome: nome || null,
        cargo,
        status: "ativo",
        permissoes: { role: "admin" },
      })
      .eq("id", authUser.id);

    if (updateProfileByIdError) {
      throw new Error(`Erro ao atualizar profile existente por id: ${updateProfileByIdError.message}`);
    }

    return {
      userId: authUser.id,
      companyId,
      alreadyExisted: true,
    };
  }

  const companyId = await createCompany(companyName, maxColaboradores);

  const { error: createProfileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: authUser.id,
      email,
      company_id: companyId,
      nome: nome || null,
      cargo,
      status: "ativo",
      permissoes: { role: "admin" },
    });

  if (createProfileError) {
    await supabaseAdmin.from("companies").delete().eq("id", companyId);
    throw new Error(`Erro ao criar profile: ${createProfileError.message}`);
  }

  return {
    userId: authUser.id,
    companyId,
    alreadyExisted: false,
  };
}

async function computeMaxCollaborators(session: Stripe.Checkout.Session): Promise<number> {
  let max = DEFAULT_BASE_COLLABORATORS;
  const extraPriceId = toText(session.metadata?.price_id_extra);

  if (!extraPriceId) {
    return max;
  }

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    const extraItem = lineItems.data.find((item) => item.price?.id === extraPriceId);
    const extraQuantity = Number(extraItem?.quantity ?? 0);

    if (Number.isFinite(extraQuantity) && extraQuantity > 0) {
      max += extraQuantity;
    }
  } catch {
    // Keep base collaborators if Stripe line_items retrieval fails.
  }

  return max;
}

async function handleCreateCheckout(req: Request, body: JsonObject) {
  const priceIdBase = toText(body.price_id_base);
  const priceIdExtra = toText(body.price_id_extra);

  if (!isValidPriceId(priceIdBase)) {
    return jsonResponse(400, {
      error: "price_id_base invalido. Use um ID de preco Stripe (price_...).",
    });
  }

  if (priceIdExtra && !isValidPriceId(priceIdExtra)) {
    return jsonResponse(400, {
      error: "price_id_extra invalido. Use um ID de preco Stripe (price_...).",
    });
  }

  const email = normalizeEmail(body.email);
  const nome = limit(toText(body.full_name || body.nome), 120);
  const companyName = limit(toText(body.company_name || body.nome_empresa), 120);
  const cargo = normalizeCargo(body.cargo);

  const baseSiteUrl = getBaseSiteUrl(req);
  const successRedirectBase = toText(body.success_redirect_url) || `${baseSiteUrl}/index.html`;
  const cancelUrl = toText(body.cancel_url) || `${baseSiteUrl}/index.html?checkout=cancelado`;

  const provisionToken = crypto.randomUUID().replaceAll("-", "");

  const successUrl = buildSuccessUrl(successRedirectBase, provisionToken);

  const metadata = compactMetadata({
    provision_token: provisionToken,
    requested_email: email,
    full_name: nome,
    company_name: companyName,
    cargo,
    price_id_extra: priceIdExtra,
    base_collaborators: String(DEFAULT_BASE_COLLABORATORS),
  });

  const customFields: any[] = [];

  if (!companyName) {
    customFields.push({
      key: "company_name",
      label: { type: "custom", custom: "Nome da empresa" },
      type: "text",
      optional: false,
      text: { minimum_length: 2, maximum_length: 80 },
    });
  }

  if (!nome) {
    customFields.push({
      key: "full_name",
      label: { type: "custom", custom: "Seu nome" },
      type: "text",
      optional: false,
      text: { minimum_length: 2, maximum_length: 80 },
    });
  }

  const lineItems: any[] = [
    { price: priceIdBase, quantity: 1 },
  ];

  if (priceIdExtra) {
    lineItems.push({
      price: priceIdExtra,
      quantity: 1,
      adjustable_quantity: {
        enabled: true,
        minimum: 0,
        maximum: 99,
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: lineItems,
    customer_email: email || undefined,
    allow_promotion_codes: true,
    metadata,
    custom_fields: customFields.length > 0 ? customFields : undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return jsonResponse(200, {
    sessionId: session.id,
    checkoutUrl: session.url,
  });
}

async function handleFinalizeCheckout(req: Request, body: JsonObject) {
  if (!supabaseAdmin) {
    return jsonResponse(500, {
      error: "Supabase admin nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const sessionId = toText(body.session_id);
  const provisionToken = toText(body.provision_token);

  if (!sessionId.startsWith("cs_")) {
    return jsonResponse(400, { error: "session_id invalido." });
  }

  if (!provisionToken) {
    return jsonResponse(400, { error: "provision_token obrigatorio." });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (!session?.id) {
    return jsonResponse(404, { error: "Sessao Stripe nao encontrada." });
  }

  if (toText(session.metadata?.provision_token) !== provisionToken) {
    return jsonResponse(403, { error: "Token de provisionamento invalido." });
  }

  if (session.status !== "complete") {
    return jsonResponse(409, {
      error: "Checkout ainda nao concluido.",
      status: session.status,
      payment_status: session.payment_status,
    });
  }

  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";

  if (!paid) {
    return jsonResponse(409, {
      error: "Pagamento ainda nao confirmado.",
      payment_status: session.payment_status,
    });
  }

  const email = normalizeEmail(
    session.customer_details?.email ||
      session.customer_email ||
      session.metadata?.requested_email ||
      "",
  );

  const nome = limit(
    toText(
      session.metadata?.full_name ||
        getCustomFieldValue(session, "full_name") ||
        session.customer_details?.name ||
        "",
    ),
    120,
  );

  const companyName = limit(
    toText(session.metadata?.company_name || getCustomFieldValue(session, "company_name") || ""),
    120,
  );

  if (!email) {
    return jsonResponse(400, {
      error: "Nao foi possivel obter o email do comprador no Stripe checkout.",
    });
  }

  if (!companyName) {
    return jsonResponse(400, {
      error:
        "Nao foi possivel obter o nome da empresa. Envie company_name ao criar checkout ou habilite campo customizado.",
    });
  }

  const cargo = normalizeCargo(session.metadata?.cargo || "administrador");
  const maxColaboradores = await computeMaxCollaborators(session);

  const provisionResult = await ensureProvisionedAccount({
    email,
    nome,
    companyName,
    cargo,
    maxColaboradores,
  });

  const redirectTo = toText(body.redirect_to) || `${getBaseSiteUrl(req)}/perfil.html`;

  const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo,
    },
  });

  if (magicError) {
    return jsonResponse(500, {
      error: `Erro ao gerar magic link: ${magicError.message}`,
    });
  }

  const loginUrl = magicData?.properties?.action_link;

  if (!loginUrl) {
    return jsonResponse(500, {
      error: "Magic link nao retornado pelo Supabase.",
    });
  }

  const stripeCustomerId = getCheckoutCustomerId(session);
  const stripeSubscriptionId = getCheckoutSubscriptionId(session);

  try {
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        ...session.metadata,
        supabase_user_id: provisionResult.userId,
        supabase_company_id: provisionResult.companyId,
      },
    });
  } catch {
    // Ignore Stripe metadata update errors.
  }

  if (stripeCustomerId.startsWith("cus_")) {
    try {
      await stripe.customers.update(stripeCustomerId, {
        metadata: compactMetadata({
          supabase_user_id: provisionResult.userId,
          supabase_company_id: provisionResult.companyId,
          buyer_email: email,
        }),
      });
    } catch {
      // Ignore Stripe customer metadata update errors.
    }
  }

  await markCompanyPaymentAsPaid({
    companyId: provisionResult.companyId,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  return jsonResponse(200, {
    ok: true,
    login_url: loginUrl,
    user_id: provisionResult.userId,
    company_id: provisionResult.companyId,
    already_existed: provisionResult.alreadyExisted,
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
  });
}

async function handleCreatePortalSession(req: Request, body: JsonObject) {
  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return jsonResponse(401, { error: "Usuario nao autenticado." });
  }

  const returnUrl = toText(body.return_url) || `${getBaseSiteUrl(req)}/perfil.html`;
  const customerId = await findStripeCustomerForUser(authUser.id, authUser.email);

  if (!customerId) {
    return jsonResponse(404, {
      error: "Nenhum cliente Stripe encontrado para este usuario.",
    });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return jsonResponse(200, {
    ok: true,
    url: portalSession.url,
    customer_id: customerId,
  });
}

async function handleCheckCompanyAccess(req: Request) {
  if (!supabaseAdmin) {
    return jsonResponse(500, {
      error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.",
    });
  }

  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return jsonResponse(401, { error: "Usuario nao autenticado." });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse(500, { error: `Erro ao buscar profile: ${profileError.message}` });
  }

  const companyId = toText(profile?.company_id);
  if (!companyId) {
    return jsonResponse(404, { error: "Company nao encontrada para o usuario." });
  }

  const { error: recalcError } = await supabaseAdmin.rpc("recalculate_company_payment_status", {
    p_company_id: companyId,
  });

  if (recalcError) {
    return jsonResponse(500, { error: `Erro ao recalcular status de pagamento: ${recalcError.message}` });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("payment_status,payment_overdue_since,payment_grace_until,payment_blocked_at")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    return jsonResponse(500, { error: `Erro ao buscar company: ${companyError.message}` });
  }

  if (!company) {
    return jsonResponse(404, { error: "Company nao encontrada para o usuario." });
  }

  const paymentStatus = toText(company.payment_status) || "em_dia";
  const allowed = paymentStatus !== "bloqueado";

  return jsonResponse(allowed ? 200 : 403, {
    ok: allowed,
    allowed,
    company_id: companyId,
    payment_status: paymentStatus,
    payment_overdue_since: company.payment_overdue_since,
    payment_grace_until: company.payment_grace_until,
    payment_blocked_at: company.payment_blocked_at,
  });
}

async function handleGetCompanyTaxProfile(req: Request) {
  if (!supabaseAdmin) {
    return jsonResponse(500, {
      error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.",
    });
  }

  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return jsonResponse(401, { error: "Usuario nao autenticado." });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse(500, { error: `Erro ao buscar profile: ${profileError.message}` });
  }

  const companyId = toText(profile?.company_id);
  if (!companyId) {
    return jsonResponse(404, { error: "Company nao encontrada para o usuario." });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,nome,is_individual,cpf,cnpj,state_registration,municipal_registration,tax_regime")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    return jsonResponse(500, { error: `Erro ao buscar dados fiscais da company: ${companyError.message}` });
  }

  if (!company) {
    return jsonResponse(404, { error: "Company nao encontrada para o usuario." });
  }

  return jsonResponse(200, {
    ok: true,
    company,
  });
}

async function handleUpdateCompanyTaxProfile(req: Request, body: JsonObject) {
  if (!supabaseAdmin) {
    return jsonResponse(500, {
      error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.",
    });
  }

  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return jsonResponse(401, { error: "Usuario nao autenticado." });
  }

  const isIndividual = parseBoolean(body.is_individual);
  const cpf = normalizeDigits(body.cpf, 11);
  const cnpj = normalizeDigits(body.cnpj, 14);
  const stateRegistration = limit(toText(body.state_registration), 40);
  const municipalRegistration = limit(toText(body.municipal_registration), 40);
  const taxRegime = normalizeTaxRegime(body.tax_regime);

  if (isIndividual) {
    if (!isValidCpf(cpf)) {
      return jsonResponse(400, { error: "CPF invalido. Informe somente numeros com 11 digitos." });
    }
  } else {
    if (!isValidCnpj(cnpj)) {
      return jsonResponse(400, { error: "CNPJ invalido. Informe somente numeros com 14 digitos." });
    }

    if (!stateRegistration) {
      return jsonResponse(400, { error: "Inscricao Estadual (state_registration) obrigatoria." });
    }

    if (!municipalRegistration) {
      return jsonResponse(400, { error: "Inscricao Municipal (municipal_registration) obrigatoria." });
    }

    if (!taxRegime) {
      return jsonResponse(400, { error: "tax_regime invalido. Use MEI, SIMPLES, PRESUMIDO ou REAL." });
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse(500, { error: `Erro ao buscar profile: ${profileError.message}` });
  }

  const companyId = toText(profile?.company_id);
  if (!companyId) {
    return jsonResponse(404, { error: "Company nao encontrada para o usuario." });
  }

  const updates: Record<string, unknown> = isIndividual
    ? {
        is_individual: true,
        cpf,
        cnpj: null,
        state_registration: null,
        municipal_registration: null,
        tax_regime: null,
      }
    : {
        is_individual: false,
        cpf: null,
        cnpj,
        state_registration: stateRegistration,
        municipal_registration: municipalRegistration,
        tax_regime: taxRegime,
      };

  const { data: company, error: updateError } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", companyId)
    .select("id,nome,is_individual,cpf,cnpj,state_registration,municipal_registration,tax_regime")
    .single();

  if (updateError) {
    const errCode = toText((updateError as { code?: string }).code);
    const errorMessage = toText((updateError as { message?: string }).message).toLowerCase();

    if (errCode === "23505") {
      if (errorMessage.includes("cpf")) {
        return jsonResponse(409, { error: "CPF ja cadastrado em outra conta." });
      }
      return jsonResponse(409, { error: "CNPJ ja cadastrado em outra empresa." });
    }

    return jsonResponse(500, { error: `Erro ao salvar ficha fiscal da company: ${updateError.message}` });
  }

  return jsonResponse(200, {
    ok: true,
    company,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Metodo nao permitido." });
  }

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "STRIPE_SECRET_KEY nao configurada." });
  }

  const body = await parseBody(req);
  const action = toText(body.action) || "create_checkout";

  try {
    if (action === "create_checkout") {
      return await handleCreateCheckout(req, body);
    }

    if (action === "finalize_checkout") {
      return await handleFinalizeCheckout(req, body);
    }

    if (action === "create_portal_session") {
      return await handleCreatePortalSession(req, body);
    }

    if (action === "check_company_access") {
      return await handleCheckCompanyAccess(req);
    }

    if (action === "get_company_tax_profile") {
      return await handleGetCompanyTaxProfile(req);
    }

    if (action === "update_company_tax_profile") {
      return await handleUpdateCompanyTaxProfile(req, body);
    }

    return jsonResponse(400, {
      error: "action invalida. Use create_checkout, finalize_checkout, create_portal_session, check_company_access, get_company_tax_profile ou update_company_tax_profile.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return jsonResponse(500, { error: message });
  }
});
