/**
 * 状态机引擎 —— 校验状态流转合法性
 * 从 status_transitions 表动态读取流转规则
 */
const { db } = require('../database/init');

class StateMachine {
  constructor() {
    this.transitions = new Map();
    this._loaded = false;
  }

  /** 懒加载：从DB加载流转规则到内存Map（首次调用时触发） */
  loadTransitions() {
    if (this._loaded) return;
    this.transitions.clear();
    const rows = db.prepare('SELECT * FROM status_transitions').all();
    for (const t of rows) {
      const key = `${t.from_status}→${t.to_status}`;
      this.transitions.set(key, t);
    }
    this._loaded = true;
  }

  /**
   * 检查 from→to 是否合法
   * @returns {{ valid: boolean, config?: object, reason?: string }}
   */
  check(from, to) {
    this.loadTransitions(); // 懒加载：首次调用时从DB读取
    // 精确匹配
    let key = `${from}→${to}`;
    let config = this.transitions.get(key);
    
    // 通配符匹配 (*→to)
    if (!config) {
      key = `*→${to}`;
      config = this.transitions.get(key);
    }
    
    if (!config) {
      return { valid: false, reason: `不允许从"${from}"直接切换到"${to}"` };
    }
    
    return { valid: true, config };
  }

  /**
   * 检查角色是否有权限触发此转换
   */
  checkRole(config, role) {
    if (!config.allowed_roles) return true;
    try {
      const roles = JSON.parse(config.allowed_roles);
      return roles.includes(role);
    } catch {
      return false;
    }
  }

  /** 获取某状态的所有合法下一状态 */
  getNextStates(currentStatus) {
    this.loadTransitions();
    const exact = db.prepare(
      'SELECT to_status FROM status_transitions WHERE from_status = ?'
    ).all(currentStatus).map(r => r.to_status);
    
    const wildcard = db.prepare(
      'SELECT to_status FROM status_transitions WHERE from_status = ?'
    ).all('*').map(r => r.to_status);
    
    return [...new Set([...exact, ...wildcard])];
  }
}

module.exports = new StateMachine();
