CREATE SCHEMA "naijarush";
--> statement-breakpoint
CREATE TABLE "naijarush"."admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"guest_session_id" uuid,
	"user_id" uuid,
	"game_slug" text,
	"challenge_id" uuid,
	"channel" text,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."campaign_participants" (
	"campaign_id" uuid NOT NULL,
	"guest_session_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_participants_campaign_id_guest_session_id_pk" PRIMARY KEY("campaign_id","guest_session_id")
);
--> statement-breakpoint
CREATE TABLE "naijarush"."campaign_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"game_slug" text NOT NULL,
	"kind" text DEFAULT 'sponsored' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"rules_md" text NOT NULL,
	"eligibility" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."challenge_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"game_session_id" uuid NOT NULL,
	"guest_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_attempts_game_session_id_unique" UNIQUE("game_session_id")
);
--> statement-breakpoint
CREATE TABLE "naijarush"."challenge_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"game_session_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"target_score" integer NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_results_game_session_id_unique" UNIQUE("game_session_id")
);
--> statement-breakpoint
CREATE TABLE "naijarush"."challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"game_slug" text NOT NULL,
	"game_version" text NOT NULL,
	"mode" text NOT NULL,
	"seed" text NOT NULL,
	"source_session_id" uuid NOT NULL,
	"creator_guest_id" uuid,
	"creator_user_id" uuid,
	"parent_challenge_id" uuid,
	"display_name" text,
	"target_score" integer NOT NULL,
	"campaign_id" uuid,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_session_id" uuid,
	"user_id" uuid,
	"kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "naijarush"."feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."game_modes" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_slug" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"competitive" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_slug" text NOT NULL,
	"game_version" text NOT NULL,
	"mode" text NOT NULL,
	"seed" text NOT NULL,
	"guest_session_id" uuid NOT NULL,
	"user_id" uuid,
	"challenge_id" uuid,
	"campaign_id" uuid,
	"status" text DEFAULT 'issued' NOT NULL,
	"score" integer,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"stats" jsonb,
	"hidden" boolean DEFAULT false NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "naijarush"."game_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"game_slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."games" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid,
	"first_channel" text,
	"first_challenge_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"guest_session_id" uuid,
	"user_id" uuid,
	"game_session_id" uuid,
	"rank" integer NOT NULL,
	"best_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."leaderboard_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leaderboard_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."leaderboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_slug" text NOT NULL,
	"period" text NOT NULL,
	"campaign_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."media_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."moderation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reporter_guest_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "naijarush"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"product_id" text NOT NULL,
	"provider" text NOT NULL,
	"reference" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'initialized' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "naijarush"."products" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"price_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"provider_plan_code" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."referral_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"guest_session_id" uuid,
	"is_bot" boolean DEFAULT false NOT NULL,
	"landed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_kobo" integer NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."score_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"payload" jsonb,
	"claimed_score" integer,
	"computed_score" integer NOT NULL,
	"status" text NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_submissions_game_session_id_unique" UNIQUE("game_session_id")
);
--> statement-breakpoint
CREATE TABLE "naijarush"."share_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."share_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid,
	"guest_session_id" uuid,
	"event" text NOT NULL,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_subscription_code" text,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"avatar_key" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"age_band" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naijarush"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"role" text DEFAULT 'player' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "naijarush"."auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "naijarush"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."campaign_participants" ADD CONSTRAINT "campaign_participants_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."campaign_rules" ADD CONSTRAINT "campaign_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "naijarush"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."campaigns" ADD CONSTRAINT "campaigns_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "naijarush"."sponsors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."campaigns" ADD CONSTRAINT "campaigns_game_slug_games_slug_fk" FOREIGN KEY ("game_slug") REFERENCES "naijarush"."games"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "naijarush"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenge_attempts" ADD CONSTRAINT "challenge_attempts_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "naijarush"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenge_attempts" ADD CONSTRAINT "challenge_attempts_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenge_results" ADD CONSTRAINT "challenge_results_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "naijarush"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenge_results" ADD CONSTRAINT "challenge_results_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "naijarush"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenges" ADD CONSTRAINT "challenges_game_slug_games_slug_fk" FOREIGN KEY ("game_slug") REFERENCES "naijarush"."games"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenges" ADD CONSTRAINT "challenges_source_session_id_game_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "naijarush"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenges" ADD CONSTRAINT "challenges_creator_guest_id_guest_sessions_id_fk" FOREIGN KEY ("creator_guest_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."challenges" ADD CONSTRAINT "challenges_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "naijarush"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."consents" ADD CONSTRAINT "consents_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "naijarush"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."game_modes" ADD CONSTRAINT "game_modes_game_slug_games_slug_fk" FOREIGN KEY ("game_slug") REFERENCES "naijarush"."games"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."game_sessions" ADD CONSTRAINT "game_sessions_game_slug_games_slug_fk" FOREIGN KEY ("game_slug") REFERENCES "naijarush"."games"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."game_sessions" ADD CONSTRAINT "game_sessions_game_version_game_versions_id_fk" FOREIGN KEY ("game_version") REFERENCES "naijarush"."game_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."game_sessions" ADD CONSTRAINT "game_sessions_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."game_versions" ADD CONSTRAINT "game_versions_game_slug_games_slug_fk" FOREIGN KEY ("game_slug") REFERENCES "naijarush"."games"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."guest_sessions" ADD CONSTRAINT "guest_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_season_id_leaderboard_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "naijarush"."leaderboard_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "naijarush"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."leaderboard_seasons" ADD CONSTRAINT "leaderboard_seasons_leaderboard_id_leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "naijarush"."leaderboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."leaderboards" ADD CONSTRAINT "leaderboards_game_slug_games_slug_fk" FOREIGN KEY ("game_slug") REFERENCES "naijarush"."games"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."payments" ADD CONSTRAINT "payments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "naijarush"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."referral_clicks" ADD CONSTRAINT "referral_clicks_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "naijarush"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."referral_clicks" ADD CONSTRAINT "referral_clicks_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "naijarush"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."score_submissions" ADD CONSTRAINT "score_submissions_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "naijarush"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."share_assets" ADD CONSTRAINT "share_assets_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "naijarush"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."share_events" ADD CONSTRAINT "share_events_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "naijarush"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."share_events" ADD CONSTRAINT "share_events_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "naijarush"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "naijarush"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naijarush"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "naijarush"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_idx" ON "naijarush"."admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "naijarush"."analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_guest_idx" ON "naijarush"."analytics_events" USING btree ("guest_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_uq" ON "naijarush"."auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_slug_uq" ON "naijarush"."campaigns" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "challenge_attempts_challenge_idx" ON "naijarush"."challenge_attempts" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenge_results_challenge_idx" ON "naijarush"."challenge_results" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_code_uq" ON "naijarush"."challenges" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_source_uq" ON "naijarush"."challenges" USING btree ("source_session_id");--> statement-breakpoint
CREATE INDEX "challenges_creator_idx" ON "naijarush"."challenges" USING btree ("creator_guest_id");--> statement-breakpoint
CREATE INDEX "consents_guest_idx" ON "naijarush"."consents" USING btree ("guest_session_id");--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "naijarush"."consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "naijarush"."entitlements" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_modes_uq" ON "naijarush"."game_modes" USING btree ("game_slug","key");--> statement-breakpoint
CREATE INDEX "game_sessions_board_idx" ON "naijarush"."game_sessions" USING btree ("game_slug","status","submitted_at");--> statement-breakpoint
CREATE INDEX "game_sessions_guest_idx" ON "naijarush"."game_sessions" USING btree ("guest_session_id","issued_at");--> statement-breakpoint
CREATE INDEX "game_sessions_challenge_idx" ON "naijarush"."game_sessions" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_sessions_token_uq" ON "naijarush"."guest_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guest_sessions_user_idx" ON "naijarush"."guest_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_season_idx" ON "naijarush"."leaderboard_entries" USING btree ("season_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboards_uq" ON "naijarush"."leaderboards" USING btree ("game_slug","period","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_dedupe_uq" ON "naijarush"."payment_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE INDEX "referral_clicks_challenge_idx" ON "naijarush"."referral_clicks" USING btree ("challenge_id","landed_at");--> statement-breakpoint
CREATE INDEX "referral_clicks_channel_idx" ON "naijarush"."referral_clicks" USING btree ("channel","landed_at");--> statement-breakpoint
CREATE INDEX "share_events_idx" ON "naijarush"."share_events" USING btree ("event","channel","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_handle_uq" ON "naijarush"."user_profiles" USING btree (lower("handle"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "naijarush"."users" USING btree (lower("email"));