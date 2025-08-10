import 'dotenv/config'

const CONFIG = {
  port: process.env.PORT || 3000, // Default port for the app
  appId: process.env.APP_ID || 'your-app-id', // Your Discord application ID
  publicKey: process.env.PUBLIC_KEY || 'your-public-key', // Your Discord public key
  discordToken: process.env.DISCORD_TOKEN || 'your-discord-token', // Your Discord bot token
  loungeChannelId: process.env.LOUNGE_CHANNEL_ID || '1400631040065671169', // Discord Channel ID for the Risk Competitive Lounge
  loungeRoleId: process.env.LOUNGE_ROLE_ID || '1401448826375508009', // Discord Role ID for the Risk Competitive Lounge
  friendsOfRiskApiBaseUrl: process.env.FRIENDS_OF_RISK_API_BASE_URL || 'https://friendsofrisk.com/api', // Base URL for Friends of Risk API
  friendsOfRiskApiKey: process.env.FRIENDS_OF_RISK_API_KEY || 'your-friends-of-risk-api-key', // API key for Friends of Risk
  redisHost: process.env.REDIS_HOST || 'redis',
  redisUseTLS: process.env.REDIS_USE_TLS || false
}

export default CONFIG