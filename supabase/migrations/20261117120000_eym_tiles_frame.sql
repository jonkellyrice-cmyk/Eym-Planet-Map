-- Eym Planet Map: name the Region layer's frame on every stored tile.
--
-- Until now a region tile's frame was held in eym_tiles.z, as a number: 1 = caren, 2 = garyk,
-- 5 = caren-garyk-sea (see regionFrames() in scripts/eym-region-layer.mjs; 0, 3 and 4 were the
-- three unnamed continents, which are no longer framed and have no stored tiles).
--
-- This migration only adds and fills; it removes and renames nothing:
--   1. a nullable text column, frame;
--   2. frame filled in for the region rows already stored, from z;
--   3. a unique index on (layer, kind, frame, x, y) for rows that have a frame.
-- z and the existing unique key on (layer, kind, z, x, y) stay as they are, so the web app keeps
-- working; it now also writes frame on every region row it records.
-- Safe to run more than once. Runs in one transaction.
-- Applied to eym-world on 2026-11-17 with the owner's yes.

begin;

alter table public.eym_tiles add column if not exists frame text;

update public.eym_tiles
   set frame = case z when 1 then 'caren' when 2 then 'garyk' when 5 then 'caren-garyk-sea' end
 where layer = 'region' and frame is null and z in (1, 2, 5);

create unique index if not exists eym_tiles_layer_kind_frame_x_y
    on public.eym_tiles (layer, kind, frame, x, y)
 where frame is not null;

comment on column public.eym_tiles.frame is
  'Region layer frame id (caren, garyk, caren-garyk-sea); z holds the same frame as a number for now.';

commit;
