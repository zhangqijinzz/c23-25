import { describe, expect, it } from "vitest";
import { validateForExport } from "../analyzers/exportValidator";
import type { SubtitleCue } from "../models";

const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text = "字幕内容",
  index = Number(id),
): SubtitleCue => ({ id: `cue-${id}`, index, startMs, endMs, text });

const kinds = (issues: { kind: string }[]) => issues.map((i) => i.kind);

describe("export validation - structural blockers", () => {
  it("flags zero-duration and reversed cues regardless of format", () => {
    for (const format of ["srt", "vtt"] as const) {
      const check = validateForExport(
        [cue("1", 1000, 1000, "A"), cue("2", 3000, 2000, "B")],
        format,
      );
      expect(kinds(check.structural)).toEqual(
        expect.arrayContaining(["zero-duration"]),
      );
      expect(check.textual).toEqual([]);
    }
  });

  it("flags negative or non-finite timecodes as invalid-time", () => {
    const check = validateForExport(
      [cue("1", -100, 1000, "A"), cue("2", 0, Number.NaN, "B")],
      "vtt",
    );
    expect(
      kinds(check.structural).filter((k) => k === "invalid-time"),
    ).toHaveLength(2);
  });

  it("flags overlapping time ranges for both formats", () => {
    const cues = [cue("1", 0, 2000, "A"), cue("2", 1500, 3000, "B")];
    expect(kinds(validateForExport(cues, "vtt").structural)).toContain(
      "overlap",
    );
    expect(kinds(validateForExport(cues, "srt").structural)).toContain(
      "overlap",
    );
  });

  it("treats touching edges as valid", () => {
    const check = validateForExport(
      [cue("1", 0, 2000, "A"), cue("2", 2000, 3000, "B")],
      "vtt",
    );
    expect(check.structural).toEqual([]);
  });

  it("flags cues whose list order disagrees with time order", () => {
    const check = validateForExport(
      [
        cue("1", 0, 1000, "A"),
        cue("2", 5000, 6000, "B"),
        cue("3", 2000, 3000, "C"),
      ],
      "vtt",
    );
    const orderIssues = check.structural.filter((i) => i.kind === "cue-order");
    expect(orderIssues).toHaveLength(1);
    expect(orderIssues[0].cueId).toBe("cue-3");
    expect(orderIssues[0].message).toContain("#2");
  });

  it("flags sub-millisecond precision that the formatter would silently truncate", () => {
    const check = validateForExport([cue("1", 0.5, 999.9, "A")], "vtt");
    expect(kinds(check.structural)).toContain("time-precision");
  });

  it("reports the specific cue index in structural messages", () => {
    const check = validateForExport(
      [cue("1", 0, 1000, "A"), cue("2", 500, 800, "B")],
      "vtt",
    );
    const overlap = check.structural.find((i) => i.kind === "overlap");
    expect(overlap?.cueId).toBe("cue-2");
    expect(overlap?.message).toContain("#2");
    expect(overlap?.message).toContain("#1");
  });
});

describe("export validation - format specific textual issues", () => {
  it("treats empty text as textual so export can continue", () => {
    const check = validateForExport([cue("1", 0, 1000, "   ")], "vtt");
    expect(check.structural).toEqual([]);
    expect(kinds(check.textual)).toEqual(["empty-text"]);
  });

  it("checks WebVTT markup only when exporting vtt", () => {
    const cues = [
      cue("1", 0, 1000, "<b>粗体</b>"),
      cue("2", 1000, 2000, "<i>未闭合"),
      cue("3", 2000, 3000, "Tom & Jerry"),
      cue("4", 3000, 4000, "<v Jim>说话</v>"),
    ];
    const vtt = validateForExport(cues, "vtt");
    expect(vtt.structural).toEqual([]);
    expect(kinds(vtt.textual)).toEqual(
      expect.arrayContaining(["markup-mismatch", "unescaped-ampersand"]),
    );
    // 平衡的标签与说话人标签在 VTT 下合法
    const messages = vtt.textual.map((i) => i.message).join(" ");
    expect(messages).not.toContain("#1");
    expect(messages).not.toContain("#4");
  });

  it("flags VTT-only markup when exporting SRT, but accepts the same text as VTT", () => {
    const cues = [
      cue("1", 0, 1000, "<v Jim>台词</v>"),
      cue("2", 1000, 2000, "跳转 <00:00:01.000>"),
    ];
    const srt = validateForExport(cues, "srt");
    expect(kinds(srt.textual)).toEqual(
      expect.arrayContaining(["vtt-markup-in-srt"]),
    );
    expect(
      srt.textual.filter((i) => i.kind === "vtt-markup-in-srt"),
    ).toHaveLength(2);
    const vtt = validateForExport(cues, "vtt");
    expect(vtt.structural).toEqual([]);
    expect(vtt.textual).toEqual([]);
  });

  it("changes conclusions when the target format changes", () => {
    const cues = [cue("1", 0, 1000, "<v Jim>台词</v>")];
    expect(validateForExport(cues, "vtt").structural).toEqual([]);
    expect(validateForExport(cues, "vtt").textual).toEqual([]);
    const srt = validateForExport(cues, "srt");
    expect(srt.textual[0]?.kind).toBe("vtt-markup-in-srt");
  });

  it("accepts a clean project for both formats without any issues", () => {
    const cues = [
      cue("1", 0, 2000, "第一行字幕"),
      cue("2", 2120, 4000, "第二行字幕"),
    ];
    expect(validateForExport(cues, "srt")).toMatchObject({
      structural: [],
      textual: [],
    });
    expect(validateForExport(cues, "vtt")).toMatchObject({
      structural: [],
      textual: [],
    });
  });
});
