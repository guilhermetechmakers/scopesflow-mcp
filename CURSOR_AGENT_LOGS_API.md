# Cursor Agent Logs API

## Overview

The MCP server now captures all cursor-agent logs during execution and sends them to your application in real-time. This allows you to display progress, debug issues, and provide users with visibility into what cursor-agent is doing.

## Response Structure

When you call `cursor/execute-prompt`, the response now includes:

```typescript
{
  success: boolean;
  output: string;
  error: null | string;
  filesChanged: string[];
  timeElapsed: number;
  cursorOutput: string;
  migrations: Array<Migration>;
  hasMigrations: boolean;
  
  // NEW: Structured logs from cursor-agent execution
  logs: Array<CursorAgentLog>;
  logsSummary: {
    total: number;
    byType: Record<string, number>;
  };
}
```

## Log Entry Structure

Each log entry has the following structure:

```typescript
interface CursorAgentLog {
  timestamp: string;        // ISO 8601 timestamp
  type: string;             // Log type (see types below)
  message: string;          // Human-readable message
  data?: {                  // Optional structured data
    elapsed?: string;       // Elapsed time in seconds
    raw?: any;             // Raw JSON data from cursor-agent
    [key: string]: any;    // Type-specific data
  };
}
```

## Log Types

### Server Events

| Type | Description | Example Message |
|------|-------------|-----------------|
| `info` | General information | "Starting cursor-agent with streaming output" |
| `warning` | Non-critical issues | "Cursor-agent timed out, terminating process..." |
| `error` | Critical errors | "ALERT: cursor-agent is trying to run a dev server!" |
| `success` | Successful completion | "Cursor-agent completed successfully" |

### Cursor Agent Events

| Type | Description | Data Fields | Example |
|------|-------------|-------------|---------|
| `agent_status` | Status updates | `elapsed`, `raw` | "Analyzing project structure..." |
| `agent_file` | File operations | `elapsed`, `path`, `raw` | "File modified: src/App.tsx" |
| `agent_thinking` | AI thought process | `elapsed`, `raw` | "I need to create a new component..." |
| `agent_error` | Errors from agent | `elapsed`, `raw` | "Cannot find module 'react'" |
| `agent_completion` | Task completion | `elapsed`, `raw` | "All files created successfully" |
| `agent_delta` | Streaming text | `elapsed`, `raw` | "Creating..." (partial text) |
| `agent_tool_call` | Tool invocations | `elapsed`, `raw` | "writeToolCall: src/App.tsx" |
| `agent_assistant` | AI messages | `elapsed`, `raw` | "Let me create the components..." |
| `agent_event` | Other events | `elapsed`, `eventType`, `raw` | Generic event data |
| `agent_output` | Plain text output | - | Non-JSON output from agent |
| `agent_stderr` | Error stream | - | stderr output |
| `agent_final` | Final message | `raw` | Last message before exit |

## Usage Examples

### Display Real-Time Progress

```typescript
// In your React component
const [logs, setLogs] = useState<CursorAgentLog[]>([]);

// After receiving response
const response = await executePrompt(projectPath, prompt);
setLogs(response.logs);

// Display in UI
{logs.map((log, idx) => (
  <div key={idx} className={`log-entry log-${log.type}`}>
    <span className="timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
    <span className="type">{log.type}</span>
    <span className="message">{log.message}</span>
    {log.data?.elapsed && <span className="elapsed">{log.data.elapsed}s</span>}
  </div>
))}
```

### Filter by Type

```typescript
// Show only errors and warnings
const criticalLogs = logs.filter(log => 
  log.type === 'error' || log.type === 'warning' || log.type === 'agent_error'
);

// Show only file operations
const fileOps = logs.filter(log => log.type === 'agent_file');

// Show thinking process
const thoughts = logs.filter(log => log.type === 'agent_thinking');
```

### Display Summary Statistics

```typescript
// Use the provided logsSummary
<div className="logs-summary">
  <p>Total Log Entries: {response.logsSummary.total}</p>
  <ul>
    {Object.entries(response.logsSummary.byType).map(([type, count]) => (
      <li key={type}>{type}: {count}</li>
    ))}
  </ul>
</div>
```

### Build a Timeline View

```typescript
// Group logs by time intervals
const groupByTimeInterval = (logs: CursorAgentLog[], intervalMs: number = 5000) => {
  const groups: Record<string, CursorAgentLog[]> = {};
  const startTime = new Date(logs[0]?.timestamp).getTime();
  
  logs.forEach(log => {
    const logTime = new Date(log.timestamp).getTime();
    const interval = Math.floor((logTime - startTime) / intervalMs);
    const key = `${interval * intervalMs}ms`;
    groups[key] = groups[key] || [];
    groups[key].push(log);
  });
  
  return groups;
};

// Display as timeline
const timeline = groupByTimeInterval(logs);
{Object.entries(timeline).map(([time, logs]) => (
  <div key={time} className="timeline-segment">
    <h4>{time}</h4>
    {logs.map((log, idx) => <LogEntry key={idx} log={log} />)}
  </div>
))}
```

### Detect Important Events

```typescript
// Check if dev server was blocked
const devServerAttempt = logs.find(log => 
  log.message.includes('trying to run a dev server')
);

if (devServerAttempt) {
  showAlert('Warning: Cursor agent tried to run dev server but was blocked');
}

// Check for errors
const errors = logs.filter(log => 
  log.type === 'error' || log.type === 'agent_error'
);

if (errors.length > 0) {
  showErrorDialog('Errors occurred during execution', errors);
}

// Detect completion
const completionLog = logs.find(log => log.type === 'success');
if (completionLog) {
  const elapsed = completionLog.data?.elapsed;
  showSuccess(`Completed in ${elapsed}s`);
}
```

### Export Logs for Debugging

```typescript
const exportLogs = (logs: CursorAgentLog[], filename: string) => {
  const logsJson = JSON.stringify(logs, null, 2);
  const blob = new Blob([logsJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Export button
<button onClick={() => exportLogs(logs, 'cursor-agent-logs.json')}>
  Export Logs
</button>
```

### Stream Logs in Real-Time (WebSocket)

If using WebSocket connection, you can stream logs as they arrive:

```typescript
// Server-side (if implementing streaming)
socket.on('execute-prompt', async (data) => {
  // ... execute cursor-agent ...
  
  // Stream logs as they're generated
  logs.forEach(log => {
    socket.emit('log-entry', log);
  });
  
  socket.emit('execution-complete', { success: true, logs });
});

// Client-side
socket.on('log-entry', (log: CursorAgentLog) => {
  setLogs(prevLogs => [...prevLogs, log]);
});
```

## Styling Recommendations

```css
.log-entry {
  padding: 8px 12px;
  margin: 4px 0;
  border-left: 3px solid #ccc;
  font-family: monospace;
  font-size: 12px;
}

.log-info { border-left-color: #3b82f6; background: #eff6ff; }
.log-success { border-left-color: #10b981; background: #f0fdf4; }
.log-warning { border-left-color: #f59e0b; background: #fffbeb; }
.log-error { border-left-color: #ef4444; background: #fef2f2; }

.log-agent_thinking { border-left-color: #8b5cf6; background: #faf5ff; }
.log-agent_file { border-left-color: #06b6d4; background: #f0fdfa; }
.log-agent_tool_call { border-left-color: #ec4899; background: #fdf2f8; }

.timestamp {
  color: #6b7280;
  margin-right: 8px;
}

.type {
  font-weight: 600;
  margin-right: 8px;
  text-transform: uppercase;
  font-size: 10px;
}

.elapsed {
  color: #9ca3af;
  font-size: 10px;
  margin-left: 8px;
}
```

## Performance Considerations

- Logs array can be large (100-1000+ entries for complex operations)
- Consider pagination or virtualization for displaying many logs
- Use `logsSummary` to show high-level stats without rendering all logs
- Filter logs by type to reduce rendering load
- Consider debouncing updates if streaming logs in real-time

## TypeScript Types

```typescript
// Full type definitions for your frontend
export interface CursorAgentLog {
  timestamp: string;
  type: CursorAgentLogType;
  message: string;
  data?: CursorAgentLogData;
}

export type CursorAgentLogType =
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'agent_status'
  | 'agent_file'
  | 'agent_thinking'
  | 'agent_error'
  | 'agent_completion'
  | 'agent_delta'
  | 'agent_tool_call'
  | 'agent_assistant'
  | 'agent_event'
  | 'agent_output'
  | 'agent_stderr'
  | 'agent_final';

export interface CursorAgentLogData {
  elapsed?: string;
  path?: string;
  eventType?: string;
  exitCode?: number | null;
  signal?: string | null;
  totalLogs?: number;
  error?: string;
  raw?: any;
  [key: string]: any;
}

export interface LogsSummary {
  total: number;
  byType: Record<string, number>;
}

export interface ExecutePromptResponse {
  success: boolean;
  output: string;
  error: null | string;
  filesChanged: string[];
  timeElapsed: number;
  cursorOutput: string;
  migrations: Migration[];
  hasMigrations: boolean;
  logs: CursorAgentLog[];
  logsSummary: LogsSummary;
}
```

## Example Component

```typescript
import React, { useState } from 'react';
import { CursorAgentLog } from './types';

interface LogViewerProps {
  logs: CursorAgentLog[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const [filterType, setFilterType] = useState<string>('all');
  
  const filteredLogs = filterType === 'all' 
    ? logs 
    : logs.filter(log => log.type === filterType);
  
  const uniqueTypes = Array.from(new Set(logs.map(log => log.type)));
  
  return (
    <div className="log-viewer">
      <div className="log-controls">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Logs ({logs.length})</option>
          {uniqueTypes.map(type => (
            <option key={type} value={type}>
              {type} ({logs.filter(l => l.type === type).length})
            </option>
          ))}
        </select>
      </div>
      
      <div className="log-entries">
        {filteredLogs.map((log, idx) => (
          <div key={idx} className={`log-entry log-${log.type}`}>
            <span className="timestamp">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className="type">{log.type}</span>
            <span className="message">{log.message}</span>
            {log.data?.elapsed && (
              <span className="elapsed">{log.data.elapsed}s</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Status

✅ **Implemented and Ready**

The log capture system is fully functional and will be included in all cursor-agent executions starting now.

## Benefits

- 🔍 **Full Visibility**: See exactly what cursor-agent is doing
- 🐛 **Better Debugging**: Capture errors and warnings with context
- 📊 **Analytics**: Track performance and behavior patterns
- 👥 **User Experience**: Show progress to users instead of blank screens
- 📝 **Audit Trail**: Complete history of AI actions for compliance

## Related Documentation

- `server.ts` - Implementation details
- `CURSOR_AGENT_COMPLETE_FIX_SUMMARY.md` - Streaming architecture
- `CURSOR_AGENT_DEV_SERVER_FIX.md` - Dev server protection

---

Last Updated: 2024-10-13









