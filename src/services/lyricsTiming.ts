interface LyricWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  words?: LyricWord[];
}

function parseTimeTag(m: string, s: string, ms?: string): number {
  const min = parseInt(m, 10);
  const sec = parseInt(s, 10);
  return min * 60 + sec + (ms ? Number("0." + ms) : 0);
}

export function parseLRC(lrc: string, rawLrc?: string, enableWordSync: boolean = true): LyricLine[] {
  const source = (enableWordSync && rawLrc && rawLrc.includes("<")) ? rawLrc : (lrc || rawLrc || "");
  if (!source) return [];

  const lines = source.split("\n");
  const result: LyricLine[] = [];
  const lineTimeReg = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

  // Step 1: Parse all timestamped lines and explicit <mm:ss.xx> word tags if present
  for (const rawLine of lines) {
    const lineMatches = [...rawLine.matchAll(lineTimeReg)];
    if (lineMatches.length === 0) continue;

    const rest = rawLine.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
    if (!rest) continue;

    let words: LyricWord[] | undefined = undefined;
    if (enableWordSync && rest.includes("<")) {
      const wordRegex = /<(\d+):(\d+)(?:\.(\d+))?>([^<]*)/g;
      const tokens: { time: number; text: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = wordRegex.exec(rest)) !== null) {
        tokens.push({
          time: parseTimeTag(m[1], m[2], m[3]),
          text: m[4]
        });
      }

      if (tokens.length > 0) {
        words = [];
        for (let i = 0; i < tokens.length; i++) {
          const current = tokens[i];
          const textTrimmed = current.text.trim();
          if (!textTrimmed && i === tokens.length - 1) {
            if (words.length > 0) {
              words[words.length - 1].endTime = current.time;
            }
            continue;
          }
          if (!textTrimmed) continue;
          const nextToken = tokens[i + 1];
          const endTime = nextToken ? nextToken.time : Infinity;
          words.push({
            text: textTrimmed,
            startTime: current.time,
            endTime: endTime
          });
        }
      }
    }

    const cleanText = words && words.length > 0
      ? words.map(w => w.text.trim()).filter(Boolean).join(" ").trim()
      : rawLine.replace(lineTimeReg, "").replace(/<\d+:\d+(?:\.\d+)?>/g, " ").replace(/\s+/g, " ").trim();

    for (const match of lineMatches) {
      const time = parseTimeTag(match[1], match[2], match[3]);
      result.push({ time, text: cleanText, words });
    }
  }

  result.sort((a, b) => a.time - b.time);

  return result;
}
