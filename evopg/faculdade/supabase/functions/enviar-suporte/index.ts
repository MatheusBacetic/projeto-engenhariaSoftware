import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPPORT_TO_EMAIL = (Deno.env.get("SUPPORT_TO_EMAIL") ?? "evopgsuporte@gmail.com").trim();
const SUPPORT_FROM_EMAIL = (Deno.env.get("SUPPORT_FROM_EMAIL") ?? "EvoPG Suporte <onboarding@resend.dev>").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, unknown>;

type SupportPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  company?: unknown; // Honeypot field.
  pageUrl?: unknown;
  userAgent?: unknown;
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

function limit(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isLikelyEmail(email: string): boolean {
  if (!email || email.length > 160) return false;
  if (email.includes(" ")) return false;

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return false;

  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < domain.length - 1;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return limit(first, 80);
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return limit(realIp, 80);

  return "";
}

async function sendSupportEmail(input: {
  name: string;
  email: string;
  message: string;
  pageUrl: string;
  userAgent: string;
  ip: string;
  sentAtIso: string;
}): Promise<string> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY nao configurada.");
  }

  const subject = `Suporte EvoPG - ${limit(input.name, 80)}`;

  const text = [
    "Nova mensagem de suporte enviada pelo site.",
    "",
    `Nome: ${input.name}`,
    `Email: ${input.email}`,
    `Pagina: ${input.pageUrl || "nao informada"}`,
    `IP: ${input.ip || "nao informado"}`,
    `Navegador: ${input.userAgent || "nao informado"}`,
    `Enviado em: ${input.sentAtIso}`,
    "",
    "Mensagem:",
    input.message,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">Nova mensagem de suporte</h2>
      <p><strong>Nome:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p><strong>Pagina:</strong> ${escapeHtml(input.pageUrl || "nao informada")}</p>
      <p><strong>IP:</strong> ${escapeHtml(input.ip || "nao informado")}</p>
      <p><strong>Navegador:</strong> ${escapeHtml(input.userAgent || "nao informado")}</p>
      <p><strong>Enviado em:</strong> ${escapeHtml(input.sentAtIso)}</p>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0" />
      <p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SUPPORT_FROM_EMAIL,
      to: [SUPPORT_TO_EMAIL],
      subject,
      reply_to: input.email,
      text,
      html,
    }),
  });

  const data = await response.json().catch(() => ({})) as JsonObject;

  if (!response.ok) {
    const errorMessage = toText(data.error) || toText(data.message) || `Falha no envio (status ${response.status}).`;
    throw new Error(errorMessage);
  }

  return toText(data.id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const payload = await req.json() as SupportPayload;

    const name = limit(toText(payload.name), 80);
    const email = limit(toText(payload.email).toLowerCase(), 160);
    const message = limit(toText(payload.message), 2000);
    const company = toText(payload.company); // Honeypot.
    const pageUrl = limit(toText(payload.pageUrl), 400);
    const userAgent = limit(toText(payload.userAgent), 240);

    if (company) {
      return jsonResponse(200, { ok: true });
    }

    if (name.length < 2) {
      return jsonResponse(400, { ok: false, error: "Informe seu nome." });
    }

    if (!isLikelyEmail(email)) {
      return jsonResponse(400, { ok: false, error: "Informe um email valido." });
    }

    if (message.length < 10) {
      return jsonResponse(400, { ok: false, error: "Escreva uma mensagem com pelo menos 10 caracteres." });
    }

    const sentAtIso = new Date().toISOString();
    const id = await sendSupportEmail({
      name,
      email,
      message,
      pageUrl,
      userAgent,
      ip: getClientIp(req),
      sentAtIso,
    });

    return jsonResponse(200, { ok: true, id: id || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno ao enviar suporte.";
    console.error("[enviar-suporte]", message);
    return jsonResponse(500, { ok: false, error: "Nao foi possivel enviar a mensagem agora." });
  }
});
