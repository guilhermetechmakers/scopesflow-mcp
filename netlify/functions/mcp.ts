import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
// Import from compiled dist - Netlify will bundle this during build
import { CursorMCPServer } from '../../dist/server.js';

// Create a singleton server instance
let serverInstance: CursorMCPServer | null = null;

function getServerInstance(): CursorMCPServer {
  if (!serverInstance) {
    serverInstance = new CursorMCPServer();
  }
  return serverInstance;
}

// CORS headers helper
function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: '',
    };
  }

  // Only allow POST requests for MCP protocol messages
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Method not allowed. Use POST for MCP protocol messages.',
        type: 'error',
      }),
    };
  }

  try {
    // Parse the MCP protocol message from request body
    let message: any;
    try {
      message = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          type: 'error',
        }),
      };
    }

    // Validate message structure
    if (!message.type) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          error: 'Missing message type',
          type: 'error',
        }),
      };
    }

    // Get server instance and process the message
    const server = getServerInstance();
    const response = await server.processMessage(message);

    // Return the MCP protocol response
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[Netlify Function] Error processing MCP message:', error);
    
    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      }),
    };
  }
};

