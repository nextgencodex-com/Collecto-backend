-- The owner account is always id 0 and riders are numbered 1..n without gaps, so the ids shown in the
-- app (R1, R2, R3 ...) never skip a number. Rider ids are assigned as MAX(id)+1 under an advisory lock
-- (see riders.repository.ts), not from the sequence.

-- 1. Move the owner to id 0. Rows that reference the user follow through ON UPDATE CASCADE.
UPDATE "User" SET "id" = 0 WHERE "role" = 'OWNER' AND "id" <> 0;

-- 2. Renumber existing riders 1..n. Two phases so no intermediate primary key collides.
UPDATE "User" SET "id" = "id" + 1000000 WHERE "role" = 'RIDER';
UPDATE "User" u SET "id" = r.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS n FROM "User" WHERE "role" = 'RIDER'
) r
WHERE u."id" = r."id";

-- 3. Keep it that way.
ALTER TABLE "User" ADD CONSTRAINT "User_owner_id_chk"
  CHECK (("role" = 'OWNER' AND "id" = 0) OR ("role" = 'RIDER' AND "id" > 0));
