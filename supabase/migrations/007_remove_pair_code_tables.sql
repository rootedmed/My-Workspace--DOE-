-- Remove pair-code discovery tables now that V1 uses global Discover feed.
-- Safe for environments where these tables may not exist.

drop table if exists pair_links cascade;
drop table if exists pair_codes cascade;
