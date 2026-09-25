-- The flat rules were converted into `matcher` and `options` by the code migration that runs
-- after 20260926090000_matcher_rules (`legacy-rules.ts`). Drop the old column; its CHECK goes
-- with it.
ALTER TABLE sources DROP COLUMN rules;
