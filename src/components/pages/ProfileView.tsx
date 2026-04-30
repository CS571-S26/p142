import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Check, LogOut, Pencil, X } from "lucide-react";
import { Button } from "./ui/button";
import { useAppUser } from "../data/AppUserContext";
import {
  fetchProfileByUsername,
  fetchUserStats,
  listPublicPlaylistsByOwner,
  type PublicProfile,
  type UserStats,
} from "../data/profileApi";
import type { AppPlaylistSummary } from "../data/appPlaylistsApi";
import { formatError } from "../data/formatError";
import { VinylRecord } from "./VinylRecord";

// =============================================================================
// ProfileView — handles both /profile (own, editable) and /u/:username (other,
// view-only). One component instead of two so layout / styling stays in lock-
// step; the only branch is on `isOwn`, which gates the inline edit affordance.
// =============================================================================

interface Props {
  /** When true the route is /profile and we render the signed-in user's
   * own profile (editable). When false the route is /u/:username and
   * `username` from useParams identifies the target. */
  ownProfile?: boolean;
}

export function ProfileView({ ownProfile = false }: Props) {
  const navigate = useNavigate();
  const { username: routeUsername } = useParams();
  const { user, status, signOut, updateProfile } = useAppUser();

  // Which username are we displaying? Own profile uses the signed-in
  // user's; /u/:username uses the route param. We treat "missing
  // route param + ownProfile=false" as a 404.
  const targetUsername = ownProfile ? user?.username ?? null : routeUsername ?? null;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!targetUsername) return;
    setLoading(true);
    setError(null);
    try {
      const p = await fetchProfileByUsername(targetUsername);
      if (!p) {
        setProfile(null);
        setError("That profile doesn't exist.");
      } else {
        setProfile(p);
      }
    } catch (e) {
      setError(formatError(e, "Couldn't load profile."));
    } finally {
      setLoading(false);
    }
  }, [targetUsername]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // Are we looking at our own profile? `ownProfile` is the route hint;
  // we double-check by id so the /u/:username path also flips to
  // editable when the username happens to be ours.
  const isOwn = !!(user?.id && profile && user.id === profile.id);

  // ---- Stats + playlists -------------------------------------------------
  const [stats, setStats] = useState<UserStats | null>(null);
  const [playlists, setPlaylists] = useState<AppPlaylistSummary[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    void Promise.all([
      fetchUserStats(profile.id),
      listPublicPlaylistsByOwner(profile.id),
    ])
      .then(([s, pls]) => {
        if (cancelled) return;
        setStats(s);
        setPlaylists(pls);
      })
      .catch((e) => {
        if (cancelled) return;
        setContentError(formatError(e, "Couldn't load this profile's content."));
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  // ---- Inline edit (own profile only) ------------------------------------
  // Only the display name is editable here. Username changes are a
  // bigger deal (everything keys on it) and we're keeping this page
  // simple for now; users can re-create an account if they really
  // need a new handle.
  const [editing, setEditing] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setDraftDisplayName(profile?.displayName ?? "");
  }, [profile?.displayName]);

  async function handleSaveEdit() {
    if (!isOwn) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const cleaned = draftDisplayName.trim();
      await updateProfile({ displayName: cleaned.length > 0 ? cleaned : null });
      // updateProfile mutates the AppUser in context, but we also
      // patch the local profile snapshot so the read-mode view shows
      // the new name immediately.
      setProfile((prev) =>
        prev ? { ...prev, displayName: cleaned.length > 0 ? cleaned : null } : prev
      );
      setEditing(false);
    } catch (e) {
      setEditError(formatError(e, "Couldn't save profile."));
    } finally {
      setSavingEdit(false);
    }
  }

  // ---- Render ------------------------------------------------------------

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7]">
        <p className="text-[#785A38]">Loading profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FFF8E7] p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold text-[#3D2817]">
            Profile not found
          </h1>
          <p className="text-[#785A38]">{error ?? "Unknown error."}</p>
          <Button onClick={() => navigate("/home")} variant="outline">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#FFF8E7] pb-24">
      <header className="border-b-2 border-[#3D2817] bg-[#FFE8BA] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate(user ? "/home" : "/")}
            className="text-[#3D2817]"
          >
            <ArrowLeft className="size-5 mr-2" />
            Back
          </Button>
          {user && isOwn && (
            <Button
              variant="ghost"
              onClick={() => void signOut()}
              className="text-[#785A38] hover:text-red-600"
            >
              <LogOut className="size-4 mr-2" />
              Log out
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-12">
        {/* ----- Identity header ----- */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-8 mb-8 sm:mb-10 text-center sm:text-left">
          {/* Avatar = each user's signature vinyl color, same visual
              language as their playlist cards. Cheap, on-brand, and
              avoids wading into image upload UX for v1. */}
          <div className="flex-shrink-0">
            <VinylRecord
              color={profile.vinylColor}
              className="size-32 sm:size-40"
            />
          </div>

          <div className="flex-1 min-w-0 sm:pt-3 w-full">
            {editing && isOwn ? (
              <div className="space-y-3 max-w-md mx-auto sm:mx-0">
                <div>
                  <label
                    htmlFor="profile-display-name"
                    className="block text-sm font-semibold text-[#3D2817] mb-1"
                  >
                    Display name
                  </label>
                  <input
                    id="profile-display-name"
                    type="text"
                    value={draftDisplayName}
                    onChange={(e) => setDraftDisplayName(e.target.value)}
                    placeholder="Your display name"
                    maxLength={80}
                    className="w-full rounded-md border-2 border-[#3D2817] px-3 py-2 bg-white text-[#3D2817] placeholder:text-[#785A38] focus:outline-none focus:ring-2 focus:ring-[#FF9F45]"
                  />
                </div>
                {editError && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded px-3 py-2">
                    {editError}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => void handleSaveEdit()}
                    disabled={savingEdit}
                    className="bg-[#FF9F45] hover:bg-[#FF8C2E] text-[#3D2817] font-semibold border-2 border-[#3D2817] shadow-[4px_4px_0px_0px_rgba(61,40,23,1)] hover:shadow-[2px_2px_0px_0px_rgba(61,40,23,1)] transition-all"
                  >
                    <Check className="size-4 mr-2" />
                    {savingEdit ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDraftDisplayName(profile.displayName ?? "");
                      setEditing(false);
                      setEditError(null);
                    }}
                    disabled={savingEdit}
                  >
                    <X className="size-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl sm:text-4xl font-bold text-[#3D2817] break-words">
                  {profile.displayName || `@${profile.username}`}
                </h1>
                {profile.displayName && (
                  <p className="text-base sm:text-lg text-[#785A38] mt-1">
                    @{profile.username}
                  </p>
                )}
                <div className="flex items-center justify-center sm:justify-start gap-3 mt-4 flex-wrap">
                  {isOwn && (
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="size-4 mr-2" />
                      Edit profile
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ----- Stats ----- */}
        <div className="mb-8 sm:mb-10 border-2 border-[#3D2817] rounded-lg bg-white shadow-[4px_4px_0px_0px_rgba(61,40,23,0.3)] flex divide-x-2 divide-[#3D2817]">
          <div className="flex-1 px-4 py-3 sm:py-4 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-[#3D2817] tabular-nums">
              {stats?.playlistsCount ?? "…"}
            </p>
            <p className="text-xs sm:text-sm text-[#785A38] uppercase tracking-wide">
              Playlists
            </p>
          </div>
          <div className="flex-1 px-4 py-3 sm:py-4 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-[#3D2817] tabular-nums">
              {stats?.savesCount ?? "…"}
            </p>
            <p className="text-xs sm:text-sm text-[#785A38] uppercase tracking-wide">
              Saves
            </p>
          </div>
        </div>

        {/* ----- Playlists ----- */}
        <section>
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D2817]">
              {isOwn ? "Your playlists" : "Playlists"}
            </h2>
            <p className="text-sm text-[#785A38] mt-1">
              {isOwn
                ? "Annotated playlists you've built in SpinDeck."
                : `Annotated playlists by @${profile.username}.`}
            </p>
          </div>

          {contentLoading ? (
            <div className="text-center py-12 text-[#785A38]">
              <p>Loading playlists…</p>
            </div>
          ) : contentError ? (
            <div className="text-center py-12 text-red-600">
              <p>{contentError}</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="border-2 border-dashed border-[#785A38] rounded-lg p-8 sm:p-10 text-center bg-white/50">
              <p className="text-[#3D2817] font-semibold mb-1">
                No playlists yet
              </p>
              <p className="text-sm text-[#785A38]">
                {isOwn
                  ? "Build a SpinDeck playlist from Home to fill this section."
                  : `@${profile.username} hasn't built any SpinDeck playlists yet.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => navigate(`/app-playlist/${pl.id}`)}
                  className="text-left cursor-pointer group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF8E7]"
                >
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="transition-transform group-hover:scale-105 group-hover:rotate-12">
                      <VinylRecord
                        color={pl.vinylColor}
                        className="size-32 sm:size-40 md:size-44"
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-base sm:text-lg mb-1 text-[#3D2817] line-clamp-2">
                      {pl.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#785A38]">
                      {pl.songCount} {pl.songCount === 1 ? "song" : "songs"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
