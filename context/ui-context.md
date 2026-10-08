# UI and UX baseline
## Direction
Premium, calm, precise interface. Spacious typography, restrained accent colors, subtle transitions, readable contrast and coherent public/app identity. Avoid generic wall-of-cards layouts. Use a configurable design-token file for color, spacing, radius, type, motion and density; light/dark themes. Respect reduced motion. Keyboard access, visible focus, semantic controls and screen-reader status announcements. Responsive desktop navigation and mobile task-first views.

## Public site
Top nav: product, how it works, research, request access, sign in. Hero explains researched ideas becoming achievable weekly content. Show realistic labelled demo, not fake customer metrics. Interactive workflow: add brands -> set availability -> review plan -> open cited topic -> record -> create derivatives -> publish -> review. Product previews, research transparency, owner-approval explanation and clear request-access CTA. No invented testimonials, inaccurate free-forever promises or unsupported performance claims.

## Application shell
Workspace selector, brand selector, Home/This Week, Calendar, Content, Progress, Settings. Brand assistant persistent side panel on desktop and a dedicated route/sheet on mobile. Switching scope is visible and clears unauthorized cached content. Pending/rejected/suspended status pages do not load protected product data.

## Home
Lead with next actionable task, time estimate and Start/Done/Reschedule actions. Compact weekly capacity/progress strip across brands; daily grouped tasks and attention area. Empty state explains onboarding/first plan. Topic title opens brief; checkbox is independent. Show research/job progress and freshness, not a frozen AI spinner.

## Brand workspace
Brand name/audience/targets plus overview, ideas/content, series and history. Assistant displays current brand and can explain remembered facts with sources; settings are editable. Proposed goals vs accepted goals clearly separated. Unpublished leftovers and upcoming content visible.

## Weekly planner and calendar
Availability and shift overrides alongside proposed workload. Show capacity conflicts and suggested reductions. Review/accept action with proposed original pieces, derivatives and platform checklist. Calendar alternative accessible list; rescheduling has a non-drag control. Original creation work and publication dates are distinct.

## Topic/content page
Title, brand, format and research state; summary first, then timeline/background, evidence, suggested angle, speaking outline, sources, uncertainty, notes, derivatives and publication checklist. Source links next to supported claims. Research date/cutoff always visible. Research more offers latest/deeper/custom focus with queued status. Version history lets users revisit evidence used in earlier content. Timestamp proposals require supplied timestamped transcript.

## Owner
Separate protected /admin navigation. Pending applicants first, review details and approve/reject; approved/suspended accounts; minimal usage/job health; audit trail. Confirmation for suspension/rejection effects. No default private-conversation browser. Privileged actions require verified owner session/MFA in production.

## States and verification
Every screen defines empty, loading, provider-limit, error, forbidden, stale/conflicting-update and mobile states. Skeletons only where they clarify; meaningful progress for research. Preserve unsaved notes and show safe retry. Forms have inline errors; success is confirmed after server write. Prototype landing/Home/topic/admin first using labelled mock data; inspect layouts at mobile/tablet/desktop before extending all views.
