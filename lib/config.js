const config = {
  rootDomain: process.env.ROOT_DOMAIN || 'fastdev.my.id',
  jwtSecret: process.env.JWT_SECRET,
  initSecret: process.env.INIT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  planLimits: { free: 3, pro: 25, enterprise: 200 },
  subdomainRegex: /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
  maxFiles: 50,
  maxTotalSize: 3 * 1024 * 1024,
  reservedSubdomains: [
    'www', 'api', 'admin', 'app', 'dashboard',
    'mail', 'smtp', 'ftp', 'ssh', 'cdn', 'static',
    'assets', 'img', 'images', 'docs', 'status',
    'login', 'register', 'signup', 'auth', 'account',
    'billing', 'support', 'help', 'about', 'blog'
  ]
};

if (!config.jwtSecret) throw new Error('JWT_SECRET wajib di-set di Vercel env');
if (!config.databaseUrl) throw new Error('DATABASE_URL wajib di-set di Vercel env');

export default config;
export const {
  rootDomain,
  jwtSecret,
  initSecret,
  databaseUrl,
  blobToken,
  planLimits,
  subdomainRegex,
  maxFiles,
  maxTotalSize,
  reservedSubdomains
} = config;