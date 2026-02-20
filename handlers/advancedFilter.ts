import { createClient } from '@supabase/supabase-js';

export async function getAdvancedFilter(
  projectId: string,
  apiKey: string,
  filters: {
    nodeType?: string;
    status?: string;
    role?: string;
    dateFrom?: string;
    dateTo?: string;
    keyword?: string;
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

  // Build query with filters
  let query = supabase
    .from('flowchart_items')
    .select('*')
    .eq('project_id', projectId);

  if (filters.nodeType) {
    query = query.eq('type', filters.nodeType);
  }

  if (filters.status) {
    query = query.eq('external_issue_status', filters.status);
  }

  if (filters.keyword) {
    query = query.or(`title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%`);
  }

  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data: items, error: itemsError } = await query.order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error('Failed to fetch filtered items');
  }

  // Filter by role if specified (would need to join with project_members)
  let filteredItems = items || [];

  if (filters.role) {
    // This would require additional logic to filter by user role
    // For now, we'll return all items
  }

  return {
    items: filteredItems.map((item: any) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      status: item.external_issue_status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    count: filteredItems.length,
    filters: filters,
  };
}
