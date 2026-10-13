-- Audit a manual support release without changing expiry, status or credits.
begin;
alter table radas_v4.generations add column if not exists unknown_release_reason text;
alter table radas_v4.generations add column if not exists unknown_release_by text;
alter table radas_v4.generations drop constraint if exists generations_unknown_release_check;
alter table radas_v4.generations add constraint generations_unknown_release_check check (
  (unknown_released_at is null and unknown_release_reason is null and unknown_release_by is null)
  or
  (unknown_released_at is not null and status='unknown' and provider_job_id is null and not refunded
    and unknown_released_at>=created_at and (
      (unknown_release_reason is null and unknown_release_by is null and unknown_released_at>=expires_at)
      or
      (unknown_release_reason is not null and length(btrim(unknown_release_reason)) between 10 and 300
        and unknown_release_by is not null and length(btrim(unknown_release_by)) between 1 and 128)
    ))
);
commit;
