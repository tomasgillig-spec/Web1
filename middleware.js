export const config = {
  matcher: '/:path*',
};

function checkCredentials(req, expectedUser, expectedPass) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  const encoded = authHeader.slice(6);
  let decoded = '';
  try {
    decoded = atob(encoded);
  } catch (e) {
    return false;
  }
  const sepIndex = decoded.indexOf(':');
  const user = sepIndex >= 0 ? decoded.slice(0, sepIndex) : '';
  const pass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : '';
  return user === expectedUser && pass === expectedPass;
}

function unauthorized(realm) {
  return new Response('Autenticación requerida', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"` },
  });
}

export default function middleware(req) {
  const { pathname } = new URL(req.url);
  const isClientRoute = pathname === '/cliente' || pathname.startsWith('/cliente') ||
                         pathname === '/api/client-data';

  if (isClientRoute) {
    const user = process.env.CLIENT_USER;
    const pass = process.env.CLIENT_PASS;
    if (!user || !pass) {
      return new Response('La vista del cliente todavía no tiene usuario/contraseña configurados.', { status: 503 });
    }
    if (checkCredentials(req, user, pass)) return;
    return unauthorized('UADEL Dashboard — Cliente');
  }

  // Everything else (internal dashboard, /api/data, /api/publish-snapshot, static assets)
  const user = process.env.DASH_USER;
  const pass = process.env.DASH_PASS;
  if (!user || !pass) {
    return new Response('El tablero no tiene usuario/contraseña configurados todavía.', { status: 503 });
  }
  if (checkCredentials(req, user, pass)) return;
  return unauthorized('UADEL Dashboard');
}
