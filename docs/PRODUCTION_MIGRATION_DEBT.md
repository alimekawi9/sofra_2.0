# Production Migration Technical Debt

The frontend production migration deliberately preserves the current
`sofra_user_id` localStorage identity model.

## Deferred

- Proper authentication and authorization hardening.
- Replacing localStorage identity.
- Supabase Auth.
- RLS restoration.
- Storage-policy hardening.
- Existing-account migration.
- Phone-number onboarding.

These items are explicitly outside the current migration. Production UI work
must not imply that the current identity model provides a secure authorization
boundary. Pending invitations and shared albums should be structured so these
controls can be added later without rebuilding their data models.
