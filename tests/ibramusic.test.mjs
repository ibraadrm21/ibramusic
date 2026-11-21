import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearch, rankTracks } from "../src/services/catalog.ts";
import { equalLibraryData, mergeLibrary } from "../src/services/librarySync.ts";
import { statsFor } from "../src/services/listeningHistory.ts";
import { parsePlaylistBackup } from "../src/services/libraryFiles.ts";
import { dominantCoverColor } from "../src/services/coverArt.ts";

test("a black cover keeps a small green accent without tinting the background", () => {
  const cover = new Uint8ClampedArray(1000 * 4);
  for (let index = 0; index < 1000; index++) {
    const color = index < 940 ? [0, 0, 0] : index < 990 ? [240, 240, 240] : [18, 214, 26];
    cover.set([...color, 255], index * 4);
  }
  const palette = dominantCoverColor(cover);
  assert.equal(palette.mostlyBlack, true);
  assert.ok(palette.hue >= 115 && palette.hue <= 130);
  assert.ok(palette.saturation > 70);
  cover.fill(0);
  for (let index = 0; index < 1000; index++) cover.set([18, 214, 26, 255], index * 4);
  assert.equal(dominantCoverColor(cover).mostlyBlack, false);
});

test("a tiny warm detail on a grayscale cover does not tint the interface", () => {
  const cover = new Uint8ClampedArray(1000 * 4);
  for (let index = 0; index < 1000; index++) {
    const gray = index < 850 ? 65 : 190;
    cover.set(index < 994 ? [gray, gray, gray, 255] : [134, 87, 63, 255], index * 4);
  }
  assert.deepEqual(dominantCoverColor(cover), { hue: 0, saturation: 0, mostlyBlack: false });
});

const track = (id, title = id, artist = "Ibra", duration = 180) => ({ id, title, artist, duration, audioUrl: "", thumbnail: "" });
const playlist = (tracks, name = "Mezcla") => ({ id: "mix", name, tracks });
const library = (favorites = [], playlists = []) => ({
  favorites,
  playlists,
  followedArtists: [],
  themeSettings: { theme: "dark", corners: "rounded", bgColor: "", bgImage: "" },
  accumulatedStats: { tracks: {}, artists: {}, totalSeconds: 0 },
});

test("search ranks exact title and artist, ignores accents and groups equivalent releases", () => {
  const original = track("1", "Despechá", "Rosalía");
  const deluxe = track("2", "Despechá", "Rosalía", 181);
  const cover = track("3", "Despechá", "Otra persona");
  assert.equal(normalizeSearch("  ROSALÍA "), "rosalia");
  assert.deepEqual(rankTracks([cover, original, deluxe], "despecha rosalia"), [original, cover]);
});

test("first cloud sync preserves the guest library alongside remote data", () => {
  const a = track("a"), b = track("b");
  const result = mergeLibrary({}, library([a], [playlist([a])]), library([b], [playlist([b])]));
  assert.deepEqual(result.favorites.map(item => item.id), ["b", "a"]);
  assert.deepEqual(result.playlists[0].tracks.map(item => item.id), ["b", "a"]);
});

test("cloud sync ignores object key order and preserves playlist order changes", () => {
  const local = library([], [playlist([track("a"), track("b")])]);
  const sorted = JSON.parse(JSON.stringify(local, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value));
  assert.notEqual(JSON.stringify(local), JSON.stringify(sorted));
  assert.equal(equalLibraryData(local, sorted), true);
  sorted.playlists[0].tracks.reverse();
  assert.equal(equalLibraryData(local, sorted), false);
});

test("concurrent playlist edits keep new tracks, metadata and deletions", () => {
  const a = track("a"), b = track("b"), c = track("c");
  const base = library([a, b], [playlist([a, b])]);
  const local = library([b], [playlist([b], "Local")]);
  const remote = library([a, b, c], [{ ...playlist([a, b, c]), folder: "Compartidas" }]);
  const merged = mergeLibrary(base, local, remote);
  assert.deepEqual(merged.playlists[0].tracks.map(item => item.id), ["b", "c"]);
  assert.deepEqual(merged.favorites.map(item => item.id), ["b", "c"]);
  assert.equal(merged.playlists[0].name, "Local");
  assert.equal(merged.playlists[0].folder, "Compartidas");
});

test("listening statistics count only qualified plays and report actual seconds", () => {
  const song = track("a");
  const report = statsFor([
    { id: "1", at: 1000, track: song, seconds: 7, completed: false },
    { id: "2", at: 2000, track: song, seconds: 41, completed: true },
  ]);
  assert.equal(report.totalSeconds, 48);
  assert.equal(report.tracks.a.count, 1);
  assert.equal(report.artists.Ibra.seconds, 48);
});

test("playlist backup round-trip preserves track IDs and discards runtime stream URLs", () => {
  const value = JSON.stringify({
    schema: "ibramusic.playlist.v1",
    name: "Guardada",
    tracks: [{ ...track("a"), audioUrl: "https://example.test/temporary", youtubeUrl: "javascript:alert(1)" }],
  });
  const result = parsePlaylistBackup(value);
  assert.equal(result.name, "Guardada");
  assert.equal(result.tracks[0].id, "a");
  assert.equal(result.tracks[0].audioUrl, "");
  assert.equal(result.tracks[0].youtubeUrl, undefined);
  assert.throws(() => parsePlaylistBackup(JSON.stringify({ schema: "ibramusic.playlist.v1", name: "x", tracks: [null] })));
});

test("ID3 metadata reads a bounded title frame from a local file", async () => {
  const { readAudioTags } = await import("../src/services/audioTags.ts");
  const text = Buffer.concat([Buffer.from([3]), Buffer.from("Una canción")]);
  const frame = Buffer.alloc(10);
  frame.write("TIT2");
  frame.writeUInt32BE(text.length, 4);
  const header = Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, frame.length + text.length]);
  assert.deepEqual(await readAudioTags(new Blob([header, frame, text])), { title: "Una canción" });
});

test("deep links retain Unicode metadata and validate a public media ID", async () => {
  const { readMediaRoute } = await import("../src/services/links.ts");
  const params = new URLSearchParams({ album: "123", title: "Álbum + sencillo", artistName: "Ibra" });
  assert.deepEqual(readMediaRoute(params), { album: { id: "123", title: "Álbum + sencillo", artist: "Ibra", thumbnail: "" } });
  assert.deepEqual(readMediaRoute(new URLSearchParams({ artist: "id" })), {});
});
