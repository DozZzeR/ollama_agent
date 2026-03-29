'use strict';

const { logger } = require('../utils/logger');

class RunRepository {
  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Create a new run record.
   * @param {string|number} sessionId
   * @param {string} userMessage
   * @param {number} triageScore
   * @param {string} triageDecision
   * @returns {number|null} run ID
   */
  createRun(sessionId, userMessage, triageScore = 0, triageDecision = null) {
    try {
      const stmt = this.db.prepare(
        'INSERT INTO agent_runs (session_id, user_message, triage_score, triage_decision) VALUES (?, ?, ?, ?)'
      );
      return stmt.run(String(sessionId), userMessage, triageScore, triageDecision).lastInsertRowid;
    } catch (err) {
      logger.error(`[DB] Failed to create run: ${err.message}`);
      return null;
    }
  }

  /**
   * Update run fields.
   * @param {number} runId
   * @param {object} data - key-value pairs to update
   */
  updateRun(runId, data) {
    try {
      const sets = [];
      const values = [];
      for (const [k, v] of Object.entries(data)) {
        sets.push(`${k} = ?`);
        values.push(v);
      }
      values.push(runId);

      const setQuery = sets.join(', ');
      const stmt = this.db.prepare(`UPDATE agent_runs SET ${setQuery}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
      stmt.run(...values);
    } catch (err) {
      logger.error(`[DB] Failed to update run ${runId}: ${err.message}`);
    }
  }

  /**
   * Get a run by ID.
   * @param {number} runId
   * @returns {object|null}
   */
  getRun(runId) {
    try {
      return this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId);
    } catch (err) {
      return null;
    }
  }

  /**
   * Get recent runs for a session.
   * @param {string|number} sessionId
   * @param {number} [limit=20]
   * @returns {Array<object>}
   */
  getRecentRuns(sessionId, limit = 20) {
    try {
      return this.db.prepare(
        'SELECT * FROM agent_runs WHERE session_id = ? ORDER BY id DESC LIMIT ?'
      ).all(String(sessionId), limit);
    } catch (err) {
      return [];
    }
  }
}

module.exports = { RunRepository };
