import { timeText } from "../focus";

/** Clock graphic only; exact elapsed/remaining time remains available to assistive technology. */
export function FocusDial({ elapsed, duration, running, countup, overtime, recovery, due, idle }: {
  elapsed: number; duration: number; running: boolean; countup?: boolean; overtime?: boolean; recovery?: boolean; due?: boolean; idle?: boolean;
}) {
  const remaining = Math.max(0, duration - elapsed);
  const angle = (countup || overtime ? elapsed % 3600000 / 3600000 : Math.min(1, elapsed / Math.max(1, duration))) * 360;
  const label = idle ? `计划专注 ${timeText(duration)}` : `${countup || overtime ? "已专注" : "剩余"} ${timeText(countup || overtime ? elapsed : remaining)}${due ? "，时间到，可结束或继续" : recovery ? "，待恢复" : running ? overtime ? "，超时继续" : "，正在专注" : "，已暂停"}`;
  return <div className={`focus-dial ${running ? "running" : "paused"} ${overtime ? "overtime" : ""}`} role="timer" aria-label={label} title={label}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="dial-track" cx="60" cy="60" r="51"/>
      <circle className="dial-progress" cx="60" cy="60" r="51" pathLength="100" strokeDasharray={`${countup || overtime ? elapsed % 3600000 / 36000 : Math.min(100, elapsed / Math.max(1, duration) * 100)} 100`} transform="rotate(-90 60 60)"/>
      {Array.from({ length: 12 }, (_, i) => <line key={i} className="dial-tick" x1="60" y1="17" x2="60" y2={i % 3 === 0 ? "23" : "20"} transform={`rotate(${i * 30} 60 60)`}/>)}
      <line className="dial-hand" x1="60" y1="60" x2="60" y2="31" transform={`rotate(${angle} 60 60)`}/>
      <line className="dial-hand dial-short" x1="60" y1="60" x2="77" y2="60"/>
      <circle className="dial-pin" cx="60" cy="60" r="3"/>
    </svg>
    {!idle && <span className="dial-state">{due ? "时间到" : recovery ? "待恢复" : running ? overtime ? "继续中" : "专注中" : "已暂停"}</span>}
  </div>;
}
