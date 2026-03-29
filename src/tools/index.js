'use strict';

const fetchTool = require('./fetchTool');
const timeTool  = require('./timeTool');

/**
 * Tool registry — maps tool names to their schemas and handlers.
 *
 * To add a new tool:
 *   1. Create src/tools/myTool.js (export: { schema, handler })
 *   2. Import it here and add to the TOOLS array
 *   3. It will be automatically registered in the ToolExecutor
 */
const TOOLS = [
  { name: 'http_fetch',        ...fetchTool },
  { name: 'get_current_time',  ...timeTool  },
];

/**
 * Register all tools into a ToolExecutor instance.
 * @param {import('../executor/toolExecutor').ToolExecutor} executor
 */
function registerAll(executor) {
  for (const tool of TOOLS) {
    executor.register(tool.name, tool.schema, tool.handler);
  }
}

module.exports = { registerAll };
