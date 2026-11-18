-- Apply as the database owner after the base installation.
-- Keep sprint-v1 records, attempts and world records on their original board.
-- Existing generic RPCs continue to use each attempt's own board.
INSERT INTO sprint_private.sprint_boards(id, game_key, rule_version)
VALUES ('sprint-100m:sprint-v2', 'sprint-100m', 'sprint-v2')
ON CONFLICT (id) DO NOTHING;
