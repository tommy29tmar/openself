-- Add journey_state to sessions (pinned per session, survives turns)
ALTER TABLE sessions ADD COLUMN journey_state TEXT;

-- Add sort_order to facts (item ordering within sections)
ALTER TABLE facts ADD COLUMN sort_order INTEGER DEFAULT 0;
