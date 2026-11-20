/**
 * Cloudflare Turnstile en el formulario de contacto (HU-410), solo si hay llave: este archivo es
 * un chunk aparte. El widget agrega al formulario el campo `cf-turnstile-response`, que el
 * formulario manda como `turnstile`.
 */
export function renderTurnstile(llave: string): void {
  const contenedor = document.getElementById('sit-turnstile');
  if (!contenedor) return;
  contenedor.className = 'cf-turnstile';
  contenedor.dataset['sitekey'] = llave;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  script.async = true;
  document.head.appendChild(script);
}
