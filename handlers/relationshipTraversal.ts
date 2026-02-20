import { createClient } from '@supabase/supabase-js';

export async function getRelationshipTraversal(
  projectId: string,
  apiKey: string,
  nodeId: string,
  depth: number = 2
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

  // Get the starting node
  const { data: startNode, error: nodeError } = await supabase
    .from('flowchart_items')
    .select('*')
    .eq('id', nodeId)
    .eq('project_id', projectId)
    .single();

  if (nodeError || !startNode) {
    throw new Error('Node not found');
  }

  // Get all connections for the project
  const { data: connections } = await supabase
    .from('flowchart_connections')
    .select('*')
    .eq('project_id', projectId);

  // Build relationship graph
  const visited = new Set<string>();
  const relatedNodes: any[] = [];
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];

  while (queue.length > 0) {
    const { nodeId: currentId, depth: currentDepth } = queue.shift()!;

    if (visited.has(currentId) || currentDepth > depth) {
      continue;
    }

    visited.add(currentId);

    // Get node details
    const { data: node } = await supabase
      .from('flowchart_items')
      .select('*')
      .eq('id', currentId)
      .single();

    if (node) {
      relatedNodes.push({
        ...node,
        depth: currentDepth,
      });
    }

    // Find connected nodes
    const connected = (connections || []).filter(
      (conn: any) => conn.source_id === currentId || conn.target_id === currentId
    );

    for (const conn of connected) {
      const nextNodeId = conn.source_id === currentId ? conn.target_id : conn.source_id;
      if (!visited.has(nextNodeId)) {
        queue.push({ nodeId: nextNodeId, depth: currentDepth + 1 });
      }
    }
  }

  return {
    startNode: {
      id: startNode.id,
      type: startNode.type,
      title: startNode.title,
      description: startNode.description,
    },
    relatedNodes: relatedNodes.map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      description: node.description,
      depth: node.depth,
    })),
    count: relatedNodes.length,
  };
}
