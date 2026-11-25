import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearch, profileReleases, profileTracks, rankTracks } from "../src/services/catalog.ts";
import { equalLibraryData, indexLibraryTracks, mergeLibrary, pruneListenLater } from "../src/services/librarySync.ts";
import { statsFor } from "../src/services/listeningHistory.ts";
import { parsePlaylistBackup } from "../src/services/libraryFiles.ts";
import { ambientCoverPalette, coverBackground, desktopAmbientBackground, dominantCoverColor, readableCoverColors } from "../src/services/coverArt.ts";
import { crossfadeVolumes } from "../src/services/crossfade.ts";
import { parseLRC } from "../src/services/lyricsTiming.ts";

test("lyrics preserve source precision and only highlight words with source timestamps", () => {
  const lyrics = parseLRC("[00:01.5]First line\n[00:04.005]<00:04.005>Second <00:05.2>line<00:06.000>");
  assert.equal(lyrics[0].time, 1.5);
  assert.equal(lyrics[0].words, undefined);
  assert.equal(lyrics[1].time, 4.005);
  assert.deepEqual(lyrics[1].words, [
    { text: "Second", startTime: 4.005, endTime: 5.2 },
    { text: "line", startTime: 5.2, endTime: 6 },
  ]);
});

test("crossfade advances over the configured duration without changing the combined gain", () => {
  assert.deepEqual(crossfadeVolumes(-50, 4000, 0.75, false), { progress: 0, outgoing: 75, incoming: 0 });
  assert.deepEqual(crossfadeVolumes(2000, 4000, 0.75, false), { progress: 0.5, outgoing: 37, incoming: 38 });
  assert.deepEqual(crossfadeVolumes(5000, 4000, 0.75, false), { progress: 1, outgoing: 0, incoming: 75 });
  assert.deepEqual(crossfadeVolumes(2000, 4000, 0.75, true), { progress: 0.5, outgoing: 0, incoming: 0 });
});

test("the aura keeps the cover border's gray even when the center is brighter", () => {
  const size = 24;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gray = x === 0 || x === size - 1 || y === 0 || y === size - 1 ? 225 : 255;
      pixels.set([gray, gray, gray, 255], (y * size + x) * 4);
    }
  }
  assert.deepEqual(coverBackground(pixels, size, size), { color: "rgb(225 225 225)", light: true, muted: "rgb(85 85 85)" });
});

test("a purple aura brightens muted labels without changing the background", () => {
  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set([120, 77, 143, 255], index);
  const background = coverBackground(pixels, 16, 16);
  assert.equal(background.color, "rgb(120 77 143)");
  assert.equal(background.light, false);
  assert.ok(Number(background.muted.match(/\d+/)[0]) >= 232);
});

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

test("black stays the background of a cover with both red and blue accents", () => {
  const pixels = new Uint8ClampedArray(1000 * 4);
  for (let index = 0; index < 1000; index++) {
    const color = index < 555 ? [0, 0, 0] : index < 730 ? [240, 240, 240]
      : index < 885 ? [210, 20, 25] : [20, 120, 205];
    pixels.set([...color, 255], index * 4);
  }
  const palette = dominantCoverColor(pixels);
  assert.equal(palette.mostlyBlack, true);
  assert.ok(palette.hue >= 345 || palette.hue <= 15);
  assert.ok(palette.secondaryHue >= 190 && palette.secondaryHue <= 225);
});

test("a pale cover keeps a white background with navy and warm accents", () => {
  const pixels = new Uint8ClampedArray(1000 * 4);
  for (let index = 0; index < 1000; index++) {
    const color = index < 280 ? [244, 248, 250] : index < 490 ? [40, 53, 105]
      : index < 725 ? [180, 185, 192] : [194, 118, 72];
    pixels.set([...color, 255], index * 4);
  }
  const palette = dominantCoverColor(pixels);
  assert.equal(palette.mostlyWhite, true);
  assert.ok(palette.hue >= 215 && palette.hue <= 240);
  assert.ok(palette.secondaryHue >= 18 && palette.secondaryHue <= 40);
});

test("secondary ambient groups similar dark pixels before ranking and ignores stray pixels", () => {
  const pixels = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) {
    const rgb = i < 30 ? [25, 15, 28] : i < 55 ? [36, 15, 28]
      : i < 81 ? [20, 48, 100] : i < 99 ? [240, 240, 240] : [0, 90, 0];
    pixels.set([...rgb, 255], i * 4);
  }
  const palette = ambientCoverPalette(pixels);
  assert.equal(palette.dominant, "rgb(30 15 28)");
  assert.equal(palette.secondaryDark, "rgb(20 48 100)");
  assert.equal(palette.deepest, "rgb(30 15 28)");
});

test("secondary ambient handles monochrome, saturated and missing covers", () => {
  for (const rgb of [[0, 0, 0], [255, 255, 255], [88, 88, 88], [245, 28, 35], [28, 67, 220], [35, 239, 86]]) {
    const palette = ambientCoverPalette(Uint8ClampedArray.of(...rgb, 255));
    assert.equal(palette.dominant, `rgb(${rgb.join(" ")})`);
    assert.equal(palette.secondaryDark, `rgb(${rgb.map(channel => Math.round(channel * 0.48)).join(" ")})`);
  }
  assert.equal(ambientCoverPalette(Uint8ClampedArray.of(210, 30, 50, 0)), null);
});

test("a cover with only one dark neutral uses a real colored detail as the second tone", () => {
  const pixels = new Uint8ClampedArray(400);
  for (let i = 0; i < 100; i++) {
    const rgb = i < 68 ? [245, 245, 245] : i < 88 ? [10, 10, 10] : [206, 150, 38];
    pixels.set([...rgb, 255], i * 4);
  }
  assert.deepEqual(ambientCoverPalette(pixels), {
    dominant: "rgb(245 245 245)", secondaryDark: "rgb(99 72 18)",
    deepest: "rgb(10 10 10)", detail: "rgb(206 150 38)",
  });
});

test("desktop ambient modes use their own palette colors and preserve the base theme", () => {
  const palette = { hue: 0, saturation: 90, mostlyBlack: false,
    background: { color: "rgb(255 255 255)", light: true, muted: "" },
    ambient: { dominant: "rgb(255 255 255)", secondaryDark: "rgb(20 75 130)", deepest: "rgb(0 0 0)", detail: "rgb(220 20 35)" } };
  for (const theme of ["dark", "bright", "noir"]) {
    const backgrounds = ["cover", "secondary"].map(mode => desktopAmbientBackground(mode, theme, palette));
    assert.equal(new Set(backgrounds).size, 2);
    assert.ok(backgrounds.every(color => readableCoverColors(color).light === (theme === "bright")));
  }
  assert.equal(desktopAmbientBackground("secondary", "dark"), "rgb(23 24 29)");
  const monochrome = { ...palette, saturation: 0, ambient: {
    dominant: "rgb(220 220 220)", secondaryDark: "rgb(85 85 85)", deepest: "rgb(25 25 25)", detail: "rgb(220 220 220)",
  } };
  for (const mode of ["cover", "secondary"]) {
    assert.match(desktopAmbientBackground(mode, "dark", monochrome), /^rgb\((\d+) \1 \1\)$/);
  }
});

test("ambient contrast adapts controls on white, black and saturated backgrounds", () => {
  assert.equal(readableCoverColors("rgb(255 255 255)", "rgb(0 0 0)").light, true);
  assert.equal(readableCoverColors("rgb(0 0 0)", "rgb(255 255 255)").light, false);
  assert.equal(readableCoverColors("rgb(0 0 0)", "rgb(255 255 255)").accent, "rgb(255 255 255)");
  assert.equal(readableCoverColors("rgb(255 0 0)").light, true);
  assert.match(readableCoverColors("rgb(255 0 0)", "rgb(255 0 0)", true).accent, /^rgb\(([1-9]|[12]\d) 0 0\)$/);
  assert.ok(readableCoverColors("rgb(255 255 255)", undefined, true).imageOpacity > 0.3);
  assert.ok(readableCoverColors("rgb(117 117 117)", undefined, true).imageOpacity < 0.1);
});

const track = (id, title = id, artist = "Ibra", duration = 180) => ({ id, title, artist, duration, audioUrl: "", thumbnail: "" });
test("artist profiles retain credited songs and reject similar artist names", () => {
  const artist = { id: "42", name: "Sainté", thumbnail: "" };
  const solo = track("1", "Solo", "Sainte");
  const collab = { ...track("2", "Collab", "Another artist"), artists: [{ id: "42", name: "Sainté" }] };
  assert.deepEqual(profileTracks([solo, track("3", "Unrelated", "Sainte Marie"), collab], artist), [solo, collab]);
  assert.deepEqual(profileTracks([], artist), []);
});

test("unrelated artist credits cannot match a profile by a reused numeric ID", () => {
  const artist = { id: "42", name: "2Pac", thumbnail: "" };
  const unrelated = { ...track("1", "Apache", "Hot Butter"), artistId: "42" };
  const collaboration = { ...track("2", "Collaboration", "Guest"), artists: [{ id: "73", name: "2Pac" }] };
  assert.deepEqual(profileTracks([unrelated, collaboration], artist), [collaboration]);
  assert.deepEqual(profileReleases([{ id: "1", title: "Apache", artist: "Hot Butter", artistId: "42", thumbnail: "" }], artist), []);
});

test("artist releases keep declared types, deduplicate normalized titles and leave missing types unknown", () => {
  const artist = { id: "42", name: "Sainté", thumbnail: "" };
  const release = { artist: "Sainte", title: "Écho", thumbnail: "" };
  const single = { ...release, id: "2", title: "Echo", releaseType: "single" };
  const ep = { ...release, id: "3", releaseType: "ep" };
  const unknown = { ...release, id: "4", title: "Another release" };
  assert.deepEqual(profileReleases([{ ...release, id: "1" }, single, ep, unknown], artist), [single, ep, unknown]);
});
test("artist releases preserve distinct editions and compilations", () => {
  const artist = { id: "42", name: "Artist", thumbnail: "" };
  const original = { id: "1", title: "Title", artist: artist.name, thumbnail: "", releaseType: "album", releaseDate: "1994-01-01", numberOfTracks: 10 };
  const edition = { ...original, id: "2", releaseDate: "2024-01-01", numberOfTracks: 16 };
  const compilation = { ...original, id: "3", releaseType: "compilation" };
  assert.deepEqual(profileReleases([original, { ...original, id: "4" }, edition, compilation], artist), [edition, original, compilation]);
});
test("Listen Later checks stable IDs and corroborates cross-provider versions by duration", () => {
  const original = track("yt-abcdefghijk", "Écho", "Sainté", 180);
  const has = indexLibraryTracks([original]);
  assert.equal(has(track("abcdefghijk", "Different metadata", "Another name", 250)), true);
  assert.equal(has(track("2", "Echo", "Sainte", 181)), true);
  assert.equal(has(track("3", "Echo", "Sainte", 240)), false);
  assert.equal(has(track("4", "Echo", "Other artist", 180)), false);
});

test("Listen Later merges device changes and gives favorites and playlists priority", () => {
  const a = track("1", "Echo", "Sainte", 180);
  const equivalent = track("2", "Écho", "Sainté", 181);
  const b = track("3", "Other");
  const c = track("4", "Pending");
  const entry = track => ({ id: track.id, track, savedAt: "2026-11-23T00:00:00Z" });
  const local = { ...library(), listenLater: [entry(a), entry(b), entry(c)] };
  const remote = { ...library([equivalent], [playlist([b]), { ...playlist([b]), id: "second" }]), listenLater: [] };
  const synced = mergeLibrary({}, local, remote);
  assert.deepEqual(synced.listenLater, [entry(c)]);
  assert.deepEqual(synced.favorites, remote.favorites);
  assert.deepEqual(synced.playlists, remote.playlists);
  assert.deepEqual(mergeLibrary(synced, synced, { favorites: [], playlists: [] }).listenLater, [entry(c)]);
  assert.deepEqual(pruneListenLater([entry(a), entry(equivalent)], indexLibraryTracks([])), [entry(a)]);
});

const playlist = (tracks, name = "Mezcla") => ({ id: "mix", name, tracks });
test("playlist cover fit survives concurrent edits and can return to fit", () => {
  const before = { ...playlist([]), coverUrl: "original", coverFit: "cover" };
  const local = { ...before, coverFit: "contain" };
  const remote = { ...before, name: "Renamed" };
  const [merged] = mergeLibrary(library([], [before]), library([], [local]), library([], [remote])).playlists;
  assert.equal(merged.coverFit, "contain");
  assert.equal(merged.coverUrl, "original");
  assert.equal(merged.name, "Renamed");
});
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
