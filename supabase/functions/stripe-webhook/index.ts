import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GRACE_DAYS = 15;

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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type CompanyBillingRow = {
  id: string;
  payment_status: "em_dia" | "atrasado" | "bloqueado" | null;
  payment_overdue_since: string | null;
  payment_grace_until: string | null;
  payment_blocked_at: string | null;
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoFromUnixSeconds(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

function plusDays(iso: string, days: number): string {
  const base = Date.parse(iso);
  const safe = Number.isFinite(base) ? base : Date.now();
  return new Date(safe + days * 24 * 60 * 60 * 1000).toISOString();
}

function toSubscriptionId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return toText((value as { id?: unknown }).id);
  return "";
}

function toCustomerId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return toText((value as { id?: unknown }).id);
  return "";
}

async function findCompanyByStripeIds(params: {
  customerId?: string;
  subscriptionId?: string;
}): Promise<CompanyBillingRow | null> {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  const selectCols = "id,payment_status,payment_overdue_since,payment_grace_until,payment_blocked_at";

  const subscriptionId = toText(params.subscriptionId);
  if (subscriptionId.startsWith("sub_")) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select(selectCols)
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar company por assinatura Stripe: ${error.message}`);
    if (data?.id) return data as CompanyBillingRow;
  }

  const customerId = toText(params.customerId);
  if (customerId.startsWith("cus_")) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select(selectCols)
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar company por customer Stripe: ${error.message}`);
    if (data?.id) return data as CompanyBillingRow;
  }

  return null;
}

async function markCompanyPaid(params: {
  companyId: string;
  paidAtIso: string;
  customerId?: string;
  subscriptionId?: string;
}) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  const updates: Record<string, unknown> = {
    payment_status: "em_dia",
    payment_last_paid_at: params.paidAtIso,
    payment_overdue_since: null,
    payment_grace_until: null,
    payment_blocked_at: null,
  };

  const customerId = toText(params.customerId);
  if (customerId.startsWith("cus_")) {
    updates.stripe_customer_id = customerId;
  }

  const subscriptionId = toText(params.subscriptionId);
  if (subscriptionId.startsWith("sub_")) {
    updates.stripe_subscription_id = subscriptionId;
  }

  const { error } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", params.companyId);

  if (error) {
    throw new Error(`Erro ao marcar company como paga: ${error.message}`);
  }
}

async function markCompanyOverdue(params: {
  row: CompanyBillingRow;
  overdueAtIso: string;
  customerId?: string;
  subscriptionId?: string;
}) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados.");
  }

  const overdueSince = params.row.payment_overdue_since || params.overdueAtIso;
  const graceUntil = params.row.payment_grace_until || plusDays(overdueSince, GRACE_DAYS);
  const blocked = Date.now() >= Date.parse(graceUntil);

  const updates: Record<string, unknown> = {
    payment_status: blocked ? "bloqueado" : "atrasado",
    payment_overdue_since: overdueSince,
    payment_grace_until: graceUntil,
    payment_blocked_at: blocked ? (params.row.payment_blocked_at || new Date().toISOString()) : null,
  };

  const customerId = toText(params.customerId);
  if (customerId.startsWith("cus_")) {
    updates.stripe_customer_id = customerId;
  }

  const subscriptionId = toText(params.subscriptionId);
  if (subscriptionId.startsWith("sub_")) {
    updates.stripe_subscription_id = subscriptionId;
  }

  const { error } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", params.row.id);

  if (error) {
    throw new Error(`Erro ao marcar company em atraso: ${error.message}`);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = toCustomerId(invoice.customer);
  const subscriptionId = toSubscriptionId(invoice.subscription);
  const company = await findCompanyByStripeIds({ customerId, subscriptionId });
  if (!company) return;

  const paidAtIso =
    isoFromUnixSeconds((invoice as any).status_transitions?.paid_at || invoice.created);

  await markCompanyPaid({
    companyId: company.id,
    paidAtIso,
    customerId,
    subscriptionId,
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = toCustomerId(invoice.customer);
  const subscriptionId = toSubscriptionId(invoice.subscription);
  const company = await findCompanyByStripeIds({ customerId, subscriptionId });
  if (!company) return;

  await markCompanyOverdue({
    row: company,
    overdueAtIso: isoFromUnixSeconds(invoice.created),
    customerId,
    subscriptionId,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = toCustomerId(subscription.customer);
  const subscriptionId = toText(subscription.id);
  const company = await findCompanyByStripeIds({ customerId, subscriptionId });
  if (!company) return;

  const status = toText(subscription.status);
  const paidStatuses = new Set(["active", "trialing"]);
  const overdueStatuses = new Set(["past_due", "unpaid", "canceled", "incomplete_expired"]);

  if (paidStatuses.has(status)) {
    await markCompanyPaid({
      companyId: company.id,
      paidAtIso: new Date().toISOString(),
      customerId,
      subscriptionId,
    });
    return;
  }

  if (overdueStatuses.has(status)) {
    await markCompanyOverdue({
      row: company,
      overdueAtIso: new Date().toISOString(),
      customerId,
      subscriptionId,
    });
  }
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      return;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return;

    case "customer.subscription.deleted":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return;

    default:
      return;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Metodo nao permitido." });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return jsonResponse(500, { error: "STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET nao configuradas." });
  }

  if (!supabaseAdmin) {
    return jsonResponse(500, { error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao configurados." });
  }

  try {
    const signature = req.headers.get("stripe-signature") || "";
    if (!signature) {
      return jsonResponse(400, { error: "Cabecalho stripe-signature ausente." });
    }

    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);

    await handleStripeEvent(event);

    return jsonResponse(200, {
      ok: true,
      received: true,
      event_type: event.type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return jsonResponse(400, { error: message });
  }
});
