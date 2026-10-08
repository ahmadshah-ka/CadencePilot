# Architecture baseline
## Stack and layers
Next.js/React/TypeScript; Tailwind and accessible components. Node runtime Route Handlers on Vercel initially. Thin versioned APIs -> application use cases -> pure domain -> infrastructure interfaces/adapters. Avoid microservices until measured bottlenecks justify them.
Supabase Auth and PostgreSQL; RLS on all exposed tenant tables. Supabase Queues/PGMQ with application job records. Protected bounded worker handlers; Supabase Cron/pg_net invokes them using a secret stored in Vault. Prompt dispatch follows durable enqueue; scheduled recovery prevents lost work. Do not rely on an unawaited promise or process memory for durable execution.
Groq GPT-OSS 120B initial LLM preference; Tavily initial research search/extraction provider; optional Resend email; in-app notifications first. All provider/model settings configurable and verified during adapter implementation against current primary docs.

## Portable boundaries
Define interfaces for identity verification, LLM generation/tools, research search/extract, notifications, queue, content repositories and storage. Normalize results/errors/capabilities. Business logic depends on contracts. Supported provider changes use configuration and restart/deploy; a new incompatible provider needs an adapter. Database/auth/storage changes require migration planning. Keep core tables portable PostgreSQL and wrap Supabase-specific policies/extensions. Use HTTP/RPC initially; direct SQL uses an appropriate pool if introduced.

## Entity model
- account_access(user_id, status pending/approved/rejected/suspended, reviewed_by, reviewed_at, revision)
- platform_admins(user_id, role): secure bootstrap outside signup, no public write access
- profiles(user_id, timezone, availability/preferences)
- workspaces; workspace_members(workspace_id,user_id,role)
- brands(workspace_id,id,profile,targets,revision); brand_settings and availability_overrides
- series; content_items(original or derivative,parent_id,brand_id,format,creation_status)
- publications(content_id,platform,state,published_at,url): separate from production status
- weekly_plans(week_start_local,timezone,revision,status); plan_items; tasks(due_at,duration,kind,state,revision)
- conversations/messages; confirmed_memories(scope,source,status); conversation_summaries(version,source_range)
- research_runs(topic,scope,cutoff,state); research_briefs(version,summary,timeline,gaps); research_sources(url,author,published_at,retrieved_at); evidence_claims; claim_sources
- jobs(state,attempts,lease,requester,workspace,brand,idempotency_key); notifications; usage_reservations; usage_events; audit_events; daily_brand_stats
All brand descendants carry workspace_id and where appropriate brand_id. Use compound uniqueness/FKs to prevent foreign workspace parent links, not only client checks. A derivative inherits its parent's brand/workspace. Exact schema is implemented via reviewed migrations per feature.

## Security and consistency
Authentication != approval. Central access policy rechecks approval/suspension and workspace membership for reads, writes, streams, jobs and tools. RLS provides database enforcement. Privileged service keys bypass RLS: use only narrow server pathways with explicit rechecks. Jobs reauthorize at execution; suspension/revoked membership cancels access and pending effects. Caches key on scope/version and invalidate on changes/signout.
Approval, plan acceptance, task completion and related outbox writes use transactions and optimistic revisions. Idempotency prevents duplicate accepted plans/publications/notifications. Queue delivery can repeat; side effects must deduplicate. Stats may update asynchronously with a freshness timestamp and reconciliation; authoritative completion records are transactional.

## AI context and tools
At each call resolve authorized scope, load current preferences, recent turns, compact summaries and relevant evidence. Tools obtain exact counts/history from database. Authority: recorded facts/current confirmed settings > original evidence > summaries. FTS first; vector search only after measured retrieval need. Never retrieve another brand implicitly. Cross-brand view requires an explicitly authorized workspace operation.
Structured schema is validated syntactically and semantically before writes. Capability checks account for provider restrictions: tool calling/streaming and strict structured output may require separate phases. Interactive text streams; background jobs expose live progress and validated final artifacts rather than unvalidated JSON streamed into the DB.

## Failure recovery and scale
Bounded worker leases, retry/backoff with jitter, provider Retry-After, dead-letter/failure state, cancellation and per-tenant fairness. Reserve global and tenant budget atomically before calls; reconcile actual usage. Protect organization-wide provider limits; queues cannot solve permanently exhausted quota. Large research tasks checkpoint between stages.
Use indexed scoped cursor queries and explicit fields; bounded calendar ranges, paginated chats, virtualized long lists. Read compact stats; inspect EXPLAIN and slow queries. Target p95 normal authenticated reads below one second and useful dashboard near two seconds under a documented representative load; these are test targets, not present guarantees. Test cold/warm behavior and simultaneous weekly planning. Region selection and free database resources affect results.

## Research methodology
Question -> subquestions/search plan -> sources -> extracted evidence -> independent corroboration -> synthesis -> citation/claim review -> versioned saved brief. Adapt depth to content format and subject. Prioritize relevant primary records plus reputable secondary interpretation; do not treat primary sources as automatically unbiased. Trace syndicated reports to their origin. Keep event date, publication date and retrieval date distinct. Search both supporting and conflicting evidence; follow references when gaps matter.
Historical briefs cover relevant predecessors, documented timeline, disputed interpretations and consequences to the present; do not force false causal connections. Current briefs state cutoff and latest supported developments. Claim statuses are supported/disputed/insufficient, with rationale rather than artificial confidence scores. Search snippets are leads, not sufficient evidence. Inaccessible sources are labelled and excluded from substantive support unless another accessible record supports the claim.
Save query trail, selected-source reasons, permitted evidence excerpts, claim links, brief/prompt/model versions and limitations. Do not archive copyrighted full pages by default. More research/refresh creates a new version; user notes remain separate. Original video briefs can support derivatives only within the evidence's scope. Freshness policy varies by topic and is configurable. No formal systematic-review or industry-best claim without appropriate evaluation.
Evaluation measures citation existence and entailment, source independence, factual errors, unresolved contradictions, context retrieval accuracy and creator correction effort on representative current/historical/disputed topics. A second model pass alone is not independent verification.
References informing this adapted method: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04 ; https://reutersagency.com/about/standards-values/ ; https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf

## Operations and release
Structured redacted logs with traceId; request latency/errors, queue lag, LLM token/latency/usage, research credits, slow DB queries and connection usage. Health/readiness endpoints expose only minimal status; no secret-bearing diagnostics. Restricted audit events record privileged actions without copying private conversations.
Separate dev/prod settings, migrations and staged rollout. Confirm backups and restore tests before customer production; free Supabase lacks automatic backups. Data export/retention/deletion apply across memories, jobs/caches and evidence. Publish privacy/terms describing external AI/research processing before public signup. No paid services provisioned by this pack.
