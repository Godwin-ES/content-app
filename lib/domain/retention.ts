/**
 * How long a deleted request can be restored before it is removed for
 * good. Mirrors the database's own `deleted_request_retention()`, which is
 * what actually enforces it — this is the number the UI counts down from.
 *
 * It lives here rather than beside the repository because the dashboard's
 * request list is a client component, and importing anything from
 * `lib/repositories` would drag the server-only admin client into the
 * browser bundle.
 */
export const DELETED_REQUEST_RETENTION_DAYS = 30;
