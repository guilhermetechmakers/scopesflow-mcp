module.exports = {
  apps: [{
    name: 'scopesflow-mcp',
    script: 'dist/server.js',
    interpreter: 'node',
    cwd: path.resolve(__dirname),
    env: {
      NODE_ENV: 'production',
      MCP_SERVER_PORT: '3001',
      MCP_SERVER_HOST: '0.0.0.0',
      MCP_USE_BUILD_WORKERS: 'true',
      MCP_HEADLESS: 'true',
      MCP_BUILD_LOG_TYPE_INFO: 'build_log',
      MCP_BUILD_LOG_TYPE_ERROR: 'build_log',
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
  }],
};