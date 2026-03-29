'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { logger } = require('../utils/logger');

/**
 * Long-term memory store using SQLite.
 * Keeps permanent facts about users.
 */
class LongTermMemory {
  /**
   * @param {object} deps
   * @param {string} deps.dbPath - path to SQLite database file
   */
  constructor({ dbPath = path.join(process.cwd(), 'data', 'agent_memory.db') } = {}) {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize the SQLite database and create tables if they don't exist.
   */
  init() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          fact TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS agent_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          user_message TEXT,
          state TEXT DEFAULT 'NEW',
          triage_score INTEGER DEFAULT 0,
          triage_decision TEXT,
          model_response TEXT,
          tools_called TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS debug_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          mode TEXT,
          iteration INTEGER DEFAULT 1,
          request_messages TEXT,
          request_tools TEXT,
          response_json TEXT,
          duration_ms INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const { RunRepository } = require('../db/runRepository');
      this.runs = new RunRepository(this.db);

      logger.info(`[LongTermMemory] SQLite DB initialized at ${this.dbPath}`);
    } catch (err) {
      logger.error(`[LongTermMemory] Failed to initialize DB: ${err.message}`);
      throw err;
    }
  }

  /**
   * Save a fact for a specific session/user.
   * @param {string|number} sessionId 
   * @param {string} fact 
   * @returns {number|null} inserted ID
   */
  saveFact(sessionId, fact) {
    if (!this.db) {
      logger.error('[LongTermMemory] DB not initialized!');
      return null;
    }

    try {
      const stmt = this.db.prepare('INSERT INTO user_facts (session_id, fact) VALUES (?, ?)');
      const info = stmt.run(String(sessionId), fact);
      logger.info(`[LongTermMemory] Fact saved for session ${sessionId}: "${fact}"`);
      return info.lastInsertRowid;
    } catch (err) {
      logger.error(`[LongTermMemory] Failed to save fact: ${err.message}`);
      return null;
    }
  }

  /**
   * Get all facts for a given session/user.
   * @param {string|number} sessionId 
   * @returns {string[]} array of facts
   */
  getFacts(sessionId) {
    if (!this.db) {
      return [];
    }
    
    try {
      const stmt = this.db.prepare('SELECT fact FROM user_facts WHERE session_id = ? ORDER BY created_at ASC');
      const rows = stmt.all(String(sessionId));
      return rows.map(r => r.fact);
    } catch (err) {
      logger.error(`[LongTermMemory] Failed to get facts: ${err.message}`);
      return [];
    }
  }

  /**
   * Log a full LLM call for debugging (only when LOG_LEVEL=debug).
   * @param {object} entry
   * @param {string} entry.sessionId
   * @param {string} entry.mode - 'DIRECT' or 'TOOL_LOOP'
   * @param {number} entry.iteration
   * @param {Array}  entry.messages - full messages[] sent to LLM
   * @param {Array}  entry.tools - tool schemas sent
   * @param {object} entry.response - full LLM response
   * @param {number} entry.durationMs
   */
  logDebug({ sessionId, mode, iteration, messages, tools, response, durationMs }) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(
        'INSERT INTO debug_log (session_id, mode, iteration, request_messages, request_tools, response_json, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      stmt.run(
        String(sessionId),
        mode,
        iteration,
        JSON.stringify(messages),
        tools && tools.length > 0 ? JSON.stringify(tools) : null,
        JSON.stringify(response),
        durationMs || 0,
      );
      this._trimDebugLog();
    } catch (err) {
      logger.error(`[LongTermMemory] Failed to log debug: ${err.message}`);
    }
  }

  /**
   * Keep only the last 200 debug log entries.
   */
  _trimDebugLog() {
    try {
      this.db.exec(`
        DELETE FROM debug_log WHERE id NOT IN (
          SELECT id FROM debug_log ORDER BY id DESC LIMIT 200
        )
      `);
    } catch (err) {
      // Non-critical, ignore
    }
  }

  /**
   * Get recent debug log entries.
   * @param {number} [limit=50]
   * @returns {Array<object>}
   */
  getDebugLog(limit = 50) {
    if (!this.db) return [];
    try {
      return this.db.prepare('SELECT * FROM debug_log ORDER BY id DESC LIMIT ?').all(limit);
    } catch (err) {
      return [];
    }
  }

  /**
   * Close database connection safely.
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('[LongTermMemory] DB closed.');
    }
  }
}

module.exports = { LongTermMemory };
