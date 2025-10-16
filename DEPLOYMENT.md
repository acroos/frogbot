# Deployment Guide for Frogbot on Vercel

This guide will help you deploy the Frogbot application to Vercel.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- Discord bot application configured
- Redis database (e.g., Upstash Redis or Redis Labs)
- Friends of Risk API access

## Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

## Step 2: Login to Vercel

```bash
vercel login
```

## Step 3: Deploy the Application

From the project root directory:

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N** (first time) or **Y** (subsequent deployments)
- What's your project's name? **frogbot** (or your preferred name)
- In which directory is your code located? **./**
- Want to override the settings? **N**

## Step 4: Configure Environment Variables

Go to your Vercel dashboard (https://vercel.com/dashboard) and navigate to your project settings:

1. Go to **Settings** > **Environment Variables**
2. Add the following variables:

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_ID` | Discord application ID | `123456789012345678` |
| `PUBLIC_KEY` | Discord public key | `abcdef1234567890...` |
| `DISCORD_TOKEN` | Discord bot token | `MTIzNDU2Nzg5MDEyMzQ1Njc4.GhIjKl.MnOpQrStUvWxYz...` |
| `FRIENDS_OF_RISK_API_BASE_URL` | Friends of Risk API URL | `https://friendsofrisk.com/api` |
| `FRIENDS_OF_RISK_API_KEY` | Friends of Risk API key | `your-api-key-here` |
| `REDIS_HOST` | Redis host URL | `redis-12345.upstash.io` |
| `REDIS_USE_TLS` | Use TLS for Redis | `true` |
| `CRON_SECRET` | Secret for cron endpoints | Generate a random string |

### Generate CRON_SECRET

```bash
# On macOS/Linux
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Step 5: Register Discord Commands

After deployment, register the Discord slash commands:

```bash
# Set environment variables locally (create .env file)
cp .env.example .env
# Edit .env with your values

# Register commands
npm run register
```

## Step 6: Configure Discord Webhook

1. Go to your Discord Developer Portal (https://discord.com/developers/applications)
2. Select your application
3. Go to **General Information** > **Interactions Endpoint URL**
4. Set it to: `https://your-vercel-domain.vercel.app/api/interactions`
5. Discord will verify the endpoint automatically

## Step 7: Verify Deployment

### Check Health Endpoint
```bash
curl https://your-vercel-domain.vercel.app/api/health
```

Should return: `ok`

### Check Homepage
Visit: `https://your-vercel-domain.vercel.app/`

You should see the Frogbot homepage.

### Check Cron Jobs

In Vercel dashboard:
1. Go to your project
2. Navigate to **Deployments** > **Functions**
3. You should see the cron jobs listed:
   - `/api/cron/finalize` (runs every 2 minutes)
   - `/api/cron/cleanup` (runs every 10 minutes)

## Troubleshooting

### Redis Connection Issues

If you see Redis connection errors:
1. Verify `REDIS_HOST` is correct
2. Ensure `REDIS_USE_TLS` is set to `true` if using a TLS-enabled Redis
3. Check that your Redis instance allows connections from Vercel's IP ranges

### Discord Verification Fails

If Discord can't verify your interactions endpoint:
1. Check that `PUBLIC_KEY` environment variable matches your Discord app's public key
2. Ensure the endpoint URL in Discord matches your Vercel deployment URL
3. Check Vercel function logs for any errors

### Cron Jobs Not Running

1. Verify `vercel.json` is in the project root
2. Check that cron jobs are enabled in your Vercel plan (some plans have limits)
3. Ensure `CRON_SECRET` is set if you're using authentication

## Monitoring

### View Logs

```bash
vercel logs
```

Or view them in the Vercel dashboard under **Deployments** > **Functions** > Select a function > **Logs**

### Check Function Invocations

In Vercel dashboard:
- Go to **Analytics** to see function invocations
- Monitor usage and errors

## Updating the Deployment

To deploy updates:

```bash
# Make your changes
git add .
git commit -m "Your changes"
git push

# Deploy to Vercel
vercel --prod
```

Or connect your GitHub repository to Vercel for automatic deployments on push.

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
