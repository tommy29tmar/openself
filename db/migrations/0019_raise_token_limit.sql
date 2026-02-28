-- Raise daily token limit from old default (150k) to new default (500k).
-- Only updates rows still at the old default; user-customized values are untouched.
UPDATE llm_limits SET daily_token_limit = 500000 WHERE daily_token_limit = 150000;
