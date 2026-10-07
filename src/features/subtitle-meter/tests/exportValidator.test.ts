import { describe, expect, it } from "vitest";
import { validateExport } from "../analyzers/exportValidator";
import type { SubtitleCue } from "../models";

const cue = (
  index: number,
  startMs: number,
  endMs: number,
  text = `字幕 ${index}`,
): SubtitleCue => ({ id: `cue-${index}`, index, startMs, endMs, text });

describe("export validation", () => {
  it("keeps valid cues clear for every target format", () => {
    const cues = [cue(1, 0, 2000), cue(2, 2000, 4200, "第二条")];
    expect(validateExport(cues, "srt").issues).toEqual([]);
    expect(validateExport(cues, "vtt").issues).toEqual([]);
  });

  it("blocks zero and negative duration with the affected cue", () => {
    const validation = validateExport(
      [cue(1, 1000, 1000), cue(2, 3000, 2000)],
      "vtt",
    );
    expect(validation.structural.map((issue) => issue.kind)).toEqual([
      "invalid-time",
      "invalid-time",
    ]);
    expect(validation.structural[0].cueId).toBe("cue-1");
    expect(validation.structural[1].cueId).toBe("cue-2");
    expect(validation.structural[1].message).toContain("#2");
  });

  it("blocks overlaps for WebVTT but allows the same cues for SRT", () => {
    const cues = [cue(1, 0, 2000), cue(2, 1500, 3000)];
    expect(
      validateExport(cues, "vtt").structural.map((issue) => issue.kind),
    ).toEqual(["overlap"]);
    expect(
      validateExport(cues, "srt").structural.map((issue) => issue.kind),
    ).toEqual([]);
  });

  it("reports nested overlaps against both affected cues", () => {
    const validation = validateExport(
      [cue(1, 0, 5000), cue(2, 1000, 2000), cue(3, 3000, 6000)],
      "vtt",
    );
    expect(validation.structural.map((issue) => issue.cueId)).toEqual([
      "cue-2",
      "cue-3",
    ]);
    expect(validation.structural[0].message).toContain("#1");
  });

  it("blocks sub-millisecond precision for either format", () => {
    const validation = validateExport([cue(1, 0.25, 1000.75)], "vtt");
    expect(validation.structural.map((issue) => issue.kind)).toEqual([
      "time-precision",
    ]);
    expect(validation.structural[0].message).toContain("亚毫秒");
  });

  it("keeps empty and reading-pressure issues in the non-blocking text group", () => {
    const validation = validateExport([cue(1, 0, 100, "")], "srt");
    expect(validation.structural).toEqual([]);
    expect(validation.text.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["empty", "too-short"]),
    );
  });

  it("blocks a blank line inside cue text because it terminates the serialized cue", () => {
    const validation = validateExport(
      [cue(1, 0, 2000, "第一行\n\n第二行")],
      "vtt",
    );
    expect(validation.structural.map((issue) => issue.kind)).toEqual([
      "blank-line",
    ]);
  });
});
