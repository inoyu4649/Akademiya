-- Phase 7+: 조직/반 개설 거절 알림 타입 추가
USE akademiya;

ALTER TABLE notifications
  MODIFY COLUMN type ENUM(
    'new_assignment',
    'deadline_1d',
    'deadline_3h',
    'deadline_1h',
    'deadline_10m',
    'broadcast',
    'org_rejected',
    'class_rejected'
  ) NOT NULL;
