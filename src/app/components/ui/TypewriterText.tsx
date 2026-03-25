"use client";

import { useEffect, useRef, useState, memo } from "react";

interface TypewriterTextProps {
  text: string | string[];
  speed?: number;
  onDone?: () => void;
  className?: string;
}

function TypewriterTextR({
  text,
  speed = 40,
  onDone,
  className = "",
}: TypewriterTextProps) {
  const lines = Array.isArray(text) ? text : [text];
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Reset when text prop changes
  useEffect(() => {
    setLineIdx(0);
    setCharIdx(0);
    setDone(false);
  }, [text]);

  useEffect(() => {
    if (done) {
      onDoneRef.current?.();
      return;
    }

    const currentLine = lines[lineIdx] ?? "";

    if (charIdx < currentLine.length) {
      const timer = setTimeout(() => setCharIdx((c) => c + 1), speed);
      return () => clearTimeout(timer);
    }

    // Finished current line
    if (lineIdx < lines.length - 1) {
      const pause = setTimeout(() => {
        setLineIdx((l) => l + 1);
        setCharIdx(0);
      }, 400);
      return () => clearTimeout(pause);
    }

    // All lines done
    setDone(true);
  }, [charIdx, lineIdx, done, lines, speed]);

  const displayedLines = lines.slice(0, lineIdx + 1).map((line, i) => {
    if (i < lineIdx) return line;
    return line.slice(0, charIdx);
  });

  return (
    <span className={`font-pixel ${className}`}>
      {displayedLines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
      {!done && <span className="poke-cursor" aria-hidden="true" />}
    </span>
  );
}

export const TypewriterText = memo(TypewriterTextR);
