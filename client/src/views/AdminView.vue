<template>
  <div class="admin-view">
    <!-- ========== PASSWORD GATE ========== -->
    <div v-if="!authenticated" class="gate-overlay">
      <div class="gate-card">
        <div class="gate-icon">⚙️</div>
        <h2 class="gate-title">管理员配置后台</h2>
        <p class="gate-subtitle">请输入管理员密码以继续</p>
        <div class="gate-form">
          <input
            ref="pwdInput"
            v-model="adminPassword"
            type="password"
            class="gate-input"
            placeholder="管理员密码"
            autocomplete="off"
            @keyup.enter="verifyPassword"
          />
          <p v-if="gateError" class="gate-error">{{ gateError }}</p>
          <button
            class="gate-btn"
            :disabled="!adminPassword.trim() || verifying"
            @click="verifyPassword"
          >
            <span v-if="verifying" class="spinner"></span>
            <span v-else>验证进入</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ========== ADMIN PANEL (authenticated) ========== -->
    <div v-else class="admin-panel">
      <!-- Top Bar -->
      <header class="admin-header">
        <div class="header-left">
          <span class="header-icon">⚙️</span>
          <h2 class="header-title">管理员配置后台</h2>
        </div>
        <div class="header-right">
          <span class="user-badge">{{ auth.name }}</span>
          <button class="logout-btn" @click="handleLogout">退出</button>
        </div>
      </header>

      <!-- Tabs -->
      <nav class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <span class="tab-emoji">{{ tab.emoji }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </nav>

      <!-- Tab Content -->
      <main class="tab-content">
        <!-- ========== TAB 1: 人员管理 ========== -->
        <section v-if="activeTab === 'staff'" class="content-section">
          <div class="section-toolbar">
            <h3 class="section-title">人员列表</h3>
              <button class="btn btn-outline" @click="openImport">📥 导入</button>
            <button class="btn btn-primary" @click="openStaffCreate">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              新增人员
            </button>
          </div>

          <div v-if="staffList.length === 0" class="empty-state">
            <p>暂无人员数据</p>
          </div>

          <table v-else class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>科室</th>
                <th>角色</th>
                <th>PIN</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in staffList" :key="s.id">
                <td>{{ s.name }}</td>
                <td class="text-muted">{{ s.department || '-' }}</td>
                <td>
                  <span class="role-tag" :class="'role-' + s.role">{{ roleLabel(s.role) }}</span>
                </td>
                <td>{{ s.pin ? '****' : '未设置' }}</td>
                <td>
                  <span class="status-dot" :class="{ active: !s.disabled, inactive: s.disabled }"></span>
                  {{ s.disabled ? '停用' : '正常' }}
                </td>
                <td class="action-cell">
                  <button class="action-btn" title="编辑" @click="openStaffEdit(s)">✏️</button>
                  <button class="action-btn danger" title="删除" @click="confirmDeleteStaff(s)">🗑️</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ========== TAB 2: 房间配置 ========== -->
        <section v-if="activeTab === 'room'" class="content-section">
          <div class="section-toolbar">
            <h3 class="section-title">房间列表</h3>
            <button class="btn btn-primary" @click="openRoomCreate">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              新增房间
            </button>
          </div>

          <!-- ★ v7.0: 快速新增房间 -->
          <div class="quick-add-bar">
            <input v-model="quickRoomName" class="quick-input" placeholder="房间名称" @keyup.enter="quickAddRoom" />
            <select v-model="quickRoomType" class="quick-select">
              <option value="">类型</option>
              <option value="面诊间">面诊间</option>
              <option value="拍照间">拍照间</option>
              <option value="治疗间">治疗间</option>
              <option value="休息区">休息区</option>
              <option value="用餐区">用餐区</option>
              <option value="其他">其他</option>
            </select>
            <button class="btn btn-sm btn-primary" @click="quickAddRoom" :disabled="!quickRoomName.trim()">＋ 快速新增</button>
          </div>

          <div v-if="roomList.length === 0" class="empty-state">
            <p>暂无房间数据</p>
          </div>

          <table v-else class="data-table">
            <thead>
              <tr>
                <th>房间名称</th>
                <th>类型</th>
                <th>容量</th>
                <th>设备标签</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in roomList" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ r.type || '通用' }}</td>
                <td>{{ r.capacity || 1 }} 人</td>
                <td>
                  <span v-if="r.equipmentTags && r.equipmentTags.length">
                    <span
                      v-for="tag in r.equipmentTags"
                      :key="tag"
                      class="tag-chip"
                    >{{ tag }}</span>
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="action-cell">
                  <button class="action-btn" title="编辑" @click="openRoomEdit(r)">✏️</button>
                  <button class="action-btn danger" title="删除" @click="confirmDeleteRoom(r)">🗑️</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ========== TAB 3: 审计日志 ========== -->
        <section v-if="activeTab === 'audit'" class="content-section">
          <div class="section-toolbar">
            <h3 class="section-title">操作日志</h3>
            <button class="btn btn-outline" @click="fetchAuditLogs" :disabled="auditLoading">
              {{ auditLoading ? '刷新中...' : '刷新' }}
            </button>
          </div>

          <!-- Force Operations Section -->
          <div class="force-ops-card">
            <h4 class="force-ops-title">🔧 强制操作（接诊单）</h4>
            <div class="force-ops-grid">
              <div class="force-op">
                <label>删除接诊单</label>
                <div class="force-op-row">
                  <input
                    v-model="forceDeleteId"
                    class="form-input-sm"
                    placeholder="接诊单ID"
                  />
                  <input
                    v-model="forceDeleteReason"
                    class="form-input-sm"
                    placeholder="删除原因"
                  />
                  <button
                    class="btn btn-danger btn-sm"
                    :disabled="!forceDeleteId.trim() || forceDeleting"
                    @click="executeForceDelete"
                  >
                    {{ forceDeleting ? '执行中...' : '强制删除' }}
                  </button>
                </div>
              </div>
              <div class="force-op">
                <label>改名接诊单</label>
                <div class="force-op-row">
                  <input
                    v-model="forceRenameId"
                    class="form-input-sm"
                    placeholder="接诊单ID"
                  />
                  <input
                    v-model="forceRenameNewName"
                    class="form-input-sm"
                    placeholder="新姓名"
                  />
                  <input
                    v-model="forceRenameReason"
                    class="form-input-sm"
                    placeholder="改名原因"
                  />
                  <button
                    class="btn btn-warning btn-sm"
                    :disabled="!forceRenameId.trim() || !forceRenameNewName.trim() || forceRenaming"
                    @click="executeForceRename"
                  >
                    {{ forceRenaming ? '执行中...' : '强制改名' }}
                  </button>
                </div>
              </div>
            </div>
            <p v-if="forceOpMsg" class="force-op-msg" :class="{ error: forceOpError }">{{ forceOpMsg }}</p>
          </div>

          <!-- Audit Log Table -->
          <div v-if="auditLogs.length === 0" class="empty-state">
            <p v-if="auditLoading">加载中...</p>
            <p v-else>暂无操作记录</p>
          </div>

          <table v-else class="data-table audit-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>操作类型</th>
                <th>目标</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in auditLogs" :key="log.id">
                <td class="time-cell">{{ formatTime(log.created_at) }}</td>
                <td>{{ log.operator_name || '系统' }}</td>
                <td>
                  <span class="op-tag" :class="opClass(log.operation)">{{ log.operation }}</span>
                </td>
                <td>{{ log.target_type }} / {{ log.target_id?.slice?.(0, 8) || log.target_id }}</td>
                <td class="detail-cell" :title="JSON.stringify(log.details, null, 2)">
                  {{ formatDetails(log.details) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ========== TAB 4: 权限对照表 ========== -->
        <section v-if="activeTab === 'perm'" class="content-section">
          <div class="section-toolbar">
            <h3 class="section-title">角色权限矩阵</h3>
            <span class="perm-hint">🔒 在代码中维护，此处仅供查看</span>
          </div>
          <div class="perm-table-wrap">
            <table class="data-table perm-table">
              <thead>
                <tr>
                  <th>操作</th>
                  <th v-for="r in permRoles" :key="r.key">{{ r.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="op in permOperations" :key="op.key">
                  <td class="perm-op-name">{{ op.label }}</td>
                  <td v-for="r in permRoles" :key="r.key" class="perm-cell">
                    <span v-if="op.roles.includes(r.key)" class="perm-yes">✅</span>
                    <span v-else class="perm-no">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="perm-notes">
            <p><strong>特殊规则：</strong></p>
            <ul>
              <li>🔸 医助从「面诊」退出前，必须先录入治疗方案</li>
              <li>🔸 主管在变更房间时勾选「强制」可跳过容量限制</li>
              <li>🔸 医生仅可查看大屏和添加备注，无任何推进权限</li>
              <li>🔸 前台建单时需下拉选择接诊护士（不能自接）</li>
            </ul>
          </div>
        </section>

        <!-- ========== TAB 5: 耗材管理 (v3.0) ========== -->
        <section v-if="activeTab === 'inventory'" class="content-section">
          <div class="section-toolbar">
            <h3 class="section-title">耗材目录</h3>
            <a href="/templates/耗材导入模板.xlsx" download class="btn btn-outline">📋 模板</a>
            <button class="btn btn-outline" @click="triggerImport">📥 导入</button>
            <input ref="invFileInput" type="file" accept=".xlsx,.xls" style="display:none" @change="handleImportFile" />
            <button class="btn btn-primary" @click="showInvNewItem = !showInvNewItem">
              {{ showInvNewItem ? '收起' : '＋ 新增耗材' }}
            </button>
          </div>

          <!-- Import results -->
          <div v-if="invImportResults.length" class="inv-form-card" style="background:#f0fdf4">
            <div class="import-summary">
              ✅ 导入完成：共 {{ invImportSummary.total }} 行，
              新建 {{ invImportSummary.created }} 项，
              入库 {{ invImportSummary.inboundCount }} 项
              <span v-if="invImportSummary.skipped > 0">，跳过 {{ invImportSummary.skipped }} 项（已存在）</span>
            </div>
            <div v-for="(r,i) in invImportResults" :key="i" class="import-row" :class="{ 'ir-err': r.error, 'ir-ok': !r.error }">
              <span class="ir-name">{{ r.name }}</span>
              <span v-if="r.error" class="ir-msg">❌ {{ r.error }}</span>
              <span v-else class="ir-msg">{{ r.status === 'created+inbound' ? '✅ 新建+' + r.qty : r.status === 'created' ? '✅ 新建' : '⏭ 已存在' }}</span>
            </div>
            <button class="btn btn-outline btn-sm" @click="invImportResults=[];invImportSummary={}">清除</button>
          </div>

          <div v-if="invImportError" class="form-error">{{ invImportError }}</div>

          <div v-if="showInvNewItem" class="inv-form-card">
            <div class="form-row">
              <input v-model="invNewItemForm.name" class="form-input" placeholder="耗材名称" />
              <input v-model="invNewItemForm.unit" class="form-input" placeholder="单位" style="width:80px" />
              <input v-model.number="invNewItemForm.stock" class="form-input" type="number" placeholder="数量" style="width:80px" min="0" />
              <button class="btn btn-primary" @click="doCreateItem" :disabled="!invNewItemForm.name.trim()">创建</button>
            </div>
          </div>

          <table class="data-table" v-if="inventoryItems.length">
            <thead><tr><th>名称</th><th>单位</th><th>库存</th><th>可用</th><th>已锁</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="item in inventoryItems" :key="item.id" :class="{ inactive: !item.is_active }">
                <td>{{ item.name }}</td><td>{{ item.unit }}</td><td>{{ item.current_stock }}</td>
                <td :class="{ 'stock-low': item.available <= item.safety_stock }">{{ item.available }}</td>
                <td>{{ item.locked }}</td>
                <td><span :class="item.is_active ? 'badge-active' : 'badge-inactive'">{{ item.is_active ? '启用' : '停用' }}</span></td>
                <td style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn btn-outline btn-sm" @click="doToggleItem(item.id)">{{ item.is_active ? '停用' : '启用' }}</button>
                  <button class="btn btn-outline btn-sm" @click="openAdjust(item)" :disabled="!item.is_active" style="color:#f59e0b;border-color:#f59e0b">调整</button>
                  <button class="btn btn-outline btn-sm" @click="openLogs(item)" style="color:#6366f1;border-color:#6366f1">日志</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty-hint">暂无耗材记录</p>

          <div class="section-toolbar" style="margin-top:20px"><h3 class="section-title">进货入库</h3></div>
          <div class="inv-form-card">
            <div class="form-row">
              <select v-model="invInboundForm.itemId" class="form-input">
                <option :value="null" disabled>选择耗材</option>
                <option v-for="item in inventoryItems.filter(i => i.is_active)" :key="item.id" :value="item.id">{{ item.name }}（库存:{{ item.current_stock }}）</option>
              </select>
              <input v-model.number="invInboundForm.qty" class="form-input" type="number" placeholder="数量" style="width:100px" min="1" />
              <input v-model="invInboundForm.note" class="form-input" placeholder="备注" />
              <button class="btn btn-primary" @click="doInbound" :disabled="!invInboundForm.itemId || !invInboundForm.qty || invInboundForm.qty <= 0">入库</button>
            </div>
          </div>
        </section>

      </main>

      <!-- Toast / Feedback -->
      <transition name="fade">
        <div v-if="toastMsg" class="toast" :class="{ success: toastSuccess, error: !toastSuccess }">
          {{ toastMsg }}
        </div>
      </transition>
    </div>

    <!-- ========== MODALS ========== -->

    <!-- Staff Create/Edit Modal -->
    <Teleport to="body">
      <div v-if="showStaffModal" class="modal-overlay" @click.self="showStaffModal = false">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingStaff ? '编辑人员' : '新增人员' }}</h3>
            <button class="modal-close" @click="showStaffModal = false">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>姓名 <span class="required">*</span></label>
              <input v-model="staffForm.name" class="form-input" placeholder="请输入姓名" />
            </div>
            <div class="form-group">
              <label>科室</label>
              <input v-model="staffForm.department" class="form-input" placeholder="如：皮肤科、注射科" />
            </div>
            <div class="form-group">
              <label>角色 <span class="required">*</span></label>
              <div class="select-wrapper">
                <select v-model="staffForm.role" class="form-select">
                  <option value="" disabled>请选择角色</option>
                  <option value="reception">前台</option>
                  <option value="nurse">护士</option>
                  <option value="assistant">医助</option>
                  <option value="doctor">医生</option>
                  <option value="manager">主管</option>
                  <option value="admin">管理员</option>
                </select>
                <span class="select-arrow">▾</span>
              </div>
            </div>
            <div class="form-group">
              <label>PIN 码</label>
              <input
                v-model="staffForm.pin"
                class="form-input"
                type="password"
                placeholder="留空则保持不变"
                maxlength="6"
                autocomplete="off"
              />
            </div>
            <p v-if="staffModalError" class="form-error">{{ staffModalError }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showStaffModal = false">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!staffForm.name.trim() || !staffForm.role || staffSaving"
              @click="saveStaff"
            >
              {{ staffSaving ? '保存中...' : (editingStaff ? '保存修改' : '确认创建') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Import Modal -->
    <Teleport to="body">
      <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
        <div class="modal-dialog modal-lg">
          <div class="modal-header">
            <h3>📥 批量导入人员</h3>
            <button class="modal-close" @click="showImportModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="import-help">
              每行一条，4列逗号分隔：<b>姓名,密码,科室,角色</b><br/>
              角色可选：reception/nurse/assistant/doctor/manager/admin<br/>
              示例：张三,123,皮肤科,nurse
            </p>
            <textarea v-model="importText" class="import-textarea" 
              placeholder="张三,123,皮肤科,nurse&#10;李四,456,注射科,doctor&#10;王五,,前台,reception"
              rows="8"></textarea>
            <div v-if="importResults.length" class="import-results">
              <div v-for="(r,i) in importResults" :key="i" class="import-row" :class="{ 'ir-err': r.error, 'ir-ok': r.success }">
                <span class="ir-name">{{ r.name }}</span>
                <span v-if="r.error" class="ir-msg">❌ {{ r.error }}</span>
                <span v-else class="ir-msg">✅ 已创建</span>
              </div>
            </div>
            <p v-if="importError" class="form-error">{{ importError }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showImportModal = false">关闭</button>
            <button class="btn btn-primary" :disabled="!importText.trim() || importing" @click="executeImport">
              {{ importing ? '导入中...' : '开始导入' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Room Create/Edit Modal -->
    <Teleport to="body">
      <div v-if="showRoomModal" class="modal-overlay" @click.self="showRoomModal = false">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{ editingRoom ? '编辑房间' : '新增房间' }}</h3>
            <button class="modal-close" @click="showRoomModal = false">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>房间名称 <span class="required">*</span></label>
              <input v-model="roomForm.name" class="form-input" placeholder="如：诊室1、手术室A" />
            </div>
            <div class="form-group">
              <label>房间类型</label>
              <div class="select-wrapper">
                <select v-model="roomForm.type" class="form-select">
                  <option value="">通用</option>
                  <option value="面诊间">面诊间</option>
                  <option value="拍照间">拍照间</option>
                  <option value="治疗间">治疗间</option>
                  <option value="休息区">休息区</option>
                  <option value="用餐区">用餐区</option>
                  <option value="其他">其他</option>
                </select>
                <span class="select-arrow">▾</span>
              </div>
            </div>
            <div class="form-group">
              <label>容量（人数）</label>
              <input
                v-model.number="roomForm.capacity"
                class="form-input"
                type="number"
                min="1"
                max="20"
                placeholder="默认 1"
              />
            </div>
            <div class="form-group">
              <label>设备标签（逗号分隔）</label>
              <input
                v-model="roomForm.equipmentTagsStr"
                class="form-input"
                placeholder="如：超声仪, 激光设备"
              />
            </div>
            <p v-if="roomModalError" class="form-error">{{ roomModalError }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showRoomModal = false">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!roomForm.name.trim() || roomSaving"
              @click="saveRoom"
            >
              {{ roomSaving ? '保存中...' : (editingRoom ? '保存修改' : '确认创建') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirm Modal -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
        <div class="modal-dialog modal-sm">
          <div class="modal-header">
            <h3>确认删除</h3>
            <button class="modal-close" @click="showDeleteConfirm = false">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="confirm-text">
              {{ deleteConfirmText }}
            </p>
            <p class="confirm-sub">此操作不可撤销</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="showDeleteConfirm = false">取消</button>
            <button class="btn btn-danger" :disabled="deleteExecuting" @click="executeDelete">
              {{ deleteExecuting ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- v4.1: 库存调整 Modal -->
    <Teleport to="body" v-if="showAdjustModal">
      <div class="modal-overlay" @click.self="showAdjustModal = false">
        <div class="modal-dialog modal-sm">
          <div class="modal-header">
            <h3>库存调整 — {{ adjustTarget?.name }}</h3>
            <button class="modal-close" @click="showAdjustModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="modal-desc">当前库存: <strong>{{ adjustTarget?.current_stock }}</strong></p>
            <div class="form-group">
              <label>调整量（正数为入库，负数为出库）</label>
              <input v-model.number="adjustDelta" class="form-input" type="number" placeholder="例: +5 或 -3" />
            </div>
            <div class="form-group">
              <label>备注</label>
              <input v-model="adjustNote" class="form-input" placeholder="调整原因（可选）" />
            </div>
            <button class="btn btn-primary" @click="doAdjust" :disabled="!adjustDelta">确认调整</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- v4.1: 操作日志 Modal -->
    <Teleport to="body" v-if="showLogsModal">
      <div class="modal-overlay" @click.self="showLogsModal = false">
        <div class="modal-dialog" style="max-width:600px">
          <div class="modal-header">
            <h3>📋 操作日志 — {{ logTargetName }}</h3>
            <button class="modal-close" @click="showLogsModal = false">✕</button>
          </div>
          <div class="modal-body" style="max-height:400px;overflow-y:auto">
            <p v-if="logItems.length === 0" class="empty-hint">暂无操作记录</p>
            <table class="data-table" v-else>
              <thead><tr><th>时间</th><th>操作类型</th><th>数量</th><th>操作人</th><th>备注</th></tr></thead>
              <tbody>
                <tr v-for="log in logItems" :key="log.id">
                  <td>{{ new Date(log.created_at).toLocaleString('zh-CN') }}</td>
                  <td>{{ fmtLogType(log.type, log.note) }}</td>
                  <td :style="{color: log.quantity > 0 ? '#16a34a' : '#dc2626'}">{{ log.quantity > 0 ? '+' : '' }}{{ log.quantity }}</td>
                  <td>{{ log.operator_name || '--' }}</td>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">{{ log.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'
import { useWebSocket } from '../composables/useWebSocket'

const router = useRouter()
const auth = useAuthStore()
const { send, connected } = useWebSocket()

// ========== Password Gate ==========
const authenticated = ref(false)
const adminPassword = ref('')
const verifying = ref(false)
const gateError = ref('')
const pwdInput = ref(null)

// ========== Tabs ==========
const allTabs = [
  { key: 'staff', label: '人员列表维护', emoji: '👥' },
  { key: 'room',  label: '房间列表维护', emoji: '🚪' },
  { key: 'inventory', label: '耗材管理', emoji: '📦' },
  { key: 'audit', label: '日志和管理', emoji: '📋' },
  { key: 'perm',  label: '权限对照表', emoji: '🔐' },
]
// ★ v3.0: admin 看全部 tab，manager(主管) 只看耗材管理
const tabs = computed(() => {
  if (auth.role === 'manager') return allTabs.filter(t => t.key === 'inventory')
  return allTabs
})
const activeTab = ref('staff')

// ========== Data ==========
const staffList = ref([])
const roomList = ref([])
// ★ v7.0: 快速新增房间
const quickRoomName = ref('')
const quickRoomType = ref('')
const auditLogs = ref([])
const inventoryItems = ref([])       // v3.0 耗材列表
const invInboundForm = ref({ itemId: null, qty: '', note: '' })  // 进货表单
const invNewItemForm = ref({ name: '', unit: '支', stock: 0 })  // 新增耗材表单
const showInvNewItem = ref(false)    // v3.0
const inventoryLoading = ref(false)  // v3.0
const invFileInput = ref(null)       // v3.0 Excel导入
const invImportResults = ref([])     // v3.0
const invImportSummary = ref({})     // v3.0
const invImportError = ref('')       // v3.0
// v4.1: 库存调整
const showAdjustModal = ref(false)
const adjustTarget = ref(null)
const adjustDelta = ref(0)
const adjustNote = ref('')
// v4.1: 日志
const showLogsModal = ref(false)
const logItems = ref([])
const logTargetName = ref('')
const auditLoading = ref(false)

// ========== Import ==========
const showImportModal = ref(false)
const importText = ref('')
const importing = ref(false)
const importResults = ref([])
const importError = ref('')

// ========== Staff Modal ==========
const showStaffModal = ref(false)
const editingStaff = ref(null)
const staffSaving = ref(false)
const staffModalError = ref('')
const staffForm = reactive({
  name: '',
  department: '',
  role: '',
  pin: '',
})

// ========== Room Modal ==========
const showRoomModal = ref(false)
const editingRoom = ref(null)
const roomSaving = ref(false)
const roomModalError = ref('')
const roomForm = reactive({
  name: '',
  type: '',
  capacity: 1,
  equipmentTagsStr: '',
})

// ========== Delete Confirm ==========
const showDeleteConfirm = ref(false)
const deleteConfirmText = ref('')
const deleteTargetType = ref('')   // 'staff' | 'room'
const deleteTargetId = ref('')
const deleteExecuting = ref(false)

// ========== Force Operations ==========
const forceDeleteId = ref('')
const forceDeleteReason = ref('')
const forceDeleting = ref(false)
const forceRenameId = ref('')
const forceRenameNewName = ref('')
const forceRenameReason = ref('')
const forceRenaming = ref(false)
const forceOpMsg = ref('')
const forceOpError = ref(false)

// ========== Toast ==========
const toastMsg = ref('')
const toastSuccess = ref(true)
let toastTimer = null

// ========== Role Labels ==========
const roleLabels = {
  reception: '前台',
  nurse: '护士',
  assistant: '医助',
  doctor: '医生',
  manager: '主管',
  admin: '管理员',
}

function roleLabel(role) {
  return roleLabels[role] || role
}

// ========== Password Gate ==========
async function verifyPassword() {
  if (!adminPassword.value.trim() || verifying.value) return
  verifying.value = true
  gateError.value = ''

  try {
    // Verify admin password via WebSocket or REST
    const res = await send('AUTH_ADMIN_VERIFY', {
      password: adminPassword.value.trim(),
    })

    if (res.error) {
      gateError.value = res.error || '密码错误'
      return
    }

    authenticated.value = true
    auth.setAdmin(true)
    // Load initial data
    await Promise.all([
      fetchStaffList(),
      fetchRoomList(),
      fetchAuditLogs(),
    ])
  } catch (err) {
    gateError.value = err.message || '验证失败，请稍后重试'
  } finally {
    verifying.value = false
  }
}

// ========== Data Fetching ==========
async function fetchStaffList() {
  try {
    const res = await fetch('/api/admin/staff', {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!res.ok) throw new Error('获取人员列表失败')
    const data = await res.json()
    staffList.value = data.staff || data || []
  } catch (err) {
    console.error('[Admin] 获取人员列表失败:', err)
  }
}

async function fetchRoomList() {
  try {
    const res = await fetch('/api/admin/rooms', {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!res.ok) throw new Error('获取房间列表失败')
    const data = await res.json()
    roomList.value = data.rooms || data || []
  } catch (err) {
    console.error('[Admin] 获取房间列表失败:', err)
  }
}

async function fetchAuditLogs() {
  auditLoading.value = true
  try {
    const res = await fetch('/api/admin/operations', {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!res.ok) throw new Error('获取审计日志失败')
    const data = await res.json()
    auditLogs.value = data.operations || data || []
  } catch (err) {
    console.error('[Admin] 获取审计日志失败:', err)
  } finally {
    auditLoading.value = false
  }
}

// ========== Staff CRUD ==========
function openStaffCreate() {
  editingStaff.value = null
  staffForm.name = ''
  staffForm.department = ''
  staffForm.role = ''
  staffForm.pin = ''
  staffModalError.value = ''
  showStaffModal.value = true
}

function openStaffEdit(staff) {
  editingStaff.value = staff
  staffForm.name = staff.name
  staffForm.department = staff.department || ''
  staffForm.role = staff.role
  staffForm.pin = ''
  staffModalError.value = ''
  showStaffModal.value = true
}

async function saveStaff() {
  if (!staffForm.name.trim() || !staffForm.role) return
  staffSaving.value = true
  staffModalError.value = ''

  try {
    if (editingStaff.value) {
      // Update
      const payload = {
        staffId: editingStaff.value.id,
        name: staffForm.name.trim(),
        department: staffForm.department.trim(),
        role: staffForm.role,
      }
      if (staffForm.pin.trim()) {
        payload.pin = staffForm.pin.trim()
      }
      await send('ADMIN_STAFF_UPDATE', payload)
      showToast('人员信息已更新')
    } else {
      // Create
      await send('ADMIN_STAFF_CREATE', {
        name: staffForm.name.trim(),
        department: staffForm.department.trim(),
        role: staffForm.role,
        pin: staffForm.pin.trim(),
      })
      showToast('人员创建成功')
    }
    showStaffModal.value = false
    await fetchStaffList()
  } catch (err) {
    staffModalError.value = err.message || '操作失败'
  } finally {
    staffSaving.value = false
  }
}

function confirmDeleteStaff(staff) {
  deleteTargetType.value = 'staff'
  deleteTargetId.value = staff.id
  deleteConfirmText.value = `确定要删除人员「${staff.name}」吗？`
  deleteExecuting.value = false
  showDeleteConfirm.value = true
}

// ========== Room CRUD ==========
// ★ v7.0: 快速新增房间（无需弹窗）
async function quickAddRoom() {
  const name = quickRoomName.value.trim()
  if (!name) return
  try {
    await send('ADMIN_ROOM_CREATE', {
      name,
      type: quickRoomType.value || undefined,
      capacity: 1,
    })
    quickRoomName.value = ''
    quickRoomType.value = ''
    showToast('房间已添加')
    await fetchRoomList()
  } catch (err) {
    showToast(err.message || '添加失败', false)
  }
}

function openRoomCreate() {
  editingRoom.value = null
  roomForm.name = ''
  roomForm.type = ''
  roomForm.capacity = 1
  roomForm.equipmentTagsStr = ''
  roomModalError.value = ''
  showRoomModal.value = true
}

function openRoomEdit(room) {
  editingRoom.value = room
  roomForm.name = room.name
  roomForm.type = room.type || ''
  roomForm.capacity = room.capacity || 1
  roomForm.equipmentTagsStr = room.equipmentTags ? room.equipmentTags.join(', ') : ''
  roomModalError.value = ''
  showRoomModal.value = true
}

function parseTags(str) {
  return str
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(Boolean)
}

async function saveRoom() {
  if (!roomForm.name.trim()) return
  roomSaving.value = true
  roomModalError.value = ''

  const tags = parseTags(roomForm.equipmentTagsStr)

  try {
    if (editingRoom.value) {
      // Update
      await send('ADMIN_ROOM_UPDATE', {
        roomId: editingRoom.value.id,
        name: roomForm.name.trim(),
        type: roomForm.type || undefined,
        capacity: roomForm.capacity,
        equipmentTags: tags.length > 0 ? tags : undefined,
      })
      showToast('房间配置已更新')
    } else {
      // Create
      await send('ADMIN_ROOM_CREATE', {
        name: roomForm.name.trim(),
        type: roomForm.type || undefined,
        capacity: roomForm.capacity,
        equipmentTags: tags,
      })
      showToast('房间创建成功')
    }
    showRoomModal.value = false
    await fetchRoomList()
  } catch (err) {
    roomModalError.value = err.message || '操作失败'
  } finally {
    roomSaving.value = false
  }
}

function confirmDeleteRoom(room) {
  deleteTargetType.value = 'room'
  deleteTargetId.value = room.id
  deleteConfirmText.value = `确定要删除房间「${room.name}」吗？`
  deleteExecuting.value = false
  showDeleteConfirm.value = true
}

// ========== Delete Execution ==========
async function executeDelete() {
  deleteExecuting.value = true
  try {
    if (deleteTargetType.value === 'staff') {
      await send('ADMIN_STAFF_DELETE', { staffId: deleteTargetId.value })
      showToast('人员已删除')
      await fetchStaffList()
    } else if (deleteTargetType.value === 'room') {
      await send('ADMIN_ROOM_UPDATE', {
        roomId: deleteTargetId.value,
        disabled: true,
      })
      showToast('房间已停用')
      await fetchRoomList()
    }
    showDeleteConfirm.value = false
  } catch (err) {
    showToast(err.message || '删除失败', false)
  } finally {
    deleteExecuting.value = false
  }
}

// ========== Import Functions ==========
function openImport() {
  importText.value = ''
  importResults.value = []
  importError.value = ''
  showImportModal.value = true
}

async function executeImport() {
  const text = importText.value.trim()
  if (!text) return
  importing.value = true
  importError.value = ''
  importResults.value = []

  // 解析：每行逗号分隔 → 姓名,密码,科室,角色
  const lines = text.split('\n').filter(l => l.trim())
  const rows = lines.map(line => {
    const parts = line.split(',').map(s => s.trim())
    return {
      name: parts[0] || '',
      pin: parts[1] || '',
      department: parts[2] || '',
      role: parts[3] || ''
    }
  }).filter(r => r.name)

  if (rows.length === 0) {
    importError.value = '未识别到有效数据行'
    importing.value = false
    return
  }

  try {
    const result = await send('ADMIN_STAFF_BULK_IMPORT', { rows })
    if (result.success && result.payload?.results) {
      importResults.value = result.payload.results
    }
    await fetchStaffList()
  } catch (e) {
    importError.value = e.message || '导入失败'
  } finally {
    importing.value = false
  }
}

// ========== Permissions Matrix Data ==========
const permRoles = [
  { key: 'reception', label: '前台' },
  { key: 'nurse', label: '护士' },
  { key: 'assistant', label: '医助' },
  { key: 'manager', label: '主管' },
  { key: 'doctor', label: '医生' },
]
const permOperations = [
  { key: 'create', label: '建单', roles: ['reception','nurse','manager'] },
  { key: 'advance', label: '推进状态', roles: ['reception','nurse','assistant','manager'] },
  { key: 'room', label: '变更房间', roles: ['reception','nurse','assistant','manager'] },
  { key: 'handover', label: '交接', roles: ['nurse','assistant','manager'] },
  { key: 'note', label: '添加备注', roles: ['reception','nurse','assistant','manager','doctor'] },
  { key: 'treatment', label: '录入治疗方案', roles: ['assistant','manager'] },
  { key: 'force', label: '强制干预', roles: ['manager'] },
  { key: 'admin', label: '管理后台', roles: [] },
]

// ========== Force Operations on Visits ==========
async function executeForceDelete() {
  if (!forceDeleteId.value.trim() || forceDeleting.value) return
  forceDeleting.value = true
  forceOpMsg.value = ''
  forceOpError.value = false
  try {
    await send('ADMIN_VISIT_FORCE_DELETE', {
      visitId: forceDeleteId.value.trim(),
      reason: forceDeleteReason.value.trim() || '管理员手动删除',
    })
    showToast('接诊单已强制删除')
    forceDeleteId.value = ''
    forceDeleteReason.value = ''
    forceOpMsg.value = '✅ 接诊单已成功删除'
  } catch (err) {
    forceOpMsg.value = '❌ ' + (err.message || '删除失败')
    forceOpError.value = true
  } finally {
    forceDeleting.value = false
  }
}

async function executeForceRename() {
  if (!forceRenameId.value.trim() || !forceRenameNewName.value.trim() || forceRenaming.value) return
  forceRenaming.value = true
  forceOpMsg.value = ''
  forceOpError.value = false
  try {
    await send('ADMIN_VISIT_FORCE_RENAME', {
      visitId: forceRenameId.value.trim(),
      newGuestName: forceRenameNewName.value.trim(),
      reason: forceRenameReason.value.trim() || '管理员手动改名',
    })
    showToast('接诊单已改名')
    forceRenameId.value = ''
    forceRenameNewName.value = ''
    forceRenameReason.value = ''
    forceOpMsg.value = '✅ 接诊单姓名已成功修改'
  } catch (err) {
    forceOpMsg.value = '❌ ' + (err.message || '改名失败')
    forceOpError.value = true
  } finally {
    forceRenaming.value = false
  }
}

// ========== Audit Helpers ==========
function formatTime(ts) {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return ts
  }
}

function opClass(op) {
  if (!op) return ''
  if (op.includes('DELETE') || op.includes('delete')) return 'op-danger'
  if (op.includes('CREATE') || op.includes('create')) return 'op-create'
  if (op.includes('UPDATE') || op.includes('update')) return 'op-update'
  if (op.includes('FORCE')) return 'op-force'
  return 'op-default'
}

function formatDetails(details) {
  if (!details) return '—'
  if (typeof details === 'string') {
    try { details = JSON.parse(details) } catch { return details.length > 60 ? details.slice(0, 60) + '…' : details }
  }
  const str = JSON.stringify(details, null, 0)
  return str.length > 80 ? str.slice(0, 80) + '…' : str
}

// ========== Toast ==========
function showToast(msg, success = true) {
  toastMsg.value = msg
  toastSuccess.value = success
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, 3000)
}

// ========== Logout ==========
function handleLogout() {
  auth.logout()
  router.push('/login')
}

// ========== v3.0 Inventory ==========
async function loadInventory() {
  try {
    const res = await send('INVENTORY_LIST', {})
    if (res.success) inventoryItems.value = res.payload.items || []
  } catch(e) { console.warn('[Inv] load fail:', e.message) }
}

async function doCreateItem() {
  const f = invNewItemForm.value
  if (!f.name.trim()) return
  try {
    const res = await send('INVENTORY_CREATE_ITEM', { name: f.name.trim(), unit: f.unit || '支', safetyStock: 5, initialStock: f.stock || 0 })
    if (res.success) {
      showToast(`耗材「${f.name}」创建成功`)
      invNewItemForm.value = { name: '', unit: '支', stock: 0 }
      showInvNewItem.value = false
      await loadInventory()
    } else showToast(res.error || '创建失败', false)
  } catch(e) { showToast(e.message, false) }
}

async function doInbound() {
  const f = invInboundForm.value
  if (!f.itemId || !f.qty || f.qty <= 0) return
  try {
    const res = await send('INVENTORY_INBOUND', { itemId: f.itemId, quantity: f.qty, note: f.note || '' })
    if (res.success) {
      const item = inventoryItems.value.find(i => i.id === f.itemId)
      showToast(`${item?.name || ''} 入库 ${f.qty} 成功`)
      invInboundForm.value = { itemId: null, qty: '', note: '' }
      await loadInventory()
    } else showToast(res.error || '入库失败', false)
  } catch(e) { showToast(e.message, false) }
}

// v4.1: 库存调整
function openAdjust(item) {
  adjustTarget.value = item
  adjustDelta.value = 0
  adjustNote.value = ''
  showAdjustModal.value = true
}
async function doAdjust() {
  if (!adjustDelta.value || adjustDelta.value === 0) {
    showToast('调整量不能为0', false); return
  }
  try {
    const res = await send('INVENTORY_ADJUST', { itemId: adjustTarget.value.id, delta: adjustDelta.value })
    if (res.success) {
      showToast(`${adjustTarget.value.name} ${adjustDelta.value > 0 ? '+' : ''}${adjustDelta.value}（库存 ${res.payload.new_stock}）`)
      showAdjustModal.value = false
      await loadInventory()
    } else showToast(res.error || '调整失败', false)
  } catch(e) { showToast(e.message, false) }
}

// v4.1: 操作日志
async function openLogs(item) {
  logTargetName.value = item.name
  try {
    const res = await send('INVENTORY_LOGS', { itemId: item.id, limit: 50 })
    logItems.value = res.success ? (res.payload.logs || []) : []
    showLogsModal.value = true
  } catch(e) { showToast(e.message, false) }
}
function fmtLogType(t, note) {
  if (note && note.startsWith('[调整]')) return '库存调整'
  const map = { inbound: '进货', ordered: '开单', consumed: '核销' }
  return map[t] || t
}

async function doToggleItem(itemId) {
  try {
    const res = await send('INVENTORY_TOGGLE_ITEM', { itemId })
    if (res.success) {
      showToast('耗材状态已更新')
      await loadInventory()
    } else showToast(res.error || '操作失败', false)
  } catch(e) { showToast(e.message, false) }
}

// ★ v3.0: Excel 批量导入
function triggerImport() { invFileInput.value?.click() }

async function handleImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  invImportError.value = ''
  invImportResults.value = []
  invImportSummary.value = {}
  importing.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/admin/inventory/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
      body: formData,
    })

    const data = await res.json()
    if (data.success) {
      invImportResults.value = data.results || []
      invImportSummary.value = data.summary || {}
      showToast('导入完成')
      await loadInventory()
    } else {
      invImportError.value = data.error || '导入失败'
    }
  } catch (e) {
    invImportError.value = e.message || '导入失败'
  } finally {
    importing.value = false
    // 重置 file input 以允许重复导入同一文件
    e.target.value = ''
  }
}

// Reload inventory when switching to inventory tab
watch(activeTab, (tab) => { if (tab === 'inventory') loadInventory() })

// ★ v4.1: WS 就绪后再拉库存（解决 DashboardView 同款时序陷阱）
watch(connected, (val) => {
  if (val) setTimeout(() => { if (activeTab.value === 'inventory') loadInventory() }, 500)
}, { immediate: true })

// ★ v3.0: 主管默认激活耗材管理 tab
watch(tabs, (newTabs) => {
  if (newTabs.length === 1) activeTab.value = newTabs[0].key
}, { immediate: true })

// ========== Lifecycle ==========
onMounted(() => {
  nextTick(() => pwdInput.value?.focus())
})
</script>

<style scoped>
/* ========== Layout ========== */
.admin-view {
  min-height: 100vh;
  background: var(--bg, #f1f5f9);
}

.admin-panel {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ========== Password Gate ========== */
.gate-overlay {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  padding: 24px;
}

.gate-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 40px 32px 36px;
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.gate-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.gate-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

.gate-subtitle {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--text2, #64748b);
}

.gate-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gate-input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--border, #e2e8f0);
  border-radius: 10px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
  font-family: 'Courier New', monospace;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.gate-input:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
}

.gate-error {
  margin: -4px 0 0;
  font-size: 13px;
  color: var(--danger, #dc2626);
}

.gate-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.gate-btn:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.gate-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ========== Header ========== */
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 24px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-badge {
  padding: 6px 12px;
  background: var(--primary-light, #dbeafe);
  color: var(--primary, #2563eb);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}

.logout-btn {
  padding: 6px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background: #fff;
  color: var(--text2, #64748b);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.logout-btn:hover {
  border-color: var(--danger, #dc2626);
  color: var(--danger, #dc2626);
}

/* ========== Tab Bar ========== */
.tab-bar {
  display: flex;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid var(--border, #e2e8f0);
  gap: 2px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 20px;
  border: none;
  background: none;
  color: var(--text2, #64748b);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
}

.tab-btn.active {
  color: var(--primary, #2563eb);
  border-bottom-color: var(--primary, #2563eb);
}

.tab-emoji {
  font-size: 16px;
}

/* ========== Tab Content ========== */
.tab-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.content-section {
  max-width: 1100px;
  margin: 0 auto;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

/* ★ v7.0: 快速新增 */
.quick-add-bar {
  display: flex; gap: 8px; margin-bottom: 12px; padding: 10px;
  background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;
}
.quick-input {
  flex: 1; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px;
  font-size: 13px; outline: none;
}
.quick-input:focus { border-color: #6366f1; }
.quick-select {
  padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px;
  font-size: 13px; background: #fff;
}
.btn-sm { padding: 6px 12px; font-size: 13px; white-space: nowrap; }

/* ========== Data Table ========== */
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.data-table thead {
  background: var(--bg, #f8fafc);
}

.data-table th {
  padding: 12px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text2, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.data-table td {
  padding: 12px 14px;
  font-size: 14px;
  color: var(--text, #1e293b);
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.data-table tbody tr:hover {
  background: var(--bg, #f8fafc);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

/* Role tags */
.role-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.role-reception { background: #fef3c7; color: #92400e; }
.role-nurse     { background: #dbeafe; color: #1d4ed8; }
.role-assistant { background: #fce7f3; color: #be185d; }
.role-doctor    { background: #d1fae5; color: #065f46; }
.role-manager   { background: #e9d5ff; color: #7c3aed; }
.role-admin     { background: #fee2e2; color: #b91c1c; }

/* Status dot */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.status-dot.active { background: #22c55e; }
.status-dot.inactive { background: #94a3b8; }

/* Action buttons */
.action-cell {
  white-space: nowrap;
}

.action-btn {
  padding: 4px 8px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  margin-right: 4px;
  transition: all 0.15s;
  line-height: 1;
}

.action-btn:hover {
  background: var(--bg, #f8fafc);
  border-color: var(--primary, #2563eb);
}

.action-btn.danger:hover {
  background: #fef2f2;
  border-color: var(--danger, #dc2626);
}

/* Tag chips */
.tag-chip {
  display: inline-block;
  padding: 2px 8px;
  margin: 1px 3px;
  background: #e2e8f0;
  border-radius: 4px;
  font-size: 11px;
  color: #475569;
}

.text-muted {
  color: var(--text2, #64748b);
  font-style: italic;
}

/* ========== Buttons ========== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--primary, #2563eb);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-outline {
  background: #fff;
  color: var(--text, #1e293b);
  border: 1px solid var(--border, #e2e8f0);
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--primary, #2563eb);
  color: var(--primary, #2563eb);
}

.btn-danger {
  background: var(--danger, #dc2626);
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background: #b91c1c;
}

.btn-warning {
  background: #f59e0b;
  color: #fff;
}

.btn-warning:hover:not(:disabled) {
  background: #d97706;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ========== Force Ops Card ========== */
.force-ops-card {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.force-ops-title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #1e293b);
}

.force-ops-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.force-op label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text2, #64748b);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.force-op-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.form-input-sm {
  padding: 6px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
  font-family: inherit;
  flex: 1;
  min-width: 100px;
  box-sizing: border-box;
}

.form-input-sm:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
}

.force-op-msg {
  margin: 12px 0 0;
  font-size: 13px;
  color: #16a34a;
}

.force-op-msg.error {
  color: var(--danger, #dc2626);
}

/* ========== Audit Log Table ========== */
.audit-table .time-cell {
  white-space: nowrap;
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--text2, #64748b);
}

.audit-table .detail-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text2, #64748b);
  cursor: default;
}

.op-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.op-create  { background: #d1fae5; color: #065f46; }
.op-update  { background: #dbeafe; color: #1d4ed8; }
.op-danger  { background: #fee2e2; color: #b91c1c; }
.op-force   { background: #fef3c7; color: #92400e; }
.op-default { background: #f1f5f9; color: #475569; }

/* ========== Empty State ========== */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text2, #64748b);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

/* ========== Toast ========== */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.toast.success { background: #16a34a; }
.toast.error   { background: var(--danger, #dc2626); }

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* ========== Modal (shared patterns from NurseView) ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal-dialog {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  width: 100%;
  max-width: 480px;
  overflow: hidden;
}

.modal-sm {
  max-width: 380px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #1e293b);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 8px;
  color: var(--text2, #64748b);
  transition: background 0.15s;
}

.modal-close:hover {
  background: var(--bg, #f8fafc);
}

.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid var(--border, #e2e8f0);
}

/* Form elements in modals */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text2, #64748b);
}

.required {
  color: var(--danger, #dc2626);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
}

.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 10px 36px 10px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text, #1e293b);
  background: var(--bg, #f8fafc);
  appearance: none;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s;
}

.form-select:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
}

.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text2, #64748b);
  font-size: 12px;
}

.form-error {
  margin: -4px 0 0;
  font-size: 13px;
  color: var(--danger, #dc2626);
}

/* Confirm modal */
.confirm-text {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--text, #1e293b);
  line-height: 1.5;
}

.confirm-text strong {
  color: var(--danger, #dc2626);
}

.confirm-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text2, #64748b);
}

/* ========== Spinner ========== */
.spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== Import modal ========== */
.import-help { font-size: 12px; color: #64748b; background: #f0f9ff; padding: 10px; border-radius: 8px; margin-bottom: 12px; line-height: 1.6; }
.import-textarea { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: monospace; resize: vertical; box-sizing: border-box; }
.import-results { margin-top: 12px; max-height: 200px; overflow-y: auto; }
.import-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.ir-ok .ir-msg { color: #16a34a; }
.ir-err .ir-msg { color: #dc2626; }
.ir-name { font-weight: 600; min-width: 60px; }

.import-summary { font-size: 13px; color: #16a34a; font-weight: 600; margin-bottom: 8px; }

/* ========== Permission table ========== */
.perm-table-wrap { overflow-x: auto; }
.perm-table th, .perm-table td { text-align: center; }
.perm-table .perm-op-name { text-align: left; font-weight: 600; }
.perm-cell { font-size: 16px; }
.perm-yes { color: #16a34a; }
.perm-no { color: #cbd5e1; }
.perm-hint { font-size: 11px; color: #94a3b8; }
.perm-notes { margin-top: 16px; padding: 12px; background: #fffbeb; border-radius: 8px; font-size: 13px; color: #92400e; }
.perm-notes ul { margin: 6px 0 0 16px; padding: 0; }
.perm-notes li { padding: 2px 0; }

/* Modal large */
.modal-lg { max-width: 520px; }

.text-muted { color: #94a3b8; }

/* v3.0 Inventory */
.inv-form-card { background: var(--card-bg, #f8fafc); border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.form-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.badge-active { background: #dcfce7; color: #16a34a; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.badge-inactive { background: #f1f5f9; color: #94a3b8; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.inactive { opacity: 0.6; }
.stock-low { color: #dc2626; font-weight: 700; }
.empty-hint { text-align: center; color: #94a3b8; padding: 20px; font-size: 13px; }
</style>
