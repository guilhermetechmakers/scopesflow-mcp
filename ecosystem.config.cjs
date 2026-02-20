module.exports = {
  apps: [{
    name: 'scopesflow-mcp',
    script: 'server.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      MCP_SERVER_PORT: '3001',
      MCP_SERVER_HOST: '0.0.0.0',
    },
    instances: 1,
    autorestart: true,
    watch: false,
  }],
};
