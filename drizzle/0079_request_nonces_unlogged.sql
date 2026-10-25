CREATE UNLOGGED TABLE IF NOT EXISTS "request_nonces" (
	"session_id" bigint NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_nonces_pkey" PRIMARY KEY("session_id","nonce")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_nonces_expires_at_idx" ON "request_nonces" USING btree ("expires_at");
