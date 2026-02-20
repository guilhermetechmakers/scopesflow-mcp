import { createClient } from '@supabase/supabase-js';

export async function getProjectOverview(projectId: string, apiKey: string) {
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

  // Get project with organization check
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(`
      *,
      organization:organization_id (
        id,
        name
      )
    `)
    .eq('id', projectId)
    .eq('organization_id', org.id)
    .single();

  if (projectError || !project) {
    throw new Error('Project not found or access denied');
  }

  // Get project members
  const { data: members } = await supabase
    .from('project_members')
    .select(`
      *,
      profiles:user_id (
        name,
        email
      )
    `)
    .eq('project_id', projectId);

  // Get flowchart items count
  const { count: itemsCount } = await supabase
    .from('flowchart_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  return {
    project: {
      id: project.id,
      name: project.title,
      description: project.description,
      status: project.status,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    organization: project.organization,
    members: (members || []).map((m: any) => ({
      role: m.role,
      user: m.profiles,
    })),
    stats: {
      itemsCount: itemsCount || 0,
    },
  };
}
