#!/usr/bin/env node
'use strict';

/**
 * Debug log viewer — shows recent LLM calls from SQLite debug_log table.
 *
 * Usage:
 *   node debug_viewer.js           # show last 10 calls
 *   node debug_viewer.js 20        # show last 20 calls
 *   node debug_viewer.js full 5    # show last 5 calls with full messages
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'agent_memory.db');
let db;

try {
  db = new Database(dbPath, { readonly: true });
} catch (err) {
  console.error(`Cannot open DB at ${dbPath}: ${err.message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const fullMode = args.includes('full');
const limit = parseInt(args.find(a => /^\d+$/.test(a))) || 10;

try {
  const rows = db.prepare('SELECT * FROM debug_log ORDER BY id DESC LIMIT ?').all(limit);

  if (rows.length === 0) {
    console.log('No debug log entries found. Make sure LOG_LEVEL=debug in .env');
    process.exit(0);
  }

  console.log(`\n=== DEBUG LOG (last ${rows.length} LLM calls) ===\n`);

  // Show in chronological order
  for (const row of rows.reverse()) {
    const ts = row.created_at;
    const mode = row.mode || '?';
    const iter = row.iteration || 1;
    const dur = row.duration_ms || 0;

    console.log(`─── #${row.id} | ${ts} | ${mode} iter=${iter} | ${dur}ms ───`);
    console.log(`Session: ${row.session_id}`);

    // Parse response
    let response;
    try { response = JSON.parse(row.response_json); } catch { response = row.response_json; }

    if (response?.tool_calls && response.tool_calls.length > 0) {
      console.log(`Response: TOOL_CALLS →`);
      for (const tc of response.tool_calls) {
        console.log(`  📞 ${tc.function.name}(${JSON.stringify(tc.function.arguments)})`);
      }
    } else if (response?.content) {
      const content = response.content.length > 200
        ? response.content.substring(0, 200) + '...'
        : response.content;
      console.log(`Response: ${content}`);
    } else {
      console.log(`Response: (empty)`);
    }

    if (fullMode) {
      console.log('\n--- Full messages sent to LLM ---');
      try {
        const messages = JSON.parse(row.request_messages);
        for (const msg of messages) {
          const role = msg.role.toUpperCase();
          const content = msg.content
            ? (msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content)
            : '(no content)';
          console.log(`  [${role}] ${content}`);
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              console.log(`    📞 ${tc.function.name}(${JSON.stringify(tc.function.arguments)})`);
            }
          }
        }
      } catch {
        console.log('  (failed to parse messages)');
      }

      if (row.request_tools) {
        console.log('\n--- Tools sent ---');
        try {
          const tools = JSON.parse(row.request_tools);
          console.log(`  ${tools.map(t => t.function.name).join(', ')}`);
        } catch {
          console.log('  (failed to parse tools)');
        }
      }
    }

    console.log('');
  }

  // Also show agent_runs summary
  console.log('=== RECENT RUNS ===\n');
  const runs = db.prepare('SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?').all(limit);
  for (const run of runs.reverse()) {
    const tools = run.tools_called ? JSON.parse(run.tools_called).map(t => t.name).join(',') : '-';
    const resp = run.model_response
      ? (run.model_response.length > 80 ? run.model_response.substring(0, 80) + '...' : run.model_response)
      : '(no response)';
    console.log(`#${run.id} | ${run.created_at} | score=${run.triage_score} ${run.triage_decision} | tools=[${tools}] | state=${run.state}`);
    console.log(`  User: ${run.user_message}`);
    console.log(`  Bot:  ${resp}`);
    console.log('');
  }

} catch (err) {
  console.error('Error reading debug log:', err.message);
} finally {
  db.close();
}
