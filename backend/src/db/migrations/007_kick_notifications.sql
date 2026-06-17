-- 007: 강퇴 알림 타입 추가
ALTER TABLE notifications
  MODIFY COLUMN type ENUM(
    'new_assignment',
    'deadline_1d',
    'deadline_3h',
    'deadline_1h',
    'deadline_10m',
    'broadcast',
    'org_rejected',
    'class_rejected',
    'new_survey',
    'org_kicked',
    'class_kicked'
  ) NOT NULL;
