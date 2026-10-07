import { useMemo, useState } from "react";
import { validateForExport } from "../analyzers/exportValidator";
import type { ExportIssue } from "../analyzers/exportValidator";
import type { Format, SubtitleProject } from "../models";
import type { SubtitleMeterViewModel } from "../viewmodels/subtitleMeterViewModel";

export function VersionExportModule({
  project,
  vm,
  phase,
  onLocateIssue,
}: {
  project: SubtitleProject;
  vm: SubtitleMeterViewModel;
  phase: string;
  onLocateIssue: (cueId: string) => void;
}) {
  const check = useMemo(
    () => validateForExport(project.cues, project.format),
    [project.cues, project.format],
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const structuralCount = check.structural.length,
    textualCount = check.textual.length;
  const ready = structuralCount === 0 && textualCount === 0;

  const requestExport = () => {
    if (ready) {
      void vm.exportFile();
      return;
    }
    setReviewOpen(true);
  };

  const locate = (issue: ExportIssue) => {
    vm.selectCue(issue.cueId);
    onLocateIssue(issue.cueId);
  };

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
          disabled={phase === "exporting"}
          onClick={requestExport}
        >
          导出字幕 <span>↓</span>
        </button>
      </div>

      <div
        className={`export-check ${ready ? "ok" : structuralCount ? "blocked" : "warn"}`}
      >
        <button
          className="export-check-head"
          onClick={() => setReviewOpen((open) => !open)}
          aria-expanded={reviewOpen}
        >
          <span className="export-check-icon">
            {ready ? "✓" : structuralCount ? "!" : "·"}
          </span>
          <span className="export-check-title">
            {ready
              ? `${project.format.toUpperCase()} 导出检查通过`
              : structuralCount
                ? `${project.format.toUpperCase()} 检查发现 ${structuralCount} 项结构性问题，导出已拦截`
                : `${project.format.toUpperCase()} 检查发现 ${textualCount} 项文本问题`}
          </span>
          {!ready && (
            <span className="export-check-toggle">
              {reviewOpen ? "收起" : "查看"}
            </span>
          )}
        </button>

        {reviewOpen && !ready && (
          <div className="export-check-body">
            {structuralCount > 0 && (
              <div className="export-check-group">
                <strong className="error-color">
                  结构性问题 · {structuralCount}（必须修正后才能导出）
                </strong>
                {check.structural.map((issue) => (
                  <button
                    key={issue.id}
                    className="check-row error"
                    onClick={() => locate(issue)}
                  >
                    <span className="issue-bullet">!</span>
                    <span>{issue.message}</span>
                  </button>
                ))}
              </div>
            )}
            {textualCount > 0 && (
              <div className="export-check-group">
                <strong className="warning-color">
                  文本问题 · {textualCount}（可先修正，也可继续导出）
                </strong>
                {check.textual.map((issue) => (
                  <button
                    key={issue.id}
                    className="check-row warning"
                    onClick={() => locate(issue)}
                  >
                    <span className="issue-bullet">·</span>
                    <span>{issue.message}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="export-check-actions">
              {structuralCount === 0 && (
                <button
                  className="export-button"
                  disabled={phase === "exporting"}
                  onClick={() => void vm.exportFile(true)}
                >
                  忽略文本问题，仍然导出 {project.format.toUpperCase()}{" "}
                  <span>↓</span>
                </button>
              )}
              {structuralCount > 0 && (
                <span className="export-check-hint">
                  请前往「时间轴 / 问题检查」修正上述条目后再导出
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="privacy-note">字幕文件与项目版本仅保存在当前浏览器</p>
    </section>
  );
}
