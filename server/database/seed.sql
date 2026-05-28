-- ═══════════════════════════════
-- 初始数据填充 (v3.3 — 正式人员+房间)
-- ═══════════════════════════════

-- ── 人员 ──
INSERT INTO staff (id, name, role, department, pin, created_at) VALUES
(1, '陈杨',   'admin',     '医生', '123', 1700000000000),
(2, '吴思茹', 'doctor',    '',     '123', 1700000000000),
(3, '师明文', 'doctor',    '',     '123', 1700000000000),
(4, '刘汉梅', 'doctor',    '',     '123', 1700000000000),
(5, '屈红',   'manager',   '',     '123', 1700000000000),
(6, '葛钰',   'assistant', '',     '123', 1700000000000),
(7, '杨婧',   'assistant', '',     '123', 1700000000000),
(8, '张玲玲', 'assistant', '',     '123', 1700000000000),
(9, '吴慧妤', 'nurse',     '',     '123', 1700000000000),
(10, '李梦婷','nurse',     '',     '123', 1700000000000),
(11, '薛云阳','nurse',     '',     '123', 1700000000000),
(12, '周晶晶','nurse',     '',     '123', 1700000000000),
(13, '张晨晨','nurse',     '',     '123', 1700000000000),
(14, '管理员','admin',     '',     '123', 1700000000000);

-- ── 房间 ──
INSERT INTO rooms (id, name, type, capacity, equipment_tags, sort_order) VALUES
(1,  '4楼注射间',   'treatment',     1, NULL, 1),
(2,  '4楼护理1',    'recovery',      1, NULL, 2),
(3,  '4楼护理2',    'recovery',      1, NULL, 3),
(4,  '3楼治疗1',    'treatment',     1, NULL, 4),
(5,  '3楼治疗2',    'treatment',     1, NULL, 5),
(6,  '2楼治疗1',    'treatment',     1, NULL, 6),
(7,  '2楼治疗2',    'treatment',     1, NULL, 7),
(8,  '2楼治疗3',    'treatment',     1, NULL, 8),
(9,  '2楼治疗VIP',  'treatment',     1, NULL, 9),
(10, '3楼休息区',   'recovery',      3, NULL, 10),
(11, '3楼用餐区',   'dining',        3, NULL, 11),
(12, '2楼休息VIP',  'recovery',      3, NULL, 12),
(13, '2楼大厅',     'waiting',       3, NULL, 13),
(14, '3楼面诊1',    'consultation',  1, NULL, 14),
(15, '3楼面诊2',    'consultation',  1, NULL, 15),
(16, '2楼面诊1',    'consultation',  1, NULL, 16),
(17, '2楼面诊2',    'consultation',  1, NULL, 17),
(18, '检测拍照间',  'consultation',  1, NULL, 18),
(19, '化妆区',      'waiting',       3, NULL, 19);

-- ── 状态流转配置（allowed_roles 含 admin）──
INSERT INTO status_transitions (from_status, to_status, requires_room, default_duration_min, alert_threshold_min, allowed_roles) VALUES
('ARRIVED_WAITING',    'DETECTION_PHOTO',     1, 15,  NULL, '["reception","nurse","assistant","manager","admin"]'),
('DETECTION_PHOTO',    'IN_CLINIC_WAITING',   0, 5,   NULL, '["reception","nurse","assistant","manager","admin"]'),
('IN_CLINIC_WAITING',  'CONSULTATION',        1, 20,  NULL, '["reception","nurse","assistant","manager","admin"]'),
('CONSULTATION',       'PRE_TREATMENT_CARE',  0, 10,  NULL, '["reception","nurse","assistant","manager","admin"]'),
('PRE_TREATMENT_CARE', 'NUMBING',             1, 5,   NULL, '["reception","nurse","assistant","manager","admin"]'),
('NUMBING',            'PRE_OP_WAITING',      0, 60,  75,   '["reception","nurse","assistant","manager","admin"]'),
('PRE_OP_WAITING',     'IN_OPERATION',        1, NULL, 15,   '["reception","nurse","assistant","manager","admin"]'),
('IN_OPERATION',       'POST_TREATMENT_CARE', 1, 30,  45,   '["reception","nurse","assistant","manager","admin"]'),
('POST_TREATMENT_CARE','DINING',              0, 20,  NULL, '["reception","nurse","assistant","manager","admin"]'),
('POST_TREATMENT_CARE','DISCHARGED',          0, NULL,NULL, '["reception","nurse","assistant","manager","admin"]'),
('DINING',             'DISCHARGED',          0, 30,  NULL, '["reception","nurse","assistant","manager","admin"]'),
('*',                  'DISCHARGED',          0, NULL,NULL, '["reception","nurse","assistant","manager","admin"]');
