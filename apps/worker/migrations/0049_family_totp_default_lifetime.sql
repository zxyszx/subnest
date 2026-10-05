-- Preserve live default URLs, but never revive revoked or already expired links.
UPDATE sharing_totp_links
SET expires_at = ''
WHERE seat_id = '' AND revoked = 0 AND julianday(expires_at) > julianday('now');
