/**
 * Rate Limiter Middleware for MCP Server
 * Checks rate limits before processing requests
 */

import { createClient } from '@supabase/supabase-js';

export async function checkRateLimit(
  organizationId: string,
  apiKey: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check rate limit
  const { data: allowed, error } = await supabase.rpc('check_mcp_rate_limit', {
    p_organization_id: organizationId,
    p_api_key: apiKey,
    p_endpoint: endpoint,
  });

  if (error) {
    console.error('Error checking rate limit:', error);
    // Allow request if check fails (fail open)
    return { allowed: true, remaining: 1000, limit: 1000 };
  }

  // Get current usage and limit
  const hourBucket = new Date();
  hourBucket.setMinutes(0, 0, 0);

  const { count } = await supabase
    .from('mcp_access_logs')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('api_key', apiKey)
    .eq('hour_bucket', hourBucket.toISOString());

  // Get rate limit
  const { data: policy } = await supabase.rpc('get_mcp_access_policy', {
    p_organization_id: organizationId,
  });

  const limit = policy?.[0]?.rate_limit_per_hour || 1000;
  const remaining = Math.max(0, limit - (count || 0));

  return {
    allowed: allowed === true,
    remaining,
    limit,
  };
}

export async function logAccess(
  organizationId: string,
  apiKey: string,
  endpoint: string,
  projectId: string | null,
  success: boolean,
  responseTimeMs?: number
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase.rpc('log_mcp_access', {
    p_organization_id: organizationId,
    p_api_key: apiKey,
    p_endpoint: endpoint,
    p_project_id: projectId || null,
    p_success: success,
    p_response_time_ms: responseTimeMs || null,
    p_metadata: {},
  });
}
