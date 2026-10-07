import { validateExport, type ExportIssue } from "../analyzers/exportValidator";
import type { Format, SubtitleCue, SubtitleProject } from "../models";
import type { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";

interface VersionExportModuleProps {
  project: SubtitleProject;
  cues: SubtitleCue[];
  vm: SubtitleMeterViewModel;
  phase: string;
  reviewOpen: boolean;
  onInspectIssue: (cueId: string) => void;
}

function ExportIssueRows({
  issues,
  cues,
  onInspectIssue,
}: {
  issues: ExportIssue[];
  cues: SubtitleCue[];
  onInspectIssue: (cueId: string) => void;
}) {
  return (
    <div className="export-issue-list">
      {issues.map((issue) => {
        const cue = cues.find((item) => item.id === issue.cueId);
        return (
          <button
            key={issue.id}
            className="export-issue-row"
            onClick={() => onInspectIssue(issue.cueId)}
          >
            <span className="issue-cue">#{cue?.index}</span>
            <span>{issue.message}</span>
          </button>
        );
      })}
    </div>
  );
}

export function VersionExportModule({
  project,
  cues,
  vm,
  phase,
  reviewOpen,
  onInspectIssue,
}: VersionExportModuleProps) {
  const validation = validateExport(cues, project.format),
    targetLabel = project.format === "vtt" ? "WebVTT" : "SRT",
    exporting = phase === "exporting",
    hasStructural = validation.structural.length > 0,
    hasText = validation.text.length > 0,
    hasIssues = hasStructural || hasText;

  return (
    <section className="module version-module">
      <div className="module-head">
        <div>
          <span className="module-kicker">04 / VERSIONS & EXPORT</span>
          <h2>版本与交付</h2>
        </div>
        <span className="saved-label">● 自动保存</span>
      </div>
      <div className="version-row">
        <div>
          <strong>本地快照</strong>
          <small>
            {project.versions.length
              ? `最近：${project.versions.at(-1)?.label}`
              : "保存当前版本以便回退"}
          </small>
        </div>
        <button
          className="secondary-button"
          onClick={() => void vm.saveVersion()}
        >
          ＋ 保存快照
        </button>
      </div>
      {project.versions.length > 0 && (
        <div className="version-list">
          {project.versions.map((version) => (
            <button
              key={version.id}
              onClick={() => void vm.restoreVersion(version.id)}
            >
              {version.label}
              <span>恢复 ↗</span>
            </button>
          ))}
        </div>
      )}
      <div className="export-row">
        <label>
          格式
          <select
            aria-label="导出格式"
            value={project.format}
            onChange={(e) => vm.setFormat(e.target.value as Format)}
          >
            <option value="srt">SRT</option>
            <option value="vtt">WebVTT</option>
          </select>
        </label>
        <button
          className="export-button"
          disabled={exporting}
          onClick={() => void vm.exportFile()}
        >
          {exporting ? "正在导出…" : "导出字幕"} <span>↓</span>
        </button>
      </div>

      {reviewOpen && (
        <div
          className={`export-review ${hasStructural ? "blocked" : hasIssues ? "warning" : "clear"}`}
          role="alert"
        >
          <div className="export-review-head">
            <div>
              <strong>
                {targetLabel} 导出检查：
                {hasStructural
                  ? ` ${validation.structural.length} 项结构问题必须处理`
                  : hasText
                    ? ` ${validation.text.length} 项文本/阅读提醒`
                    : " 未发现导出问题"}
              </strong>
              <p>
                {hasStructural
                  ? "以下问题可能导致播放器忽略条目或显示异常，当前格式无法继续导出。"
                  : hasText
                    ? "这些内容不会破坏文件结构；可以先修改，也可以确认后继续导出。"
                    : "当前格式的结构与文本检查均已通过，可以直接导出。"}
              </p>
            </div>
            <button
              className="review-close"
              onClick={() => vm.closeExportReview()}
              aria-label="关闭导出检查"
            >
              ×
            </button>
          </div>

          {hasIssues && (
            <>
              {hasStructural && (
                <div className="export-issue-group">
                  <span className="export-group-label error-color">
                    结构问题
                  </span>
                  <ExportIssueRows
                    issues={validation.structural}
                    cues={cues}
                    onInspectIssue={onInspectIssue}
                  />
                </div>
              )}
              {hasText && (
                <div className="export-issue-group">
                  <span className="export-group-label warning-color">
                    文本与阅读提醒
                  </span>
                  <ExportIssueRows
                    issues={validation.text}
                    cues={cues}
                    onInspectIssue={onInspectIssue}
                  />
                </div>
              )}
            </>
          )}

          <div className="export-review-actions">
            {hasIssues && (
              <button
                className="secondary-button"
                onClick={() => onInspectIssue(validation.issues[0].cueId)}
              >
                先去修正
              </button>
            )}
            {!hasStructural && (
              <button
                className="export-button continue-export"
                disabled={exporting}
                onClick={() => void vm.exportFile(hasText)}
              >
                {hasText ? "了解风险，继续导出" : "直接导出"}
              </button>
            )}
          </div>
        </div>
      )}

      <p className="privacy-note">
        {reviewOpen
          ? `检查按 ${targetLabel} 重新计算，切换格式后结论会即时变化`
          : "字幕文件与项目版本仅保存在当前浏览器"}
      </p>
    </section>
  );
}
