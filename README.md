# ScopesFlow MCP Server

A Model Context Protocol (MCP) server that integrates with Cursor CLI for automated code generation and project management.

## Overview

ScopesFlow MCP Server provides a bridge between Cursor CLI and automated development workflows, enabling seamless project creation, code generation, and integration with various services including GitHub, Supabase, and VPS deployments.

## Features

- **Cursor CLI Integration**: Execute prompts and manage Cursor projects programmatically
- **Project Generation**: Create and manage Next.js/React projects with modern tooling
- **GitHub Integration**: Automated repository creation and management
- **Supabase Integration**: Database and backend service integration
- **VPS Deployment**: SSH-based deployment capabilities
- **Netlify Functions**: Serverless function support

## Installation

```bash
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Configuration

The server uses environment variables for configuration. Create a `.env` file in the root directory:

```env
# Optional: GitHub token for repository operations
GITHUB_TOKEN=your_token_here

# Optional: Supabase credentials
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: SSH/VPS credentials
VPS_HOST=your_vps_host
VPS_USER=your_vps_user
VPS_PRIVATE_KEY=your_private_key_path
```

## Usage

The server implements the Model Context Protocol and can be used with any MCP-compatible client. It provides tools for:

- Creating new Cursor projects
- Executing prompts on existing projects
- Managing GitHub repositories
- Integrating with Supabase
- Deploying to VPS servers

## Project Structure

```
.
├── server.ts              # Main MCP server implementation
├── dist/                  # Compiled JavaScript output
├── netlify/              # Netlify Functions deployment
├── cursor-projects/      # Generated Cursor projects
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## License

MIT

## Author

ScopesFlow

