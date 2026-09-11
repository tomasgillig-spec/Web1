export const config = {
  matcher: '/:path*',
};

export default function middleware(req) {
  const expectedUser = process.env.DASH_USER;
  const expectedPass = process.env.DASH_PASS;

  // If no credentials are configured, fail closed (block access) rather than
  // silently leaving the dashboard open.
  if (!expectedUser || !expectedPass) {
    return new Response('El tablero no tiene usuario/contraseña configurados todavía.', {
      status: 503,
    });
  }

  const authHeader = req.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice(6);
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const sepIndex = decoded.indexOf(':');
    const user = sepIndex >= 0 ? decoded.slice(0, sepIndex) : '';
    const pass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : '';

    if (user === expectedUser && pass === expectedPass) {
      return; // credentials OK, let the request through
    }
  }

  return new Response('Autenticación requerida', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="UADEL Dashboard", charset="UTF-8"',
    },
  });
}
