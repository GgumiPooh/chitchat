-- 0027a — `user_emoticon_prefs.sort_order`를 nullable로.
--
-- 이 문장은 `0027_sparse_pack_position.sql` 안에도 들어가 있다. 이 파일은 **0027을
-- 이미 적용한 데이터베이스**를 위한 것이다 — drizzle의 저널이 0027을 적용 완료로
-- 기록해 두었으므로 `pnpm db:migrate`는 그 파일을 다시 읽지 않는다. 아직 0027을
-- 적용하지 않은 환경은 이 파일이 필요 없다.
--
-- 왜 필요한가: jandh와 jandh-emoticons가 데이터베이스 하나를 공유하는데 지금은
-- jandh만 배포된다. jandh의 새 코드는 `position`만 쓰고 `sort_order`는 건드리지
-- 않으므로, NOT NULL에 기본값이 없는 컬럼은 첫 재정렬·숨기기 INSERT를 거부한다.
-- 반대로 배포된 채로 남는 jandh-emoticons는 아직 `sort_order`를 읽고 쓴다 —
-- 그쪽의 `coalesce(sort_order, 32767)`가 여기서 생기는 NULL을 이미 견딘다.
--
-- 컬럼을 아예 지우는 것은 `0028_drop_pack_sort_order.sql`이고, 그것은
-- jandh-emoticons를 배포할 수 있을 때까지 적용하지 않는다.

ALTER TABLE "user_emoticon_prefs" ALTER COLUMN "sort_order" DROP NOT NULL;
