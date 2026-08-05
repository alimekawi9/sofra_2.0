@'
# Sofra Claude Code Instructions

Read these documents before making changes:

@docs/SOFRA_PRODUCT_SPEC.md
@docs/RECOMMENDATION_PIPELINE.md
@docs/IMPLEMENTATION_STATUS.md
@docs/DECISION_LOG.md

Follow the permanent rules in AGENTS.md.

Always inspect the current repository before editing. Do not assume previous prompts were completed.
'@ | Set-Content -Path "CLAUDE.md" -Encoding UTF8