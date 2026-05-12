import { supabase } from "./supabaseClient";
import type { AppPlaylistSummary } from "./appPlaylistsApi";
import type { VinylLabelStyle } from "./AppUserContext";
import {
  DEFAULT_VINYL_LABEL_STYLE,
  VINYL_LABEL_STYLES,
} from "./AppUserContext";

// ---------------------------------------------------------------------------
// profileApi — read-only helpers for the profile page.
// ---------------------------------------------------------------------------
// The profile page shows two flavors of the same UI:
//
//   * Your own profile        (/profile)        — editable identity
//   * Someone else's profile  (/u/:username)    — view-only
//
// Identity edits happen through AppUserContext.updateProfile (which
// also keeps the cached `user` in context fresh). This file is
// strictly the data-fetch side: who is this person, what public stats
// do they have, what playlists have they built.
//
// Stats come from a SECURITY DEFINER RPC (migration 008) so we can
// surface aggregate counts of saved_playlists without loosening that
// table's row-level RLS.
// ---------------------------------------------------------------------------

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  vinylColor: string;
  vinylLabelStyle: VinylLabelStyle;
  /** ISO timestamp of when the user joined SpinDeck. */
  createdAt: string | null;
}

export interface UserStats {
  playlistsCount: number;
  savesCount: number;
}

interface AppUserPublicRow {
  id: string;
  username: string;
  display_name: string | null;
  vinyl_color: string;
  vinyl_label_style: string | null;
  created_at: string | null;
}

function rowToProfile(row: AppUserPublicRow): PublicProfile {
  // Mirror AppUserContext.parseLabelStyle — defensive fallback for
  // rows inserted before the migration.
  const raw = row.vinyl_label_style;
  const labelStyle: VinylLabelStyle =
    raw && (VINYL_LABEL_STYLES as string[]).includes(raw)
      ? (raw as VinylLabelStyle)
      : DEFAULT_VINYL_LABEL_STYLE;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    vinylColor: row.vinyl_color,
    vinylLabelStyle: labelStyle,
    createdAt: row.created_at,
  };
}

const PROFILE_COLUMNS =
  "id, username, display_name, vinyl_color, vinyl_label_style, created_at";

// ---------------------------------------------------------------------------
// Fetch by username — exact, case-insensitive.
// ---------------------------------------------------------------------------
// Usernames are stored lowercase via the trigger in migration 002, but
// users link to /u/:username with whatever case the URL has. ilike is
// safe here because USERNAME_RE only allows [A-Za-z0-9_], so there's
// nothing to escape.
export async function fetchProfileByUsername(
  username: string
): Promise<PublicProfile | null> {
  const u = username.trim();
  if (!u) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select(PROFILE_COLUMNS)
    .ilike("username", u)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as AppUserPublicRow) : null;
}

export async function fetchProfileById(
  userId: string
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as AppUserPublicRow) : null;
}

// ---------------------------------------------------------------------------
// Stats — aggregate counts visible to everyone (see migration 008).
// ---------------------------------------------------------------------------

interface UserStatsRow {
  playlists_count: number;
  saves_count: number;
}

export async function fetchUserStats(userId: string): Promise<UserStats> {
  const { data, error } = await supabase.rpc("public_user_stats", {
    p_user_id: userId,
  });
  if (error) throw error;
  // Postgres functions returning a single-row TABLE(...) come back as
  // an array of one row from PostgREST.
  const row = Array.isArray(data) ? (data[0] as UserStatsRow | undefined) : null;
  return {
    playlistsCount: row?.playlists_count ?? 0,
    savesCount: row?.saves_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public playlists for an owner.
// ---------------------------------------------------------------------------
// All app_playlists are link-shareable by design (we dropped the
// per-row visibility toggle in migration / task #7), so this returns
// every playlist the user has built. Same shape as listMyPlaylists so
// the profile grid can reuse the Home card markup.

interface PlaylistRowWithCount {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  vinyl_color: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  app_playlist_songs?: { count: number }[] | null;
}

export async function listPublicPlaylistsByOwner(
  ownerId: string
): Promise<AppPlaylistSummary[]> {
  const { data, error } = await supabase
    .from("app_playlists")
    .select(
      "id, owner_id, name, description, vinyl_color, is_public, created_at, updated_at, app_playlist_songs(count)"
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as PlaylistRowWithCount[]).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    vinylColor: row.vinyl_color,
    isPublic: row.is_public,
    songCount: row.app_playlist_songs?.[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
