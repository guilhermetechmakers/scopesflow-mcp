/**
 * Policy Enforcer Middleware for MCP Server
 * Enforces scoped retrieval policies
 */

import { createClient } from '@supabase/supabase-js';

export interface PolicyCheck {
  allowed: boolean;
  reason?: string;
}

export async function checkPolicy(
  organizationId: string,
  endpoint: string,
  projectId?: string,
  projectSize?: number
): Promise<PolicyCheck> {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get access policy
  const { data: policy, error } = await supabase.rpc('get_mcp_access_policy', {
    p_organization_id: organizationId,
  });

  if (error || !policy || policy.length === 0) {
    // No policy means allow all (default)
    return { allowed: true };
  }

  const p = policy[0];

  // Check if endpoint is allowed
  if (p.allowed_endpoints && p.allowed_endpoints.length > 0) {
    if (!p.allowed_endpoints.includes(endpoint)) {
      return {
        allowed: false,
        reason: `Endpoint ${endpoint} is not allowed by organization policy`,
      };
    }
  }

  // Check historical access
  if (
    endpoint.includes('historical') &&
    p.allow_historical_access === false
  ) {
    return {
      allowed: false,
      reason: 'Historical access is disabled by organization policy',
    };
  }

  // Check relationship traversal
  if (
    endpoint.includes('relationship') &&
    p.allow_relationship_traversal === false
  ) {
    return {
      allowed: false,
      reason: 'Relationship traversal is disabled by organization policy',
    };
  }

  // Check project size limit for full context
  if (
    endpoint.includes('full-project-context') &&
    p.max_project_size &&
    projectSize &&
    projectSize > p.max_project_size
  ) {
    return {
      allowed: false,
      reason: `Project size (${projectSize}) exceeds maximum allowed (${p.max_project_size})`,
    };
  }

  return { allowed: true };
}
