# Seat Inbox Links

## Scope

The mailbox list exposes separate generic-share and seat-link actions. A seat
link requires an owned, occupied, active seat in an active sharing account, with
family sharing enabled and a matching mailbox. Folder scope and a rolling mail
window are independent of the required absolute link expiration.

Each seat has at most one locally active link. Resetting or revoking one link
does not affect other seats or generic mailbox sharing. Expired links can be
revoked or reset with a future expiration; they cannot be used for public access.
Reset preserves the existing folder scope and rolling window.

Changing a member/contact, vacating/pausing a seat, changing the family mailbox,
or disabling family sharing revokes the affected seat links. Moving a member
revokes both source and target seat links; generate a new destination link.
Renewing the same active member preserves the link but does not automatically
extend its independent expiration.

Existing generic links remain unchanged. When migrating occupants from a generic
link to independent links, explicitly revoke the old generic link if they should
no longer have that access. A seat reset cannot revoke a generic link already
given to an occupant.

## Storage And Access

Docker/PocketBase adds `seatId` and a partial unique index during schema setup.
Cloudflare requires migration `0047_shared_inbox_seat_links.sql` before deploying
the new Worker. Existing rows default to an empty seat id, retaining generic
sharing. No existing link or mailbox is deleted by the migration.

Public proxy requests verify local status, expiration and current seat ownership
and family-sharing state before accessing the upstream grant. Tokens and upstream
grant credentials remain server-side. Automatic revocation during seat changes
is local and transactional; upstream grants may remain until their expiration,
but the revoked SubNest URLs are unusable. Explicit revoke also revokes upstream.

Creation rechecks the seat/account/subscription versions after the upstream grant
is generated. If the assignment changed or saving fails, the new upstream grant
is revoked on a best-effort basis and no short URL is returned.

## Verification And Rollback

Tests cover required expiration, owner/mailbox matching, vacant seats, independent
revocation, assignment changes during creation, public-access denial and failed
replacement creation. Browser tests cover desktop/mobile layout, horizontal
bounds, scrolling and an individual reset with mocked mailbox APIs.

Live mailbox-provider behavior is not covered by the browser mocks. Verify with a
test mailbox before a production release; never use production messages in test
fixtures.

Older code does not recognize seat-scoped grants. Before rolling back, revoke
all seat links using the current version and keep the additive schema/index.
Do not downgrade with active seat links: older proxies lack the seat checks and
older list synchronization can treat seat links as generic sharing.

Temporary-mailbox classification, automatic link issuance, renewal-based automatic
expiration extension, batch actions and allocation audit history are not included
in this phase.
