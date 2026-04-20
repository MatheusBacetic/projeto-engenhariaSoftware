import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

type JsonMap = Record<string, unknown>;

type OAuthEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl: string;
  apiBaseUrl: string;
  stateSecret: string;
  stateTtlMs: number;
  webhookSecretDefault: string | null;
  allowedRedirectOrigins: string[];
};

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function jsonResponse(status: number, payload: JsonMap): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function htmlResponse(status: number, html: string): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function toBase64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const bin = atob(normalized + padding);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function makeNonce(size = 12): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function maskToken(token: string | null): string {
  const raw = asString(token);
  if (!raw) return "nao_configurado";
  if (raw.length <= 12) return `${raw.slice(0, 4)}...`;
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAllowedOrigins(value: string): string[] {
  return value
    .split(",")
    .map((v) => asString(v))
    .filter(Boolean)
    .map((v) => {
      try {
        return new URL(v).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function normalizeRedirectTo(raw: string, allowedOrigins: string[]): string | null {
  const text = asString(raw);
  if (!text) return null;
  try {
    const u = new URL(text);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(u.origin)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function appendQueryParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => {
    if (!asString(v)) return;
    u.searchParams.set(k, v);
  });
  return u.toString();
}

function parseEnv(req: Request): OAuthEnv {
  const supabaseUrl = asString(Deno.env.get("SUPABASE_URL"));
  const supabaseAnonKey = asString(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = asString(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const clientId = asString(
    Deno.env.get("MP_OAUTH_CLIENT_ID")
      || Deno.env.get("MERCADOPAGO_CLIENT_ID")
      || Deno.env.get("MERCADO_PAGO_CLIENT_ID"),
  );
  const clientSecret = asString(
    Deno.env.get("MP_OAUTH_CLIENT_SECRET")
      || Deno.env.get("MERCADOPAGO_CLIENT_SECRET")
      || Deno.env.get("MERCADO_PAGO_CLIENT_SECRET"),
  );
  const redirectUri = asString(Deno.env.get("MP_OAUTH_REDIRECT_URI"))
    || `${normalizeBaseUrl(supabaseUrl)}/functions/v1/mp-oauth`;
  const authBaseUrl = asString(Deno.env.get("MP_OAUTH_AUTH_BASE_URL")) || "https://auth.mercadopago.com.br";
  const apiBaseUrl = asString(Deno.env.get("MP_OAUTH_API_BASE_URL")) || "https://api.mercadopago.com";
  const stateSecret = asString(Deno.env.get("MP_OAUTH_STATE_SECRET")) || serviceRoleKey;
  const stateTtlSeconds = Math.max(60, Math.min(3600, Math.trunc(asNumber(Deno.env.get("MP_OAUTH_STATE_TTL_SEC") || 900))));
  const webhookSecretDefault = asString(Deno.env.get("MP_WEBHOOK_SECRET")) || null;
  const allowedRedirectOrigins = normalizeAllowedOrigins(asString(Deno.env.get("MP_OAUTH_ALLOWED_REDIRECT_ORIGINS")));

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error("Ambiente Supabase nao configurado");
  }
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais OAuth do Mercado Pago nao configuradas");
  }
  if (!stateSecret) {
    throw new Error("Segredo de state OAuth nao configurado");
  }

  // If caller passes redirect_to without allowlist, restrict to callback origin.
  if (allowedRedirectOrigins.length === 0) {
    try {
      allowedRedirectOrigins.push(new URL(redirectUri).origin);
    } catch {
      allowedRedirectOrigins.push(new URL(req.url).origin);
    }
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    clientId,
    clientSecret,
    redirectUri,
    authBaseUrl: normalizeBaseUrl(authBaseUrl),
    apiBaseUrl: normalizeBaseUrl(apiBaseUrl),
    stateSecret,
    stateTtlMs: stateTtlSeconds * 1000,
    webhookSecretDefault,
    allowedRedirectOrigins,
  };
}

async function parseBody(req: Request): Promise<JsonMap> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? data as JsonMap : {};
  } catch {
    return {};
  }
}

async function createSignedState(payload: JsonMap, secret: string): Promise<string> {
  const payloadRaw = JSON.stringify(payload);
  const payloadB64 = toBase64Url(payloadRaw);
  const signature = await hmacHex(secret, payloadB64);
  return `${payloadB64}.${signature}`;
}

async function readSignedState(token: string, secret: string): Promise<JsonMap> {
  const raw = asString(token);
  const [payloadPart, signaturePart] = raw.split(".");
  if (!payloadPart || !signaturePart) throw new Error("state_invalido");

  const expected = await hmacHex(secret, payloadPart);
  if (!timingSafeEqual(expected, signaturePart)) throw new Error("state_assinatura_invalida");

  const bytes = fromBase64Url(payloadPart);
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object") throw new Error("state_payload_invalido");
  return parsed as JsonMap;
}

async function getAuthenticatedContext(req: Request, env: OAuthEnv): Promise<{
  userClient: ReturnType<typeof createClient>;
  adminClient: ReturnType<typeof createClient>;
  user: { id: string; email: string | null };
  companyId: string;
}> {
  const authHeader = asString(req.headers.get("Authorization"));
  if (!authHeader) throw new Error("Authorization ausente");

  const userClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    throw new Error("Usuario nao autenticado");
  }

  const user = {
    id: String(userData.user.id),
    email: userData.user.email ? String(userData.user.email) : null,
  };

  let companyId = "";
  if (user.email) {
    const { data: colab } = await adminClient
      .from("colaboradores")
      .select("company_id")
      .eq("email", user.email)
      .maybeSingle();
    if (colab?.company_id) companyId = String(colab.company_id);
  }

  if (!companyId) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id) companyId = String(profile.company_id);
  }

  if (!companyId) throw new Error("Empresa nao identificada para o usuario");
  return { userClient, adminClient, user, companyId };
}

async function mpExchangeAuthorizationCode(env: OAuthEnv, code: string): Promise<JsonMap> {
  const response = await fetch(`${env.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      redirect_uri: env.redirectUri,
    }),
  });

  const text = await response.text();
  let payload: JsonMap = {};
  try {
    payload = text ? JSON.parse(text) as JsonMap : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = asString(payload.message || payload.error_description || text || `HTTP ${response.status}`);
    throw new Error(`Erro OAuth MP (${response.status}): ${message}`);
  }
  return payload;
}

async function mpFetchUser(env: OAuthEnv, accessToken: string): Promise<JsonMap | null> {
  const response = await fetch(`${env.apiBaseUrl}/users/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  try {
    return await response.json() as JsonMap;
  } catch {
    return null;
  }
}

function computeTokenExpiresAt(expiresIn: unknown): string | null {
  const sec = Math.trunc(asNumber(expiresIn));
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Date(Date.now() + (sec * 1000)).toISOString();
}

function callbackPage(success: boolean, title: string, message: string): string {
  const titleEsc = escapeHtml(title);
  const messageEsc = escapeHtml(message);
  const tone = success ? "#10b981" : "#ef4444";
  const buttonBg = success ? "#0ea5e9" : "#334155";
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${titleEsc}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#0f172a}
    .card{max-width:560px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;box-shadow:0 14px 30px rgba(2,6,23,.08)}
    .dot{width:12px;height:12px;border-radius:999px;background:${tone};display:inline-block;margin-right:8px}
    h1{font-size:20px;margin:0 0 12px}
    p{font-size:14px;line-height:1.5;color:#334155}
    .hint{margin-top:16px;font-size:12px;color:#64748b}
    button{margin-top:20px;height:40px;padding:0 14px;border:0;border-radius:10px;background:${buttonBg};color:#fff;font-weight:700;cursor:pointer}
  </style>
</head>
<body>
  <div class="card">
    <h1><span class="dot"></span>${titleEsc}</h1>
    <p>${messageEsc}</p>
    <p class="hint">Pode fechar esta janela e voltar para o sistema.</p>
    <button onclick="window.close()">Fechar</button>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let env: OAuthEnv;
  try {
    env = parseEnv(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { ok: false, error: message });
  }

  // OAuth callback (Mercado Pago redirects with query string).
  if (req.method === "GET" && (new URL(req.url).searchParams.has("code") || new URL(req.url).searchParams.has("error"))) {
    const params = new URL(req.url).searchParams;
    const stateRaw = asString(params.get("state"));
    const code = asString(params.get("code"));
    const oauthError = asString(params.get("error") || params.get("error_reason") || params.get("error_description"));

    let redirectTo: string | null = null;
    try {
      if (!stateRaw) throw new Error("State ausente no callback");
      const state = await readSignedState(stateRaw, env.stateSecret);
      const ts = asNumber(state.ts);
      if (!ts || Math.abs(Date.now() - ts) > env.stateTtlMs) {
        throw new Error("State expirado. Inicie a conexao novamente.");
      }
      redirectTo = normalizeRedirectTo(asString(state.redirect_to), env.allowedRedirectOrigins);

      if (oauthError) throw new Error(`Mercado Pago recusou a conexao: ${oauthError}`);
      if (!code) throw new Error("Codigo OAuth ausente no callback");

      const tokenPayload = await mpExchangeAuthorizationCode(env, code);
      const accessToken = asString(tokenPayload.access_token);
      const refreshToken = asString(tokenPayload.refresh_token) || null;
      const userId = asString(tokenPayload.user_id);
      const expiresAt = computeTokenExpiresAt(tokenPayload.expires_in);
      if (!accessToken) throw new Error("Mercado Pago nao retornou access_token");

      const companyId = asString(state.company_id);
      if (!companyId) throw new Error("State sem company_id");

      const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey);
      const mpUser = await mpFetchUser(env, accessToken);
      const nickname = asString(mpUser?.nickname);
      const email = asString(mpUser?.email);
      const contaNome = nickname || email || (userId ? `Conta ${userId}` : "Conta principal");

      const { data: existente } = await adminClient
        .from("integracoes_empresa")
        .select("id, config, webhook_secret")
        .eq("company_id", companyId)
        .eq("provider", "mercado_pago")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      const configAtual = (existente?.config && typeof existente.config === "object")
        ? (existente.config as JsonMap)
        : {};
      const configMerge: JsonMap = {
        ...configAtual,
        ambiente: "producao",
        oauth: true,
        oauth_connected_at: nowIso(),
        oauth_scope: asString(tokenPayload.scope),
        oauth_live_mode: tokenPayload.live_mode === true,
        collector_id: userId || asString(configAtual.collector_id),
        collector_nickname: nickname || asString(configAtual.collector_nickname),
        collector_email: email || asString(configAtual.collector_email),
        public_key: asString(tokenPayload.public_key) || asString(configAtual.public_key),
      };

      let integracaoId = 0;
      if (existente?.id) {
        const webhookSecret = asString(existente.webhook_secret) || env.webhookSecretDefault;
        const { data: updated, error: updateError } = await adminClient
          .from("integracoes_empresa")
          .update({
            status: "Ativa",
            conta_nome: contaNome,
            webhook_secret: webhookSecret || null,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expira_em: expiresAt,
            config: configMerge,
          })
          .eq("id", existente.id)
          .eq("company_id", companyId)
          .eq("provider", "mercado_pago")
          .select("id")
          .single();
        if (updateError || !updated?.id) {
          throw new Error(`Falha ao atualizar integracao: ${updateError?.message || "desconhecido"}`);
        }
        integracaoId = Number(updated.id);
      } else {
        const { data: inserted, error: insertError } = await adminClient
          .from("integracoes_empresa")
          .insert({
            company_id: companyId,
            provider: "mercado_pago",
            status: "Ativa",
            conta_nome: contaNome,
            webhook_secret: env.webhookSecretDefault,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expira_em: expiresAt,
            config: configMerge,
          })
          .select("id")
          .single();
        if (insertError || !inserted?.id) {
          throw new Error(`Falha ao inserir integracao: ${insertError?.message || "desconhecido"}`);
        }
        integracaoId = Number(inserted.id);
      }

      await adminClient
        .from("integracoes_empresa")
        .update({ status: "Inativa" })
        .eq("company_id", companyId)
        .eq("provider", "mercado_pago")
        .eq("status", "Ativa")
        .neq("id", integracaoId);

      await adminClient.from("integracoes_eventos").insert({
        company_id: companyId,
        integracao_id: integracaoId,
        provider: "mercado_pago",
        direcao: "saida",
        evento_tipo: "oauth_connect",
        evento_id_externo: userId || null,
        payload: {
          oauth: {
            user_id: userId || null,
            scope: asString(tokenPayload.scope) || null,
            live_mode: tokenPayload.live_mode === true,
            expires_in: asNumber(tokenPayload.expires_in),
          },
          conta_nome: contaNome,
        },
        processado: true,
        erro: null,
      });

      if (redirectTo) {
        const target = appendQueryParams(redirectTo, {
          mp_oauth: "success",
          provider: "mercado_pago",
          integration_id: String(integracaoId),
        });
        return Response.redirect(target, 302);
      }

      return htmlResponse(200, callbackPage(true, "Mercado Pago conectado", "A conta foi conectada com sucesso."));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (redirectTo) {
        const target = appendQueryParams(redirectTo, {
          mp_oauth: "error",
          provider: "mercado_pago",
          error: message.slice(0, 300),
        });
        return Response.redirect(target, 302);
      }
      return htmlResponse(400, callbackPage(false, "Falha na conexao", message));
    }
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido" });
  }

  try {
    const body = await parseBody(req);
    const action = asString(body.action || "status").toLowerCase();
    const ctx = await getAuthenticatedContext(req, env);

    if (action === "start") {
      const redirectTo = normalizeRedirectTo(asString(body.redirect_to), env.allowedRedirectOrigins);
      const state = await createSignedState({
        provider: "mercado_pago",
        company_id: ctx.companyId,
        user_id: ctx.user.id,
        ts: Date.now(),
        nonce: makeNonce(),
        redirect_to: redirectTo,
      }, env.stateSecret);

      const authUrl = `${env.authBaseUrl}/authorization?${new URLSearchParams({
        client_id: env.clientId,
        response_type: "code",
        platform_id: "mp",
        state,
        redirect_uri: env.redirectUri,
      }).toString()}`;

      return jsonResponse(200, {
        ok: true,
        action: "start",
        auth_url: authUrl,
        redirect_uri: env.redirectUri,
      });
    }

    if (action === "status") {
      const { data, error } = await ctx.adminClient
        .from("integracoes_empresa")
        .select("id, status, conta_nome, access_token, token_expira_em, config, updated_at")
        .eq("company_id", ctx.companyId)
        .eq("provider", "mercado_pago")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return jsonResponse(500, { ok: false, error: error.message || "Falha ao consultar integracao" });
      }

      const connected = !!data?.id && asString(data.access_token) !== "" && asString(data.status).toLowerCase() === "ativa";
      return jsonResponse(200, {
        ok: true,
        action: "status",
        connected,
        integration: data
          ? {
            id: data.id,
            status: data.status,
            conta_nome: data.conta_nome,
            token_expira_em: data.token_expira_em,
            updated_at: data.updated_at,
            token_mask: maskToken(data.access_token),
            config: data.config || {},
          }
          : null,
      });
    }

    if (action === "disconnect") {
      const { data: row, error: fetchError } = await ctx.adminClient
        .from("integracoes_empresa")
        .select("id, config")
        .eq("company_id", ctx.companyId)
        .eq("provider", "mercado_pago")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        return jsonResponse(500, { ok: false, error: fetchError.message || "Falha ao carregar integracao" });
      }

      if (!row?.id) {
        return jsonResponse(200, { ok: true, action: "disconnect", disconnected: false, reason: "not_found" });
      }

      const cfg = (row.config && typeof row.config === "object") ? row.config as JsonMap : {};
      const cfgNext = {
        ...cfg,
        oauth: false,
        oauth_disconnected_at: nowIso(),
      };

      const { error: updError } = await ctx.adminClient
        .from("integracoes_empresa")
        .update({
          status: "Inativa",
          access_token: null,
          refresh_token: null,
          token_expira_em: null,
          config: cfgNext,
        })
        .eq("id", row.id)
        .eq("company_id", ctx.companyId)
        .eq("provider", "mercado_pago");

      if (updError) {
        return jsonResponse(500, { ok: false, error: updError.message || "Falha ao desconectar integracao" });
      }

      await ctx.adminClient.from("integracoes_eventos").insert({
        company_id: ctx.companyId,
        integracao_id: row.id,
        provider: "mercado_pago",
        direcao: "saida",
        evento_tipo: "oauth_disconnect",
        payload: {
          disconnected_at: nowIso(),
          actor_user_id: ctx.user.id,
        },
        processado: true,
      });

      return jsonResponse(200, { ok: true, action: "disconnect", disconnected: true, integration_id: row.id });
    }

    return jsonResponse(400, { ok: false, error: "Acao invalida. Use: start, status ou disconnect." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(401, { ok: false, error: message });
  }
});
