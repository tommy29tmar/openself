import { describe, it, expect } from "vitest";

import {
  mapSpotifyProfile,
  mapSpotifyTopArtists,
  mapSpotifyTopTracks,
  detectTasteShift,
} from "@/lib/connectors/spotify/mapper";
import type {
  SpotifyProfile,
  SpotifyArtist,
  SpotifyTrack,
} from "@/lib/connectors/spotify/client";

// ── Fixtures ──────────────────────────────────────────────────────────

const profile: SpotifyProfile = {
  id: "user1",
  display_name: "Test User",
  external_urls: { spotify: "https://open.spotify.com/user/user1" },
};

const profileNoName: SpotifyProfile = {
  id: "user2",
  display_name: null,
  external_urls: { spotify: "https://open.spotify.com/user/user2" },
};

const artists: SpotifyArtist[] = [
  {
    id: "a1",
    name: "Radiohead",
    genres: ["alternative rock", "art rock"],
    external_urls: { spotify: "https://open.spotify.com/artist/a1" },
  },
  {
    id: "a2",
    name: "Aphex Twin",
    genres: ["electronic", "idm"],
    external_urls: { spotify: "https://open.spotify.com/artist/a2" },
  },
  {
    id: "a3",
    name: "Björk",
    genres: ["art rock", "electronic", "experimental"],
    external_urls: { spotify: "https://open.spotify.com/artist/a3" },
  },
];

const tracks: SpotifyTrack[] = [
  {
    id: "t1",
    name: "Everything In Its Right Place",
    artists: [{ id: "a1", name: "Radiohead" }],
    external_urls: { spotify: "https://open.spotify.com/track/t1" },
  },
  {
    id: "t2",
    name: "Windowlicker",
    artists: [{ id: "a2", name: "Aphex Twin" }],
    external_urls: { spotify: "https://open.spotify.com/track/t2" },
  },
];

// ── Tests ─────────────────────────────────────────────────────────────

describe("mapSpotifyProfile", () => {
  it("maps profile with display_name", () => {
    const facts = mapSpotifyProfile(profile);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toEqual({
      category: "social",
      key: "spotify-profile",
      value: {
        platform: "spotify",
        url: "https://open.spotify.com/user/user1",
        label: "Test User",
      },
    });
  });

  it("falls back to id when display_name is null", () => {
    const facts = mapSpotifyProfile(profileNoName);
    expect(facts[0].value.label).toBe("user2");
  });
});

describe("mapSpotifyTopArtists", () => {
  it("maps artists to music facts with title/note/url shape", () => {
    const facts = mapSpotifyTopArtists(artists);
    expect(facts).toHaveLength(3);
    expect(facts[0]).toEqual({
      category: "music",
      key: "sp-artist-a1",
      value: {
        title: "Radiohead",
        note: "alternative rock, art rock",
        url: "https://open.spotify.com/artist/a1",
      },
    });
  });

  it("omits note when genres array is empty", () => {
    const artistNoGenres: SpotifyArtist[] = [
      {
        id: "a99",
        name: "No Genre Artist",
        genres: [],
        external_urls: { spotify: "https://open.spotify.com/artist/a99" },
      },
    ];
    const facts = mapSpotifyTopArtists(artistNoGenres);
    expect(facts[0].category).toBe("music");
    expect(facts[0].value.title).toBe("No Genre Artist");
    expect(facts[0].value.note).toBeUndefined();
  });

  it("omits note when genres is null", () => {
    const artistNullGenres = [
      {
        id: "a98",
        name: "Null Genre Artist",
        genres: null as unknown as string[],
        external_urls: { spotify: "https://open.spotify.com/artist/a98" },
      },
    ];
    const facts = mapSpotifyTopArtists(artistNullGenres);
    expect(facts[0].category).toBe("music");
    expect(facts[0].value.title).toBe("Null Genre Artist");
    expect(facts[0].value.note).toBeUndefined();
  });

  it("handles empty list", () => {
    expect(mapSpotifyTopArtists([])).toEqual([]);
  });
});

describe("mapSpotifyTopTracks", () => {
  it("maps tracks to music facts with title/artist/url shape", () => {
    const facts = mapSpotifyTopTracks(tracks);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toEqual({
      category: "music",
      key: "sp-track-t1",
      value: {
        title: "Everything In Its Right Place",
        artist: "Radiohead",
        url: "https://open.spotify.com/track/t1",
      },
    });
  });

  it("includes album when track has album.name", () => {
    const tracksWithAlbum: SpotifyTrack[] = [
      {
        id: "t10",
        name: "Idioteque",
        artists: [{ id: "a1", name: "Radiohead" }],
        album: { name: "Kid A" },
        external_urls: { spotify: "https://open.spotify.com/track/t10" },
      },
    ];
    const facts = mapSpotifyTopTracks(tracksWithAlbum);
    expect(facts[0].value.album).toBe("Kid A");
  });

  it("omits album when track has no album field", () => {
    const facts = mapSpotifyTopTracks(tracks);
    expect(facts[0].value.album).toBeUndefined();
  });

  it("omits album when album.name is empty string", () => {
    const tracksEmptyAlbum: SpotifyTrack[] = [
      {
        id: "t11",
        name: "Test",
        artists: [{ id: "a1", name: "Artist" }],
        album: { name: "" },
        external_urls: { spotify: "url" },
      },
    ];
    const facts = mapSpotifyTopTracks(tracksEmptyAlbum);
    expect(facts[0].value.album).toBeUndefined();
  });

  it("joins multiple artists with comma", () => {
    const multiArtistTrack: SpotifyTrack[] = [
      {
        id: "t3",
        name: "Collab Track",
        artists: [
          { id: "a1", name: "Artist A" },
          { id: "a2", name: "Artist B" },
        ],
        external_urls: { spotify: "url" },
      },
    ];
    const facts = mapSpotifyTopTracks(multiArtistTrack);
    expect(facts[0].category).toBe("music");
    expect(facts[0].value.artist).toBe("Artist A, Artist B");
  });
});


describe("detectTasteShift", () => {
  it("returns null on first sync (empty previous)", () => {
    const result = detectTasteShift(["a1", "a2", "a3", "a4", "a5"], []);
    expect(result).toBeNull();
  });

  it("returns null when fewer than 3 artists changed", () => {
    const result = detectTasteShift(
      ["a1", "a2", "a3", "a4", "a5"],
      ["a1", "a2", "a3", "b4", "b5"],
    );
    // Changed: a4, a5 (only 2)
    expect(result).toBeNull();
  });

  it("detects taste shift when exactly 3 artists changed", () => {
    const result = detectTasteShift(
      ["a1", "a2", "new1", "new2", "new3"],
      ["a1", "a2", "a3", "a4", "a5"],
    );
    expect(result).not.toBeNull();
    expect(result!.actionType).toBe("music");
    expect(result!.narrativeSummary).toContain("3/5 top artists changed");
    expect(result!.externalId).toMatch(/^taste-shift-/);
  });

  it("detects taste shift when all 5 artists changed", () => {
    const result = detectTasteShift(
      ["new1", "new2", "new3", "new4", "new5"],
      ["a1", "a2", "a3", "a4", "a5"],
    );
    expect(result).not.toBeNull();
    expect(result!.narrativeSummary).toContain("5/5 top artists changed");
  });

  it("returns null when no artists changed", () => {
    const result = detectTasteShift(
      ["a1", "a2", "a3", "a4", "a5"],
      ["a1", "a2", "a3", "a4", "a5"],
    );
    expect(result).toBeNull();
  });
});
