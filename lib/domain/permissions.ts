/**
 * There is one role, so there is nothing to branch on — what someone may
 * do is decided entirely by what they own, which every RLS policy and RPC
 * already checks against `auth.uid()`.
 *
 * This file used to hold isContentManager/isReviewer and a canDecideReview
 * rule that forbade approving your own package. That rule is gone with the
 * second role: the only person who can see a request is the one who
 * created it, so keeping it would have meant nothing could ever be
 * approved. The approval gate itself remains — a human still has to
 * deliberately approve a specific package version before it can be
 * queued for publishing — it is simply the same human.
 */
export {};
