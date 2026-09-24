/**
 * Fase P: wrapper de email con la identidad de marca real (manual "Vida
 * Solidaria Mardel" v1.0, recibido 22/09/2026 — mismos tokens que
 * apps/web/public/brand/brand-tokens.json: violeta institucional, amarillo
 * para la acción/CTA, papel de fondo, tinta para texto de lectura — nunca
 * negro puro). Pensado para reusarse en CUALQUIER email transaccional que
 * quiera verse "de marca" (no solo el de confirmación de asistencia), por
 * eso vive en `lib/`, no en `modules/field-ops/`.
 *
 * Datos de contacto reales (dados por Josecito el 24/09/2026): el logo
 * sale de gestion.vidasolidariamdp.com porque ahí lo sirve Next como
 * archivo estático público, con URL absoluta (los clientes de email no
 * pueden resolver rutas relativas).
 */
const BRAND = {
  violeta: "#73038C",
  amarillo: "#FDED03",
  azul: "#013681",
  papel: "#F7F4F8",
  tinta: "#2A1030",
  logoUrl: "https://gestion.vidasolidariamdp.com/brand/logo.png",
  siteUrl: "https://vidasolidariamdp.com",
  instagramHandle: "vidasolidaria.mardelplata",
  instagramUrl: "https://instagram.com/vidasolidaria.mardelplata",
  contactEmail: "hola@vidasolidariamdp.com",
  contactPhone: "+54 9 2235 06-9269",
  slogan: "Tu esfuerzo, nuestro motor",
}

/** Botón de acción (CTA) — amarillo institucional, texto tinta, según
 * regla del manual ("amarillo para acción"). */
export function brandButton(text: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background:${BRAND.amarillo}; border-radius: 8px;">
          <a href="${href}" style="display:inline-block; padding: 14px 28px; font-family: 'Work Sans', system-ui, sans-serif; font-weight: 700; font-size: 15px; color:${BRAND.tinta}; text-decoration:none;">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `
}

/** Envuelve el contenido (ya armado en HTML) con header (logo) + footer
 * (redes, contacto, slogan) de marca. `preheader` es el texto corto que
 * algunos clientes de mail muestran como preview antes de abrir. */
export function brandEmailWrapper(innerHtml: string, preheader?: string): string {
  return `
  <div style="background:${BRAND.papel}; padding: 32px 16px; font-family: 'Work Sans', system-ui, sans-serif; color:${BRAND.tinta};">
    ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>` : ""}
    <div style="max-width: 520px; margin: 0 auto; background:#ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #ece6ee;">
      <div style="background:${BRAND.violeta}; padding: 20px 24px; text-align:center;">
        <img src="${BRAND.logoUrl}" alt="Vida Solidaria" height="40" style="height:40px; display:inline-block;" />
      </div>
      <div style="padding: 28px 24px;">
        ${innerHtml}
      </div>
      <div style="background:${BRAND.papel}; padding: 20px 24px; text-align:center; border-top: 1px solid #ece6ee;">
        <p style="margin: 0 0 8px; font-size: 13px; color:${BRAND.violeta}; font-weight: 600;">${BRAND.slogan}</p>
        <p style="margin: 0 0 4px; font-size: 12px; color:${BRAND.tinta}; opacity: 0.75;">
          <a href="${BRAND.instagramUrl}" style="color:${BRAND.violeta}; text-decoration:none;">@${BRAND.instagramHandle}</a>
          &nbsp;·&nbsp;
          <a href="mailto:${BRAND.contactEmail}" style="color:${BRAND.violeta}; text-decoration:none;">${BRAND.contactEmail}</a>
          &nbsp;·&nbsp;
          ${BRAND.contactPhone}
        </p>
        <p style="margin: 0; font-size: 11px; color:${BRAND.tinta}; opacity: 0.5;">
          <a href="${BRAND.siteUrl}" style="color: inherit; text-decoration:none;">${BRAND.siteUrl.replace("https://", "")}</a>
        </p>
      </div>
    </div>
  </div>
  `
}
