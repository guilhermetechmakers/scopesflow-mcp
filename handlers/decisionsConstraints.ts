import { createClient } from '@supabase/supabase-js';

export async function getDecisionsConstraints(
  projectId: string,
  apiKey: string,
  nodeId?: string
) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Verify API key and get organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('api_key', apiKey)
    .single();

  if (orgError || !org) {
    throw new Error('Invalid API key');
  }

  // Verify project access
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .eq('organization_id', org.id)
    .single();

  if (projectError || !project) {
    throw new Error('Project not found or access denied');
  }

  // Get decisions and constraints from flowchart items
  // Note: This assumes decisions/constraints are stored in the flowchart_items table
  // Adjust based on your actual schema
  let query = supabase
    .from('flowchart_items')
    .select('id, title, decisions, constraints, prompt')
    .eq('project_id', projectId);

  if (nodeId) {
    query = query.eq('id', nodeId);
  }

  const { data: items, error: itemsError } = await query;

  if (itemsError) {
    throw new Error('Failed to fetch decisions and constraints');
  }

  const results = (items || []).map((item: any) => ({
    nodeId: item.id,
    nodeTitle: item.title,
    decisions: item.decisions || [],
    constraints: item.constraints || [],
    prompt: item.prompt,
  }));

  return {
    nodes: results,
    count: results.length,
  };
}
