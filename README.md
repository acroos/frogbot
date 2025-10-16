# frogbot

A Discord bot for doing frog stuff

This application is built with Next.js and can be deployed on Vercel.

## Development

```bash
npm install
npm run dev
```

The development server will start at http://localhost:3000

## Building

```bash
npm run build
npm start
```

## Deployment to Vercel

This application is configured to deploy to Vercel with the following features:

- **API Routes**: Discord interaction endpoints are handled via Next.js API routes
- **Cron Jobs**: Scheduled tasks are configured in `vercel.json` to run periodically
  - `/api/cron/finalize` - Runs every 2 minutes to finalize games and close settings
  - `/api/cron/cleanup` - Runs every 10 minutes to clean up old games

### Environment Variables

The following environment variables need to be configured in Vercel:

- `APP_ID` - Discord application ID
- `PUBLIC_KEY` - Discord public key for request verification
- `DISCORD_TOKEN` - Discord bot token
- `FRIENDS_OF_RISK_API_BASE_URL` - Friends of Risk API base URL
- `FRIENDS_OF_RISK_API_KEY` - Friends of Risk API key
- `REDIS_HOST` - Redis host URL
- `REDIS_USE_TLS` - Set to `true` for TLS connections to Redis
- `CRON_SECRET` - Secret token to protect cron endpoints (optional but recommended)

### Deploying

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` to deploy
3. Configure environment variables in the Vercel dashboard
4. The application will be deployed and available at your Vercel URL

## Register Discord Commands

After deploying, register the Discord slash commands:

```bash
npm run register
```

## Project Structure

- `/app` - Next.js app directory with routes and API endpoints
  - `/app/api/health` - Health check endpoint
  - `/app/api/interactions` - Discord interaction handler
  - `/app/api/cron/*` - Scheduled task endpoints
- `/src` - Original application logic (commands, utilities, config)
