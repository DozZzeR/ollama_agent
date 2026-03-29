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
      `);

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
