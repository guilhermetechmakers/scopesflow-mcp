# Netlify Deployment Quick Start

## Prerequisites

1. Netlify account (free tier works)
2. Git repository connected to Netlify
3. Node.js 20+ installed locally (for testing)

## Local Testing

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Install Netlify CLI globally (if not already installed)
npm install -g netlify-cli

# Run local Netlify development server
npm run netlify:dev

# Test the function
curl -X POST http://localhost:8888/.netlify/functions/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "type": "request",
    "id": "test-1",
    "method": "cursor/server-info",
    "params": {}
  }'
```

## Deployment Steps

1. **Connect Repository to Netlify**
   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your Git repository

2. **Configure Build Settings**
   - Netlify will auto-detect `netlify.toml`
   - Build command: `npm run build` (already configured)
   - Publish directory: `dist` (already configured)

3. **Set Environment Variables**
   - Go to Site Settings → Environment Variables
   - Add any required variables (see NETLIFY_DEPLOYMENT.md)

4. **Deploy**
   - Push to your main branch, or
   - Use Netlify CLI: `netlify deploy --prod`

## Function Endpoint

After deployment, your function will be available at:
- `https://your-site.netlify.app/.netlify/functions/mcp`
- Or via redirect: `https://your-site.netlify.app/api/mcp`

## Example Request

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "type": "request",
    "id": "unique-id",
    "method": "cursor/server-info",
    "params": {}
  }'
```

## Troubleshooting

- **Function timeout**: Increase timeout in `netlify.toml` (max 26s for paid tier)
- **Import errors**: Ensure `npm run build` completes successfully before deployment
- **Environment variables**: Check Netlify Dashboard → Site Settings → Environment Variables

For detailed information, see [NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md)

