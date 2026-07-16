"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TopologyTimeSliderProps = {
  times: string[];
  selectedTime?: string;
};

export default function TopologyTimeSlider({ times, selectedTime }: TopologyTimeSliderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const selectedIndex = useMemo(() => {
    if (!selectedTime) return 0;
    const found = times.indexOf(selectedTime);
    return found >= 0 ? found : 0;
  }, [selectedTime, times]);

  useEffect(() => {
    setIndex(selectedIndex);
  }, [selectedIndex]);

  const currentTime = times[index] || "";
  const canSlide = times.length > 0;

  const commitTime = (time: string | null, replace = false) => {
    const next = new URLSearchParams(searchParams.toString());
    if (time) {
      next.set("time", time);
    } else {
      next.delete("time");
    }
    const url = `${pathname}?${next.toString()}`;
    if (replace) {
      router.replace(url, { scroll: false });
    } else {
      router.push(url, { scroll: false });
    }
  };

  useEffect(() => {
    if (!playing || !canSlide) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        const nextIndex = current >= times.length - 1 ? 0 : current + 1;
        commitTime(times[nextIndex], true);
        return nextIndex;
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [playing, canSlide, times, searchParams, pathname, router]);

  return (
    <div className="topology-time-slider">
      <div className="topology-time-slider-head">
        <button
          type="button"
          className={!selectedTime ? "topology-time-all is-active" : "topology-time-all"}
          onClick={() => {
            setPlaying(false);
            commitTime(null);
          }}
        >
          全天汇总
        </button>
        <button
          type="button"
          className="topology-time-play"
          disabled={!canSlide}
          onClick={() => {
            if (!selectedTime && currentTime) {
              commitTime(currentTime, true);
            }
            setPlaying((current) => !current);
          }}
          aria-label={playing ? "暂停时点播放" : "播放时点变化"}
        >
          <span className={playing ? "topology-pause-icon" : "topology-play-icon"} />
        </button>
        <div className="topology-time-current">
          <span>时刻值</span>
          <strong>{selectedTime || currentTime || "--:--"}</strong>
        </div>
      </div>

      <div className="topology-time-track-wrap">
        <input
          type="range"
          min="0"
          max={Math.max(times.length - 1, 0)}
          step="1"
          value={index}
          disabled={!canSlide}
          onChange={(event) => setIndex(Number(event.target.value))}
          onMouseUp={() => currentTime && commitTime(currentTime)}
          onTouchEnd={() => currentTime && commitTime(currentTime)}
          className="topology-time-range"
          style={{ "--slider-progress": `${times.length > 1 ? (index / (times.length - 1)) * 100 : 0}%` } as CSSProperties}
        />
        <div className="topology-time-track-labels">
          <span>{times[0] || "--:--"}</span>
          <span>{times[Math.floor((times.length - 1) / 2)] || "--:--"}</span>
          <span>{times.at(-1) || "--:--"}</span>
        </div>
      </div>
    </div>
  );
}
