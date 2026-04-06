# Slidea - Deployment Guide

## Overview
Slidea is an AI-powered presentation generator with a Node.js backend and React frontend. This guide explains how to deploy it to Render.

## Prerequisites
- GitHub account with the code pushed
- Render account (free tier available at https://render.com)
- Environment variables ready:
  - `OPENAI_API_KEY` - Your OpenAI API key
  - `DATABASE_URL` - PostgreSQL connection string (optional, app works without it)
  - `UNSPLASH_ACCESS_KEY` - Unsplash API key for images (optional)

## Deployment Steps

### Step 1: Connect Render to GitHub
1. Go to https://dashboard.render.com
2. Click "New +" and select "Blueprint"
3. Select "GitHub" as the repository source
4. Authorize Render with your GitHub account
5. Select the `HarshaGankidi/Slidea` repository

### Step 2: Configure Deployment
1. Render will detect the `render.yaml` file automatically
2. Review the configurations:
   - **Backend Service**: `slidea-backend` (Node.js, port 5000)
   - **Frontend Service**: `slidea-frontend` (React/Vite)
3. Enter environment variables when prompted:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `DATABASE_URL`: (Optional) PostgreSQL connection string
   - `UNSPLASH_ACCESS_KEY`: (Optional) Unsplash API key

### Step 3: Deploy
1. Click the "Deploy" button
2. Render will:
   - Clone your GitHub repository
   - Install dependencies for both frontend and backend
   - Build the frontend with Vite
   - Start both services
3. Monitor the deployment progress in the dashboard

### Step 4: Access Your Application
Once deployed:
- **Frontend**: `https://slidea-frontend.onrender.com`
- **Backend API**: `https://slidea-backend.onrender.com/api`
- **Health Check**: `https://slidea-backend.onrender.com/health`

## Environment Variables Configuration

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for GPT model | `sk-...` |

### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Uses fallback storage |
| `UNSPLASH_ACCESS_KEY` | Unsplash API key for images | Uses Unsplash Source API |
| `PORT` | Backend server port | `5000` |
| `NODE_ENV` | Node environment | `production` |

## Troubleshooting

### Backend Service Won't Start
- Check logs in the Render dashboard
- Verify `OPENAI_API_KEY` is set correctly
- Confirm Node.js version compatibility (v18+)

### Frontend Deployment Fails
- Ensure `frontend/package.json` has all dependencies
- Check build command: `npm install && npm run build`
- Verify Vite configuration in `frontend/vite.config.js`

### Presentations Not Generating
1. Check backend logs for errors
2. Verify OpenAI API key is valid
3. Ensure API rate limits aren't exceeded
4. App will fall back to default content if API fails

### Database Errors
- Database is optional; app works without it
- If `DATABASE_URL` is set but connection fails, only REST API operations are affected
- Presentations are still stored locally

## Advanced Configuration

### Custom Domain
1. In Render dashboard, go to Service Settings
2. Navigate to "Custom Domains"
3. Add your domain and follow DNS configuration

### Scaling
- Render free tier has limitations (stops after 15 min of inactivity)
- Upgrade to paid plan for production use
- Use "Paid" instances for always-on services

### Monitoring
- Monitor in Render dashboard under "Logs" tab
- Check metrics like CPU, memory, and bandwidth
- Set up alerts for service failures

## Cost Estimate
- **Free Tier**: $0/month (with auto-suspend after 15 min inactivity)
- **Pro Tier (Backend)**: $7/month per service (always-on)
- **Pro Tier (Frontend)**: $7/month per service (always-on)
- **Bandwidth**: First 100GB free per month

## Updating Your Deployment

### Automatic Updates
1. Push code changes to GitHub
2. Render automatically redeploys on push (if enabled)
3. Check deployment status in the Render dashboard

### Manual Redeploy
1. Go to Service in Render dashboard
2. Click "Manual Deploy" in the "Deploys" tab
3. Or click "Deploy commit" in the GitHub UI

## Performance Tips
1. **Use environment variables**: Store secrets securely in Render
2. **Optimize images**: Keep slide images under 5MB
3. **Rate limiting**: Implement request rate limiting for production
4. **Caching**: Consider adding caching headers for static assets
5. **Monitoring**: Enable Render's performance monitoring

## Support Resources
- Render Docs: https://render.com/docs
- OpenAI API Docs: https://platform.openai.com/docs
- Vite Docs: https://vitejs.dev
- Express.js Docs: https://expressjs.com

## Post-Deployment Checklist
- [ ] Frontend loads at custom domain
- [ ] API health check responds
- [ ] Can generate presentations
- [ ] Images load in presentations
- [ ] Environment variables are secure
- [ ] Error logs are monitored
- [ ] Custom domain is configured (if needed)
- [ ] Rate limiting is in place

---
**Last Updated**: 2024
**Version**: 1.0.0
