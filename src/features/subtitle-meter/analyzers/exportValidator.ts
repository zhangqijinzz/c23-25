import type { Format, SubtitleCue } from "../models";

export type ExportIssueKind =
  | "invalid-time"
  | "time-precision"
  | "zero-duration"
  | "cue-order"
  | "overlap"
  | "empty-text"
  | "markup-mismatch"
  | "unescaped-ampersand"
  | "vtt-markup-in-srt";

export interface ExportIssue {
  id: string;
  cueId: string;
  kind: ExportIssueKind;
  message: string;
}

export interface ExportCheck {
  format: Format;
  structural: ExportIssue[];
  textual: ExportIssue[];
}

const KNOWN_VTT_TAGS = new Set(["b", "i", "u", "c", "v", "lang", "ruby", "rt"]);

const VTT_ONLY_TAGS = new Set(["c", "v", "lang"]);

function refOf(cue: SubtitleCue): string {
  return `#${cue.index}`;
}

function hasSubMsPrecision(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms - Math.trunc(ms)) > 1e-6;
}

function markupTokens(text: string): string[] {
  return text.match(/<[^>\n]*>/g) ?? [];
}

function tagInner(token: string): string {
  return token.slice(1, -1).trim();
}

function tagName(inner: string): string {
  return inner.split(/[\s.:]/, 1)[0].toLowerCase();
}

function isTimestampTag(inner: string): boolean {
  return /^\d{1,}:\d{2}:\d{2}[.,]\d{1,3}$/.test(inner);
}

function inspectVttMarkup(
  cue: SubtitleCue,
  add: (kind: ExportIssueKind, message: string) => void,
) {
  const stack: string[] = [];
  let unknown = false,
    mismatch = false;
  for (const token of markupTokens(cue.text)) {
    const inner = tagInner(token);
    if (!inner || /^\s*\/?\s*$/.test(inner)) {
      unknown = true;
      continue;
    }
    if (isTimestampTag(inner)) continue;
    if (inner.startsWith("/")) {
      const name = tagName(inner.slice(1).trim());
      if (!KNOWN_VTT_TAGS.has(name) || stack[stack.length - 1] !== name) {
        mismatch = true;
        continue;
      }
      stack.pop();
    } else {
      const name = tagName(inner);
      if (!KNOWN_VTT_TAGS.has(name)) {
        unknown = true;
        continue;
      }
      stack.push(name);
    }
  }
  if (stack.length)
    add(
      "markup-mismatch",
      `${refOf(cue)} 存在未闭合的 WebVTT 样式标签（${[...new Set(stack)].join("、")}），部分播放器会忽略整条字幕`,
    );
  if (mismatch)
    add(
      "markup-mismatch",
      `${refOf(cue)} 的 WebVTT 标签闭合不匹配，样式可能显示异常`,
    );
  if (unknown)
    add(
      "markup-mismatch",
      `${refOf(cue)} 含无法识别的 WebVTT 标签，部分播放器会原样显示`,
    );
  if (/(^|[^&])&(?!#?\w+;)/.test(cue.text))
    add(
      "unescaped-ampersand",
      `${refOf(cue)} 含未转义的 “&”，WebVTT 中应写为 &amp;`,
    );
}

function inspectSrtText(
  cue: SubtitleCue,
  add: (kind: ExportIssueKind, message: string) => void,
) {
  const found = new Set<string>();
  for (const token of markupTokens(cue.text)) {
    const inner = tagInner(token);
    if (isTimestampTag(inner)) found.add("时间戳");
    else {
      const name = tagName(
        inner.startsWith("/") ? inner.slice(1).trim() : inner,
      );
      if (VTT_ONLY_TAGS.has(name))
        found.add(
          name === "v" ? "说话人" : name === "lang" ? "语言" : "样式类",
        );
    }
  }
  if (found.size)
    add(
      "vtt-markup-in-srt",
      `${refOf(cue)} 含 WebVTT 专有标签（${[...found].join("、")}），导出 SRT 后多数播放器会原样显示尖括号`,
    );
}

export function validateForExport(
  cues: SubtitleCue[],
  format: Format,
): ExportCheck {
  const structural: ExportIssue[] = [],
    textual: ExportIssue[] = [];
  const addStructural = (
    cue: SubtitleCue,
    kind: ExportIssueKind,
    message: string,
  ) =>
    structural.push({ id: `${cue.id}-${kind}`, cueId: cue.id, kind, message });
  const addTextual = (
    cue: SubtitleCue,
    kind: ExportIssueKind,
    message: string,
  ) => textual.push({ id: `${cue.id}-${kind}`, cueId: cue.id, kind, message });

  cues.forEach((cue, position) => {
    if (
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 ||
      cue.endMs < 0
    ) {
      addStructural(
        cue,
        "invalid-time",
        `${refOf(cue)} 时间码非法或为负数，${format.toUpperCase()} 不接受该时间码`,
      );
      return;
    }
    if (hasSubMsPrecision(cue.startMs) || hasSubMsPrecision(cue.endMs))
      addStructural(
        cue,
        "time-precision",
        `${refOf(cue)} 含亚毫秒时间，${format.toUpperCase()} 只支持毫秒精度，导出时会被截断导致时间错位`,
      );
    if (cue.endMs <= cue.startMs)
      addStructural(
        cue,
        "zero-duration",
        `${refOf(cue)} 结束时间不晚于开始时间（${cue.startMs} → ${cue.endMs} ms），零/负时长条目会被播放器忽略`,
      );
    if (
      position > 0 &&
      cue.startMs < cues[position - 1].startMs &&
      Number.isFinite(cues[position - 1].startMs)
    ) {
      addStructural(
        cue,
        "cue-order",
        `${refOf(cue)} 开始时间早于列表中上一条 ${refOf(cues[position - 1])}，导出条目首尾顺序与列表不一致`,
      );
    }
    if (!cue.text.trim())
      addTextual(
        cue,
        "empty-text",
        `${refOf(cue)} 字幕文本为空，仍可导出空白条目`,
      );
    if (format === "vtt")
      inspectVttMarkup(cue, (kind, message) => addTextual(cue, kind, message));
    else inspectSrtText(cue, (kind, message) => addTextual(cue, kind, message));
  });

  const ordered = cues
    .filter(
      (cue) =>
        Number.isFinite(cue.startMs) &&
        Number.isFinite(cue.endMs) &&
        cue.startMs >= 0 &&
        cue.endMs > cue.startMs &&
        !hasSubMsPrecision(cue.startMs) &&
        !hasSubMsPrecision(cue.endMs),
    )
    .map((cue, orderIndex) => ({ cue, orderIndex }))
    .sort(
      (a, b) => a.cue.startMs - b.cue.startMs || a.orderIndex - b.orderIndex,
    );
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1].cue,
      cur = ordered[i].cue;
    if (cur.startMs < prev.endMs)
      structural.push({
        id: `${cur.id}-overlap`,
        cueId: cur.id,
        kind: "overlap",
        message: `${refOf(cur)} 与 ${refOf(prev)} 时间重叠 ${((prev.endMs - cur.startMs) / 1000).toFixed(1)} 秒，播放器可能只显示后一条或显示异常`,
      });
  }

  return { format, structural, textual };
}
