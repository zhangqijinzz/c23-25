import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";
import { readTextFile } from "../services/fileService";
import { downloadSubtitles } from "../services/exportService";
vi.mock("../services/fileService", () => ({
  readTextFile: vi.fn(
    async () => "1\n00:00:01,000 --> 00:00:03,000\nOriginal caption",
  ),
}));
vi.mock("../repositories/projectRepository", () => ({
  projectRepository: {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
  },
}));
vi.mock("../services/exportService", () => ({ downloadSubtitles: vi.fn() }));
describe("SubtitleMeterViewModel", () => {
  let vm: SubtitleMeterViewModel;
  beforeEach(() => {
    vi.clearAllMocks();
    vm = new SubtitleMeterViewModel();
  });
  it("imports, edits, rechecks, snapshots, and exports", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    expect(vm.state.phase).toBe("ready");
    const cue = vm.state.project!.cues[0];
    await vm.editCue(cue.id, { text: "Edited" });
    expect(vm.state.project!.cues[0].text).toBe("Edited");
    await vm.saveVersion();
    expect(vm.state.project!.versions).toHaveLength(1);
    await vm.exportFile();
    expect(vm.state.notice).toBe("字幕文件已导出");
  });
  it("keeps a recoverable error when an unsupported import is selected", async () => {
    await vm.importFile(new File(["x"], "clip.txt"));
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("仅支持");
  });
  it("shows a parse failure as a recoverable import error", async () => {
    vi.mocked(readTextFile).mockResolvedValueOnce("not a subtitle block");
    await vm.importFile(new File(["x"], "clip.srt"));
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("缺少时间码");
  });
  it("keeps editing visible immediately and reports export failures", async () => {
    await vm.importFile(new File(["x"], "clip.srt"));
    const cue = vm.state.project!.cues[0];
    const saving = vm.editCue(cue.id, { text: "Immediate edit" });
    expect(vm.state.project!.cues[0].text).toBe("Immediate edit");
    await saving;
    vi.mocked(downloadSubtitles).mockImplementationOnce(() => {
      throw new Error("download unavailable");
    });
    await vm.exportFile();
    expect(vm.state.phase).toBe("error");
    expect(vm.state.notice).toContain("导出失败");
    expect(vm.state.project!.cues[0].text).toBe("Immediate edit");
  });

  const importTwoCues = async (fileName = "clip.srt") => {
    vi.mocked(readTextFile).mockResolvedValueOnce(
      "1\n00:00:01,000 --> 00:00:03,000\nFirst\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond",
    );
    await vm.importFile(new File(["x"], fileName));
  };

  it("blocks export on structural problems even when forced", async () => {
    await importTwoCues();
    const first = vm.state.project!.cues[0];
    await vm.editCue(first.id, { endMs: 5000 });
    expect(await vm.exportFile()).toBe(false);
    expect(await vm.exportFile(true)).toBe(false);
    expect(downloadSubtitles).not.toHaveBeenCalled();
    expect(vm.state.notice).toContain("结构性问题");
  });

  it("pauses on textual-only problems but allows forcing the export", async () => {
    await importTwoCues("clip.vtt");
    const cue = vm.state.project!.cues[0];
    await vm.editCue(cue.id, { text: "Tom & Jerry" });
    expect(await vm.exportFile()).toBe(false);
    expect(downloadSubtitles).not.toHaveBeenCalled();
    expect(await vm.exportFile(true)).toBe(true);
    expect(downloadSubtitles).toHaveBeenCalledTimes(1);
    expect(vm.state.notice).toBe("字幕文件已导出");
  });

  it("re-evaluates the gate after the target format changes", async () => {
    await importTwoCues("clip.srt");
    const cue = vm.state.project!.cues[0];
    await vm.editCue(cue.id, { text: "<v Jim>Hello</v>" });
    // SRT 下 VTT 专有标签是文本问题，可强制导出
    expect(await vm.exportFile(true)).toBe(true);
    // 切到 VTT 后同样内容合法，普通导出直接通过
    vm.setFormat("vtt");
    expect(await vm.exportFile()).toBe(true);
    expect(downloadSubtitles).toHaveBeenCalledTimes(2);
  });
});
