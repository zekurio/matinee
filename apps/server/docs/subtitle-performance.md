# Indexed subtitle extraction measurements

All media reads were read-only. No production deployment, service change,
database write or cache eviction was performed. Temporary inputs and outputs
were under `/tmp`. The production endpoint was used only to retrieve its
already-cached Mononoke stream-10 WebVTT for comparison.

## Method

Call `indexedSubtitle(path, ffprobeStreamIndex)` directly with Node 24,
measure `performance.now()` around the call, and save `result.bytes` to a
scratch `.mkv`. `result.bytesRead` counts actual requested source bytes,
including repeated headers. It does not count filesystem readahead or
physical disk traffic. Convert the scratch input with the production
jellyfin-ffmpeg:

```sh
ffmpeg -v error -copyts -i /tmp/indexed.mkv -map 0:s:0 \
  -c:s webvtt -y /tmp/indexed.vtt
# PGS instead uses -c:s copy and a .sup output.
```

For comparison use the original media with `-map 0:<index>` and without
`-copyts`, matching the existing extraction. Compare with `cmp`, before
WebVTT cleaning. The small-input conversion took 68 ms on Mononoke. The
new times below measure indexed reading and input construction, not HTTP,
queue waiting or this final ffmpeg invocation.

## Results

Sizes are decimal GB. New runs are first indexed reads unless noted.
Full-read baselines for episodes were run after the indexed read, so their
small indexed regions were already cached. No system page cache was dropped.

| File                         |     GB | Stream | Codec      | Old full read                          |                                         New indexed read | Source bytes read | Equivalence                                      |
| ---------------------------- | -----: | -----: | ---------- | -------------------------------------- | -------------------------------------------------------: | ----------------: | ------------------------------------------------ |
| Princess Mononoke 1997 remux | 91.626 |     10 | SRT        | 378 s, supplied production measurement | 55.79 s serial prototype; 8.29 s final reader, later run |           561,186 | Byte-identical to production WebVTT, 1,131 cues  |
| Princess Mononoke 1997 remux | 91.626 |     11 | SRT        | 378 s estimated at supplied 242 MB/s   |              10.90 s, neighbouring track already touched |           571,525 | 1,198 indexed blocks; not independently compared |
| Princess Mononoke 1997 remux | 91.626 |      8 | SRT forced | 378 s estimated                        |                         0.191 s, previously touched file |           469,495 | 8 indexed blocks; not independently compared     |
| Last Seen S01E06, WAYNE      |  4.326 |      4 | SRT        | 20.30 s measured                       |                                                   3.05 s |            94,593 | Byte-identical WebVTT, 545 cues                  |
| Blue Box S01E04, WeebPinn    |  1.215 |      6 | ASS        | 9.33 s measured                        |                                                   5.51 s |            87,961 | Byte-identical WebVTT, 409 cues                  |
| Blue Box S01E01, WeebPinn    |  1.213 |      6 | ASS        | 12.16 s measured                       |                                                   4.94 s |            74,170 | Byte-identical WebVTT, 304 cues                  |
| Nadia S01E29, ABJ            |  1.994 |      4 | PGS        | 8.09 s measured                        |                                                   5.60 s |         7,619,686 | Byte-identical SUP, 2,456 segments               |
| Nadia S01E30, ABJ            |  1.994 |      4 | PGS        | 15.18 s measured                       |                                                   7.30 s |         8,002,654 | Byte-identical SUP                               |

`fincore` reported **zero resident pages** immediately before the Last Seen
and Nadia S01E30 indexed reads. Cache residency was not measured before the
other first reads. Mononoke's later timings must not be presented as clean
cold-cache results. The serial prototype did not meet the latency goal.
The final reader substantially reduces source I/O, but a verified few-second
cold extraction of the 91 GB example remains unproven.

A PGS-only fixture remuxed from Nadia S01E29 using mkvmerge 103 with
`--compression 0:zlib` also produced byte-identical SUP through both paths.
Its indexed read took 185 ms and read 4,981,815 bytes, with warm fixture
pages. A second fixture, made by remuxing Last Seen's SRT with mkvmerge,
then replacing Segment and Cluster sizes with unknown-size values without
moving any bytes, produced byte-identical WebVTT through the indexed path.
Header stripping, SSA and laced subtitle blocks are retained by construction
but were not independently exercised. These need additional fixture coverage.

## Decisions and limits

- Extract only the selected track. On Mononoke the forced text track needs
  eight blocks, whereas the other text tracks need 1,072, 1,131 and 1,198.
  Eagerly filling all text caches would turn an eight-block request into
  3,409 block reads. Sharing a 467 kB cue scan does not justify this. PGS is also
  selected-only: Nadia needs about 8 MB for one full track. No library-wide
  pre-extraction was added.
- Preserve blocks and TrackEntry in a small Matroska file rather than
  reimplementing ASS and PGS conversion. `-copyts` is necessary for this
  input: without it the PGS-only demuxer rebased Nadia's first picture by
  16.617 seconds. Segment payloads were already identical; adding it made
  the complete SUP byte-identical.
- Serial reads lost to seek latency. The reader now issues bounded windows
  of 16 blocks, sorted by source offset, using asynchronous positioned
  reads. This is local to the parser, not another background job limiter.
- The existing queue, per-track cache, atomic rename, timeout and failure
  memory remain. Conversion of the small input failing retries the original
  ffmpeg input. Missing cues for a particular track do not affect other
  tracks' eligibility.
- No suitable MP4/MOV media was found under the three library roots. Their
  extraction path is unchanged; sample-table performance was not measured.
- Warm delivery already measured about 10 ms in production. Re-cleaning
  old cached WebVTT preserves existing cache compatibility. Sidecar
  decoding and stale-directory cleanup were left unchanged without evidence
  that they dominate latency. PGS query-cache retention was also left
  unchanged because each inactive track can retain tens of MB and the
  browser already revalidates its HTTP cache.
- Fallback batching and playback-start prewarming were not implemented.
  They remain follow-up work for files without usable subtitle indexes.
  Native Android can render embedded ASS/PGS directly, so indiscriminate
  prewarming would extract tracks it does not request. Downloads continue
  to share `openSubtitle` and benefit from the indexed path.

The slow path includes non-Matroska sources, no initial SeekHead or missing
Info/Tracks/Cues seek targets, absent cues for the selected track, cues
without relative block positions, invalid/duplicate offsets, unsupported
codecs, encryption or compression other than zlib/header stripping, read
errors, and safety-limit violations. Limits are 32 MiB per metadata/block
read, 128 MiB aggregate reads and constructed input, 100,000 selected cue
positions and 32 SeekHeads. Oversized or malformed input returns to ffmpeg.

Remaining correctness caveats: the fast path trusts a track's cue index to
cover its blocks. A syntactically valid but incomplete index can omit cues
without detection; proving completeness would require a full cluster scan.
Unusual files whose original demuxer start time is nonzero also need timing
comparison. The tested sources matched exactly, but this is not evidence
for every Matroska muxer or layout.
