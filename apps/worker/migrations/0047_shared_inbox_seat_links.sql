ALTER TABLE shared_inbox_links ADD COLUMN seat_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_shared_inbox_links_active_seat
ON shared_inbox_links(user_id, seat_id) WHERE status = 'active' AND seat_id != '';
