import { supabase } from "./supabaseClient";
import { savePlaylist } from "./savedPlaylistsApi";

// ---------------------------------------------------------------------------
// invitesApi — directed playlist invites.
// ---------------------------------------------------------------------------
// Senders address recipients by @username. We resolve the username to an
// id client-side (with a SELECT against app_users) before inserting; that
// lets us return a friendly "no user with that username" error from the
// modal instead of a raw FK violation.
//
// Acceptance auto-saves the playlist to the recipient's library — that's
// the whole point of the feature, so the inbox doubles as a one-tap way
// to bring shared playlists into Home alongside owned ones.
// ---------------------------------------------------------------------------

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
}

export interface PendingInvite {
  id: string;
  playlistId: string;
  message: string | null;
  createdAt: string;
  // sender (denormalized into the response for the inbox card)
  senderId: string;
  senderUsername: string;
  senderDisplayName: string | null;
  // playlist (also denormalized so we don't need a second query)
  playlistName: string;
  playlistDescription: string;
  playlistVinylColor: string;
  playlistSongCount: number;
  playlistOwnerId: string;
}

// Shape of the joined select() response we issue below.
interface InboxRow {
  id: string;
  playlist_id: string;
  sender_id: string;
  message: string | null;
  created_at: string;
  sender: { username: string; display_name: string | null } | null;
  playlist: {
    name: string;
    description: string;
    vinyl_color: string;
    owner_id: string;
    app_playlist_songs: { count: number }[] | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Username search (autocomplete inside SendInviteModal).
// ---------------------------------------------------------------------------
// Prefix-matches by username, case-insensitive. We exclude the caller via
// `neq("id", excludeUserId)` so they can't accidentally try to invite
// themselves (and so the autocomplete list isn't cluttered with their
// own row when they start typing their own handle).
// ---------------------------------------------------------------------------
export async function searchUsersByUsername(
  query: string,
  excludeUserId: string,
  limit = 8
): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  // ilike on a `name%` pattern; the `%` is escaped at the value level by
  // PostgREST so user input can't break out of the pattern.
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, display_name")
    .ilike("username", `${q}%`)
    .neq("id", excludeUserId)
    .order("username", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    username: row.username as string,
    displayName: (row.display_name as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Send invite.
// ---------------------------------------------------------------------------
// 1. Resolve the username to a recipient id. (Case-insensitive match.)
// 2. Insert the invite row.
//
// The unique partial index on (playlist_id, sender_id, recipient_id) WHERE
// status='pending' will reject a duplicate — we surface a friendly error
// instead of the raw Postgres message.
// ---------------------------------------------------------------------------
export async function sendInvite(input: {
  senderId: string;
  recipientUsername: string;
  playlistId: string;
  message?: string | null;
}): Promise<void> {
  const username = input.recipientUsername.trim().replace(/^@/, "");
  if (!username) throw new Error("Pick a username to invite.");

  const message = input.message?.trim();
  if (message && message.length > 280) {
    throw new Error("Message is too long (max 280 characters).");
  }

  // Resolve recipient. ilike with no wildcards is a case-insensitive equals.
  const { data: recipient, error: lookupErr } = await supabase
    .from("app_users")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (!recipient) {
    throw new Error(`No SpinDeck user with username @${username}.`);
  }
  if ((recipient as { id: string }).id === input.senderId) {
    throw new Error("You can't invite yourself.");
  }

  const { error: insertErr } = await supabase
    .from("playlist_invites")
    .insert({
      playlist_id: input.playlistId,
      sender_id: input.senderId,
      recipient_id: (recipient as { id: string }).id,
      message: message && message.length > 0 ? message : null,
    });

  if (insertErr) {
    // 23505 = unique_violation. The only unique constraint here is the
    // partial index on (playlist, sender, recipient) WHERE pending, so
    // this fires when we try to invite someone who already has a
    // pending invite from this user for this playlist.
    if (insertErr.code === "23505") {
      throw new Error(
        `@${username} already has a pending invite for this playlist.`
      );
    }
    throw insertErr;
  }
}

// ---------------------------------------------------------------------------
// List pending invites for the recipient's inbox.
// ---------------------------------------------------------------------------
// Joins the sender (for "@from" display) and the playlist (for the card
// preview + song count). One query, no N+1.
// ---------------------------------------------------------------------------
export async function listPendingInvites(
  recipientId: string
): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from("playlist_invites")
    .select(
      `
      id,
      playlist_id,
      sender_id,
      message,
      created_at,
      sender:app_users!playlist_invites_sender_id_fkey(username, display_name),
      playlist:app_playlists!playlist_invites_playlist_id_fkey(
        name, description, vinyl_color, owner_id,
        app_playlist_songs(count)
      )
      `
    )
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as InboxRow[];
  // Drop rows whose join sides resolved to null — the FKs cascade-delete
  // so this should be rare (only mid-cascade race), but the type system
  // can't prove it.
  return rows.flatMap<PendingInvite>((row) => {
    if (!row.sender || !row.playlist) return [];
    const songCount = row.playlist.app_playlist_songs?.[0]?.count ?? 0;
    return [
      {
        id: row.id,
        playlistId: row.playlist_id,
        message: row.message,
        createdAt: row.created_at,
        senderId: row.sender_id,
        senderUsername: row.sender.username,
        senderDisplayName: row.sender.display_name,
        playlistName: row.playlist.name,
        playlistDescription: row.playlist.description,
        playlistVinylColor: row.playlist.vinyl_color,
        playlistSongCount: songCount,
        playlistOwnerId: row.playlist.owner_id,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Accept / Decline.
// ---------------------------------------------------------------------------
// Accepting also bookmarks the playlist via savePlaylist — the whole point
// of the inbox is to drop the playlist into the recipient's library with a
// single tap. If the bookmark fails (already saved, network blip), we
// still flip the invite to 'accepted' because the user's intent to accept
// is independent of the bookmark already existing.
// ---------------------------------------------------------------------------
export async function respondToInvite(input: {
  inviteId: string;
  recipientId: string;
  playlistId: string;
  action: "accept" | "decline";
}): Promise<void> {
  const nextStatus = input.action === "accept" ? "accepted" : "declined";

  if (input.action === "accept") {
    // Save first so that if RLS were ever to drop us, we'd at least have
    // the bookmark; in practice the calls are independent.
    try {
      await savePlaylist(input.recipientId, input.playlistId);
    } catch {
      // Don't block the accept on a save failure — the user can still
      // open the playlist via Home > Saved Playlists if upsert raced.
    }
  }

  const { error } = await supabase
    .from("playlist_invites")
    .update({
      status: nextStatus,
      responded_at: new Date().toISOString(),
    })
    .eq("id", input.inviteId);
  if (error) throw error;
}
