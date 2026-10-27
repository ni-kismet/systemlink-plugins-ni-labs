const API_KEY = process.env['SYSTEMLINK_API_KEY'];
const TARGET_URL = process.env['SYSTEMLINK_TARGET_URL'];

if (!API_KEY || !TARGET_URL) {
  throw new Error(
    'Missing required environment variables: SYSTEMLINK_API_KEY and SYSTEMLINK_TARGET_URL. Copy .env.example to .env and fill in the values.',
  );
}

export default [
  {
    context: [
      '/niauth',
      '/nidynamicformfields',
      '/nitestmonitor',
      '/niuser',
      '/niuserdata',
      '/niworkitem',
      '/nifile',
      '/nisysmgmt',
      '/niapm',
      '/nilocation',
      '/dashboardhost',
    ],
    target: TARGET_URL,
    secure: true,
    changeOrigin: true,
    logLevel: 'debug',
    headers: {
      'x-ni-api-key': API_KEY,
    },
  },
];
