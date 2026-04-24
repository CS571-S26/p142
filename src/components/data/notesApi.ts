import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type NoteTargetType = "song" | "app_playlist" | "spotify_playlist";

export interface NoteWithAuthor {
  id: string;
  body: string;
  createdAt: string;          // ISO timestamp
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  targetType: NoteTargetType;
  targetId: string;
}

// Supabase returns joined rows shaped like this. We normalize to
// NoteWithAuthor (camelCase + flat) before handing back to the UI.
interface NoteRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  target_type: NoteTargetType;
  target_id: string;
  // With an explicit FK, PostgREST embeds the related row. We ask for
  // an object (not an array) by using a to-one join hint; Supabase
  // decides based on the FK arity.
  author: { username: string; display_name: string | null } | null;
}

function rowToNote(row: NoteRow): NoteWithAuthor {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorUsername: row.author?.username ?? "(deleted user)",
    authorDisplayName: row.author?.display_name ?? null,
    targetType: row.target_type,
    targetId: row.target_id,
  };
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

export async function fetchNotes(
  targetType: NoteTargetType,
  targetId: string
): Promise<NoteWithAuthor[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, body, created_at, author_id, target_type, target_id, author:app_users!notes_author_id_fkey(username, display_name)"
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as NoteRow[]).map(rowToNote);
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

export async function createNote(input: {
  authorId: string;
  targetType: NoteTargetType;
  targetId: string;
  body: string;
}): Promise<NoteWithAuthor> {
  const trimmed = input.body.trim();
  if (trimmed.length === 0) throw new Error("Note body can't be empty.");
  if (trimmed.length > 2000) throw new Error("Note is too long (max 2000 chars).");

  const { data, error } = await supabase
    .from("notes")
    .insert({
      author_id: input.authorId,
      target_type: input.targetType,
      target_id: input.targetId,
      body: trimmed,
    })
    .select(
      "id, body, created_at, author_id, target_type, target_id, author:app_users!notes_author_id_fkey(username, display_name)"
    )
    .single();

  if (error) throw error;
  return rowToNote(data as unknown as NoteRow);
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Small "x ago" formatter — avoids pulling in a date library. Returns
// a date string for anything older than a week.
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
