import { createClient } from '@supabase/supabase-js';

export async function getScopeSlice(
  projectId: string,
  apiKey: string,
  filters?: {
    nodeId?: string;
    keyword?: string;
    tag?: string;
    nodeType?: string;
  }
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

  // Build query
  let query = supabase
    .from('flowchart_items')
    .select('*')
    .eq('project_id', projectId);

  // Apply filters
  if (filters?.nodeId) {
    query = query.eq('id', filters.nodeId);
  }

  if (filters?.nodeType) {
    query = query.eq('type', filters.nodeType);
  }

  if (filters?.keyword) {
    query = query.or(`title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%`);
  }

  // Note: Tag filtering would require a tags table/column
  // For now, we'll skip tag filtering

  const { data: items, error: itemsError } = await query.order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error('Failed to fetch scope items');
  }

  return {
    items: (items || []).map((item: any) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      position: {
        x: item.position_x,
        y: item.position_y,
      },
      ...(item.type === 'page' && { elements: item.elements }),
      ...(item.type === 'feature' && {
        technicalRequirements: item.technical_requirements,
        associatedPages: item.associated_pages,
      }),
      ...(item.type === 'api' && {
        documentationLink: item.documentation_link,
        usage: item.usage,
      }),
      ...(item.type === 'asset' && {
        toolRecommendation: item.tool_recommendation,
      }),
      externalIssueId: item.external_issue_id,
      externalIssueStatus: item.external_issue_status,
    })),
    count: items?.length || 0,
  };
}
