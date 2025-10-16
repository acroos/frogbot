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

/**
 * Validates that all required configuration values are present
 * @throws {Error} If any required config is missing or has default placeholder values
 */
function validateConfig() {
  const requiredFields = [
    { key: 'appId', envVar: 'APP_ID' },
    { key: 'publicKey', envVar: 'PUBLIC_KEY' },
    { key: 'discordToken', envVar: 'DISCORD_TOKEN' },
    { key: 'friendsOfRiskApiKey', envVar: 'FRIENDS_OF_RISK_API_KEY' },
  ]

  const errors = []

  for (const field of requiredFields) {
    const value = CONFIG[field.key]
    
    // Check if value is missing or is a placeholder
    if (!value || value.startsWith('your-')) {
      errors.push(`${field.envVar} is not set or is using a placeholder value`)
    }
  }

  if (errors.length > 0) {
    const errorMessage = [
      'Configuration validation failed:',
      ...errors.map(err => `  - ${err}`),
      '\nPlease set the required environment variables before starting the application.',
    ].join('\n')
    
    throw new Error(errorMessage)
  }

  console.log('✓ Configuration validated successfully')
}

// Validate configuration on module load
validateConfig()

export default CONFIG