import type { Format, SubtitleCue } from "../models";

export type ExportIssueCategory = "structural" | "text";

export type ExportIssueKind =
  | "overlap"
  | "invalid-time"
  | "time-precision"
  | "blank-line"
  | "empty"
  | "too-short"
  | "too-fast"
  | "too-long";

export interface ExportIssue {
  id: string;
  cueId: string;
  relatedCueId?: string;
  category: ExportIssueCategory;
  kind: ExportIssueKind;
  message: string;
}

export interface ExportValidation {
  format: Format;
  issues: ExportIssue[];
  structural: ExportIssue[];
  text: ExportIssue[];
}

const formatLabel = (format: Format) => (format === "vtt" ? "WebVTT" : "SRT");

export function validateExport(
  cues: SubtitleCue[],
  format: Format,
): ExportValidation {
  const issues: ExportIssue[] = [];
  const target = formatLabel(format);
  const add = (
    cue: SubtitleCue,
    category: ExportIssueCategory,
    kind: ExportIssueKind,
    message: string,
    relatedCueId?: string,
  ) =>
    issues.push({
      id: `${cue.id}-${kind}${relatedCueId ? `-${relatedCueId}` : ""}`,
      cueId: cue.id,
      relatedCueId,
      category,
      kind,
      message,
    });

  for (const cue of cues) {
    if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs)) {
      add(cue, "structural", "invalid-time", "时间不是有效数字");
      continue;
    }
    if (cue.startMs < 0 || cue.endMs < 0) {
      add(cue, "structural", "invalid-time", "时间不能早于 00:00:00.000");
    }
    if (cue.endMs <= cue.startMs) {
      add(
        cue,
        "structural",
        "invalid-time",
        `结束时间必须晚于开始时间（#${cue.index}）`,
      );
    }

    const fractionalFields = [
      cue.startMs % 1 !== 0 ? "开始" : "",
      cue.endMs % 1 !== 0 ? "结束" : "",
    ].filter(Boolean);
    if (fractionalFields.length) {
      add(
        cue,
        "structural",
        "time-precision",
        `${fractionalFields.join("与")}时间包含亚毫秒；${target} 时间码只支持到毫秒，直接导出会改变时长`,
      );
    }

    const duration = cue.endMs - cue.startMs;
    const chars = [...cue.text.replace(/\s/g, "")].length;
    if (!cue.text.trim()) {
      add(cue, "text", "empty", "字幕文本为空");
    } else if (cue.text.split("\n").some((line) => !line.trim())) {
      add(
        cue,
        "structural",
        "blank-line",
        "文本中包含空行；空行会提前结束该字幕条目",
      );
    }

    if (duration > 0) {
      if (duration < 800) {
        add(
          cue,
          "text",
          "too-short",
          `显示仅 ${(duration / 1000).toFixed(1)} 秒，可能来不及读完`,
        );
      }
      const cps = chars / (duration / 1000);
      if (cps > 18) {
        add(
          cue,
          "text",
          "too-fast",
          `阅读速度约 ${cps.toFixed(1)} 字/秒，建议放慢或精简`,
        );
      }
    }
    if (chars > 42 || cue.text.split("\n").length > 2) {
      add(
        cue,
        "text",
        "too-long",
        chars > 42 ? `${chars} 字，建议精简` : "超过两行，画面占用较高",
      );
    }
  }

  if (format === "vtt") {
    const validCues = cues
      .filter((cue) => cue.endMs > cue.startMs)
      .sort(
        (a, b) =>
          a.startMs - b.startMs || a.endMs - b.endMs || a.index - b.index,
      );
    let furthest: SubtitleCue | null = null;
    for (const cue of validCues) {
      if (furthest && cue.startMs < furthest.endMs) {
        const overlapMs = furthest.endMs - cue.startMs;
        add(
          cue,
          "structural",
          "overlap",
          `第 #${cue.index} 条与第 #${furthest.index} 条重叠 ${(overlapMs / 1000).toFixed(1)} 秒；WebVTT 播放器可能忽略或异常显示`,
          furthest.id,
        );
      }
      if (!furthest || cue.endMs > furthest.endMs) furthest = cue;
    }
  }

  const orderById = new Map(cues.map((cue, index) => [cue.id, index]));
  issues.sort(
    (a, b) =>
      (orderById.get(a.cueId) ?? 0) - (orderById.get(b.cueId) ?? 0) ||
      a.kind.localeCompare(b.kind),
  );

  return {
    format,
    issues,
    structural: issues.filter((issue) => issue.category === "structural"),
    text: issues.filter((issue) => issue.category === "text"),
  };
}
