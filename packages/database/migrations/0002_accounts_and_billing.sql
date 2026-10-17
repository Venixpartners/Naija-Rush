CREATE TABLE "naijarush"."login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"guest_session_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "naijarush"."subscriptions" ADD COLUMN "provider_email_token" text;--> statement-breakpoint
ALTER TABLE "naijarush"."subscriptions" ADD COLUMN "provider_customer_code" text;--> statement-breakpoint
ALTER TABLE "naijarush"."login_tokens" ADD CONSTRAINT "login_tokens_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_uq" ON "naijarush"."login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "naijarush"."login_tokens" USING btree ("email","created_at");--> statement-breakpoint
ALTER TABLE "naijarush"."login_tokens" ENABLE ROW LEVEL SECURITY;
