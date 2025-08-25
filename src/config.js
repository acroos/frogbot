import 'dotenv/config'

const CONFIG = {
  port: process.env.PORT || 3000, // Default port for the app
  appId: process.env.APP_ID || 'your-app-id', // Your Discord application ID
  publicKey: process.env.PUBLIC_KEY || 'your-public-key', // Your Discord public key
  discordToken: process.env.DISCORD_TOKEN || 'your-discord-token', // Your Discord bot token
  loungeChannelId: {
    // Main
    '465846009164070912': '1408117493251182713',
    // FrogBot test
    '1401765937241395273': '1401765962679844926',
  },
  loungeRoleId: {
    // Main
    '465846009164070912': '1408116717627904020',
    // FrogBot test
    '1401765937241395273': '1401766016836571137',
  },
  friendsOfRiskApiBaseUrl: process.env.FRIENDS_OF_RISK_API_BASE_URL || 'https://friendsofrisk.com/api', // Base URL for Friends of Risk API
  friendsOfRiskApiKey: process.env.FRIENDS_OF_RISK_API_KEY || 'your-friends-of-risk-api-key', // API key for Friends of Risk
  redisHost: process.env.REDIS_HOST || 'redis',
  redisUseTLS: process.env.REDIS_USE_TLS || false
}

export default CONFIG