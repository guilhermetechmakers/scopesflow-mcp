import { createClient } from '@supabase/supabase-js';

export async function getHistoricalContext(
  projectId: string,
  apiKey: string,
  versionId?: string
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

  // Get version history
  const { data: versions } = await supabase
    .from('project_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Get version changes
  const { data: changes } = await supabase
    .from('version_changes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(100);

  // Get specific version if requested
  let versionData = null;
  if (versionId) {
    const { data: version } = await supabase
      .from('project_versions')
      .select('*')
      .eq('id', versionId)
      .eq('project_id', projectId)
      .single();

    if (version) {
      versionData = {
        ...version,
        snapshot_data: version.snapshot_data || {},
      };
    }
  }

  return {
    versions: (versions || []).map((v: any) => ({
      id: v.id,
      version_number: v.version_number,
      version_name: v.version_name,
      is_baseline: v.is_baseline,
      approved_at: v.approved_at,
      created_at: v.created_at,
    })),
    changes: (changes || []).map((c: any) => ({
      id: c.id,
      change_type: c.change_type,
      entity_type: c.entity_type,
      entity_id: c.entity_id,
      old_value: c.old_value,
      new_value: c.new_value,
      created_at: c.created_at,
    })),
    version: versionData,
    stats: {
      versionsCount: versions?.length || 0,
      changesCount: changes?.length || 0,
    },
  };
}
