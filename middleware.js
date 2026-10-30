import { rewrite, next } from '@vercel/edge';

export const config = {
  matcher: '/((?!api/).*)',
};

const ROOT_DOMAIN = 'fastdev.my.id';

export default function middleware(req) {
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0];
  const url = new URL(req.url);

  if (
    host === ROOT_DOMAIN ||
    host === `www.${ROOT_DOMAIN}` ||
    host.endsWith('.vercel.app') ||
    !host.endsWith('.' + ROOT_DOMAIN)
  ) {
    return next();
  }

  const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || sub === 'www' || sub === 'api') return next();

  const rewriteUrl = new URL('/api/render', url.origin);
  rewriteUrl.searchParams.set('sub', sub);
  rewriteUrl.searchParams.set('path', url.pathname);

  return rewrite(rewriteUrl);
}