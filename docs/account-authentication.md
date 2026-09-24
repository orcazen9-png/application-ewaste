# Personal account entry

Native v7 opens a neutral welcome screen, then Login/Signup and an explicit Aggregator or Recycler choice. The visible Aggregator label maps to the existing server role `collector`; data ownership and permissions retain that role code. A saved session is only entered using the displayed Continue action. Activity recreation restores the current step rather than discarding a form.

## Authentication and existing accounts

`PASSWORD_AUTH_ENABLED=true` enables `/api/v1/auth/register`, `/auth/login`, and authenticated `/auth/credentials` on the accounts demo host. All personal sessions remain revocable bearer sessions with a 30-day expiry. Staff authentication is unchanged.

Usernames are normalized to lowercase and globally unique. Each account has one fixed role. Registration creates the user, credentials, session and audit event in one database batch. Recycler registration additionally creates an organization, owner membership and an **unverified** facility. It never creates a statutory verification or demo trading grant.

Existing invitation/SMS accounts can add login credentials through the authenticated Profile action. This attaches credentials to the authenticated user ID, ignoring any submitted user ID or role. Existing records keep their owner. A different username cannot replace already-created credentials through this endpoint. Lost passwords currently require an operator-assisted identity review; no automated recovery is implemented or advertised.

The native client does not persist passwords in saved state or preferences. It retains usernames and non-sensitive registration fields through activity recreation. Sessions use the existing AndroidKeyStore encryption. Switching successfully replaces the active session and queues revocation of its predecessor; failed public authentication does not clear the saved active account. Per-account storage isolates drafts, photos and cached records.

## Password protection

Passwords must contain 15–128 characters. The server stores per-password random salts and scrypt hashes with parameters N=32768, r=8, p=3; comparisons use `timingSafeEqual`. This is one of the configurations listed in the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Cloudflare's Node compatibility supports the crypto implementation; see [Workers crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/). The actual deployed signup/login paths were tested, in addition to local runtime validation.

Before password hashing, HMAC-keyed D1 counters limit signup/credential setup to 10 attempts per IP/hour and 5 per username/hour, and login to 60 per IP/hour and 15 per username/hour. Public signup has a 100/day global demo cap. Unknown accounts take the same password-hashing path as known accounts. Incorrect credentials and suspended users share a generic error. Role mismatch is disclosed only after password validation. Native invitation redemption sends `expectedRole`; mismatch is rejected before consuming the one-use invitation. Legacy clients remain compatible.

## Deployment and limits

Migration `0009_password_accounts.sql` is additive. A private export preceded deployment. Live tests created isolated QA aggregator/recycler accounts and checked signup, profile, role mismatch, login and logout; the QA users were subsequently suspended and their sessions revoked. No real user's invitation was redeemed or revoked for testing.

The demo still needs password change/recovery, verified contact ownership, abuse monitoring and production verification criteria before public production signup. These are separate from selecting an account role. Existing invitations remain valid, and account ownership is not inferred from names or matching contact text.

Recycler facility submission and operations review are now implemented separately from account signup; see [facility review](facility-review.md). A registered recycler remains unverified until reviewed.
