-- ═══════════════════════════════
-- 初始数据填充 (v3.2 — 5角色+科室)
-- ═══════════════════════════════

-- ── 人员 ──
INSERT INTO staff (id, name, role, department, pin, created_at) VALUES
(1, '陈杨',  'doctor',    '',        '123',  1700000000000),
(2, '屈红',  'manager',   '',        '123',  1700000000000),
(3, '小王',  'nurse',     '皮肤科',  NULL,   1700000000000),
(4, '小李',  'nurse',     '注射科',  NULL,   1700000000000),
(5, '美美',  'assistant', '皮肤科',  NULL,   1700000000000),
(6, '赵姐',  'nurse',     '皮肤科',  NULL,   1700000000000),
(7, '慧慧',  'nurse',     '注射科',  '123',  1700000000000),
(8, '管理员','admin',     '',        '123',  1700000000000),
(9, '小张',  'reception', '前台',    '123',  1700000000000);

-- ── 房间 ──
INSERT INTO rooms (id, name, type, capacity, equipment_tags, sort_order) VALUES
(1, '1诊室',   'consultation', 1, NULL,              1),
(2, '2诊室',   'consultation', 1, NULL,              2),
(3, '激光室',  'treatment',    1, '["皮秒","热玛吉"]', 3),
(4, '注射室',  'treatment',    1, NULL,              4),
(5, '休息区A', 'recovery',     3, NULL,              5),
(6, '休息区B', 'recovery',     3, NULL,              6),
(7, '用餐区',  'dining',       4, NULL,              7),
(8, '等候区',  'waiting',      8, NULL,              8),
(9, '敷麻区',  'recovery',     3, NULL,              9);

-- ── 状态流转配置（allowed_roles 扩展为全角色）──
INSERT INTO status_transitions (from_status, to_status, requires_room, default_duration_min, alert_threshold_min, allowed_roles) VALUES
('ARRIVED_WAITING',    'DETECTION_PHOTO',     1, 15,  NULL, '["reception","nurse","assistant","manager"]'),
('DETECTION_PHOTO',    'IN_CLINIC_WAITING',   0, 5,   NULL, '["reception","nurse","assistant","manager"]'),
('IN_CLINIC_WAITING',  'CONSULTATION',        1, 20,  NULL, '["reception","nurse","assistant","manager"]'),
('CONSULTATION',       'PRE_TREATMENT_CARE',  0, 10,  NULL, '["reception","nurse","assistant","manager"]'),
('PRE_TREATMENT_CARE', 'NUMBING',             1, 5,   NULL, '["reception","nurse","assistant","manager"]'),
('NUMBING',            'PRE_OP_WAITING',      0, 60,  75,   '["reception","nurse","assistant","manager"]'),
('PRE_OP_WAITING',     'IN_OPERATION',        1, NULL, 15,   '["reception","nurse","assistant","manager"]'),
('IN_OPERATION',       'POST_TREATMENT_CARE', 1, 30,  45,   '["reception","nurse","assistant","manager"]'),
('POST_TREATMENT_CARE','DINING',              0, 20,  NULL, '["reception","nurse","assistant","manager"]'),
('POST_TREATMENT_CARE','DISCHARGED',          0, NULL,NULL, '["reception","nurse","assistant","manager"]'),
('DINING',             'DISCHARGED',          0, 30,  NULL, '["reception","nurse","assistant","manager"]'),
('*',                  'DISCHARGED',          0, NULL,NULL, '["reception","nurse","assistant","manager","admin"]');
