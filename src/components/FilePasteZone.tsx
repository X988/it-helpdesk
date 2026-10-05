"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Called whenever the selected file list changes */
  onChange: (files: File[]) => void;
  accept?: string;
  maxFiles?: number;
  label?: string;
  hint?: string;
};

function isAllowed(file: File, accept: string) {
  if (!accept) return true;
  const parts = accept.split(",").map((s) => s.trim());
  return parts.some((p) => {
    if (p.endsWith("/*")) return file.type.startsWith(p.slice(0, -1));
    return file.type === p || file.name.toLowerCase().endsWith(p.replace(".", ""));
  });
}

/**
 * File picker + Ctrl+V paste of screenshots from clipboard.
 * Paste works when focus is inside the zone (or document if captureDocument).
 */
export default function FilePasteZone({
  onChange,
  accept = "image/png,image/jpeg,image/webp,application/pdf,text/plain",
  maxFiles = 5,
  label = "Скриншоты и файлы",
  hint = "До 5 файлов, до 10 МБ. Можно вставить скриншот Ctrl+V.",
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [pasteHint, setPasteHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const apply = useCallback(
    (next: File[]) => {
      const clipped = next.slice(0, maxFiles);
      setFiles(clipped);
      onChange(clipped);
      if (inputRef.current) {
        // Keep native input in sync is hard; we manage File[] in state and parent FormData.
        inputRef.current.value = "";
      }
    },
    [maxFiles, onChange],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const ok = incoming.filter((f) => isAllowed(f, accept));
      if (!ok.length) {
        setPasteHint("Тип файла не поддерживается");
        return;
      }
      apply([...files, ...ok].slice(0, maxFiles));
      setPasteHint(ok.length ? `Добавлено: ${ok.map((f) => f.name).join(", ")}` : "");
    },
    [accept, apply, files, maxFiles],
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const zone = zoneRef.current;
      if (!zone) return;
      const active = document.activeElement;
      const inZone = zone.contains(active as Node) || zone === active;
      // Also accept paste when focus is on body / nearby form fields inside parent form
      const form = zone.closest("form");
      const inForm = form && active && form.contains(active);
      if (!inZone && !inForm) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) {
            const name =
              f.name && f.name !== "image.png"
                ? f.name
                : `screenshot-${Date.now()}.png`;
            pasted.push(new File([f], name, { type: f.type || "image/png" }));
          }
        }
      }
      if (pasted.length) {
        e.preventDefault();
        addFiles(pasted);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles]);

  function removeAt(i: number) {
    apply(files.filter((_, idx) => idx !== i));
  }

  return (
    <div className="filePasteZone" ref={zoneRef} tabIndex={0}>
      <label>
        {label}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            addFiles(list);
          }}
        />
      </label>
      <p className="muted">{hint}</p>
      {pasteHint && <p className="muted">{pasteHint}</p>}
      {files.length > 0 && (
        <ul className="fileList">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span>
                {f.name} <span className="muted">({Math.ceil(f.size / 1024)} KB)</span>
              </span>
              <button type="button" className="secondary" onClick={() => removeAt(i)}>
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type { Props as FilePasteZoneProps };
