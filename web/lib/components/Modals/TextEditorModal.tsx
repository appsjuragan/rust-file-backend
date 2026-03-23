import React, { useEffect, useState, useRef, useCallback } from "react";
import CommonModal from "./CommonModal";
import { fileService } from "../../../src/services/fileService";
import { uploadService } from "../../../src/services/uploadService";
import SvgIcon from "../Icons/SvgIcon";

const EDITABLE_EXTENSIONS = [
    "txt", "md", "json", "xml", "csv", "log", "ini", "cfg", "conf",
    "yaml", "yml", "toml", "env", "properties", "sql", "sh", "bat",
    "ps1", "py", "rs", "go", "java", "kt", "c", "cpp", "h", "hpp",
    "js", "ts", "jsx", "tsx", "css", "scss", "sass", "less",
    "html", "htm", "svg", "makefile", "dockerfile",
];

const MAX_EDITABLE_SIZE = 5 * 1024 * 1024; // 5MB

export const isEditableTextFile = (
    fileName: string,
    mimeType?: string,
    size?: number,
): boolean => {
    if ((size || 0) > MAX_EDITABLE_SIZE) return false;
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (EDITABLE_EXTENSIONS.includes(ext)) return true;
    if (mimeType?.startsWith("text/")) return true;
    if (mimeType === "application/json") return true;
    if (mimeType === "application/xml") return true;
    return false;
};

// Simple syntax hint based on extension
const getLanguageHint = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const langMap: Record<string, string> = {
        json: "JSON", xml: "XML", html: "HTML", htm: "HTML", svg: "SVG",
        css: "CSS", scss: "SCSS", less: "LESS", js: "JavaScript",
        ts: "TypeScript", jsx: "JSX", tsx: "TSX", py: "Python",
        rs: "Rust", go: "Go", java: "Java", kt: "Kotlin",
        c: "C", cpp: "C++", h: "C Header", hpp: "C++ Header",
        sql: "SQL", sh: "Shell", bat: "Batch", ps1: "PowerShell",
        yaml: "YAML", yml: "YAML", toml: "TOML", md: "Markdown",
        txt: "Plain Text", log: "Log", csv: "CSV", ini: "INI",
        cfg: "Config", conf: "Config", env: "Env",
    };
    return langMap[ext] || "Text";
};

interface TextEditorModalProps {
    isVisible: boolean;
    onClose: () => void;
    fileName: string;
    fileId: string;
    parentId?: string;
    mimeType?: string;
    size?: number;
    onFileUpdated?: (parentId: string) => void;
    clickPosition?: { x: number; y: number } | null;
}

const TextEditorModal: React.FC<TextEditorModalProps> = ({
    isVisible,
    onClose,
    fileName,
    fileId,
    parentId,
    mimeType,
    size,
    onFileUpdated,
    clickPosition,
}) => {
    const [content, setContent] = useState<string>("");
    const [originalContent, setOriginalContent] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    // Track the current file ID (changes after each save since we delete+re-upload)
    const [currentFileId, setCurrentFileId] = useState<string>(fileId);

    // Sync currentFileId when props change (e.g., opening a different file)
    useEffect(() => {
        setCurrentFileId(fileId);
    }, [fileId]);

    const hasChanges = content !== originalContent;
    const language = getLanguageHint(fileName);

    // Line & column tracking
    const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });

    const updateCursorInfo = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const pos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, pos);
        const lines = textBefore.split("\n");
        setCursorInfo({ line: lines.length, col: (lines[lines.length - 1]?.length || 0) + 1 });
    }, []);

    // Load content
    useEffect(() => {
        if (!isVisible || !currentFileId) return;

        setLoading(true);
        setError(null);
        setSaved(false);

        const loadContent = async () => {
            try {
                const res = await fileService.getDownloadTicket(currentFileId);
                const urlToUse = res.url;
                if (!urlToUse) throw new Error("No download URL available");

                const response = await fetch(urlToUse);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const text = await response.text();
                setContent(text);
                setOriginalContent(text);
            } catch (err: any) {
                setError(err.message || "Failed to load file");
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [isVisible, currentFileId]);

    // Keyboard shortcut: Ctrl+S to save
    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                if (hasChanges && !saving) handleSave();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isVisible, hasChanges, saving, content]);

    // Tab key support
    const handleKeyDownTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const textarea = e.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newContent = content.substring(0, start) + "  " + content.substring(end);
            setContent(newContent);
            // Restore cursor position after state update
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 2;
            });
        }
    };

    const handleSave = async () => {
        if (!hasChanges || saving) return;
        setSaving(true);
        setError(null);

        try {
            const file = new File([content], fileName, {
                type: mimeType || "text/plain",
            });
            const targetParentId = parentId || "0";

            // 1. Delete the old file
            try {
                await fileService.deleteItem(currentFileId);
            } catch (e) {
                console.error("Failed to delete old file:", e);
                // Continue anyway — the upload will create a new file
            }

            // 2. Upload the new file content directly (bypass the upload pipeline)
            const result = await uploadService.uploadFile(
                file,
                targetParentId === "0" ? undefined : targetParentId,
            ) as any;

            // 3. Update the file ID so subsequent saves target the new file
            if (result && result.id) {
                setCurrentFileId(result.id);
            }

            setOriginalContent(content);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);

            // 4. Notify parent to refresh the file list
            if (onFileUpdated) {
                onFileUpdated(targetParentId);
            }
        } catch (err: any) {
            setError(err.message || "Failed to save file");
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        if (hasChanges) {
            if (!window.confirm("You have unsaved changes. Discard them?")) return;
        }
        setContent("");
        setOriginalContent("");
        setError(null);
        onClose();
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const lineCount = content.split("\n").length;

    return (
        <CommonModal
            isVisible={isVisible}
            onClose={handleClose}
            title={`Edit: ${fileName}`}
            className="rfm-preview-modal rfm-text-editor-modal"
            clickPosition={clickPosition}
        >
            {loading ? (
                <div className="rfm-preview-loading">Loading file content...</div>
            ) : error && !content ? (
                <div className="rfm-editor-error">
                    <SvgIcon svgType="info" className="w-5 h-5 text-rose-500" />
                    <span>{error}</span>
                </div>
            ) : (
                <div className="rfm-editor-wrapper">
                    {/* Toolbar */}
                    <div className="rfm-editor-toolbar">
                        <div className="rfm-editor-toolbar-left">
                            <span className="rfm-editor-lang-badge">{language}</span>
                            {size && (
                                <span className="rfm-editor-size-info">{formatSize(size)}</span>
                            )}
                            <span className="rfm-editor-lines-info">
                                {lineCount} line{lineCount !== 1 ? "s" : ""}
                            </span>
                        </div>
                        <div className="rfm-editor-toolbar-right">
                            <span className="rfm-editor-cursor-info">
                                Ln {cursorInfo.line}, Col {cursorInfo.col}
                            </span>
                            {hasChanges && (
                                <span className="rfm-editor-modified-badge">Modified</span>
                            )}
                            {saved && (
                                <span className="rfm-editor-saved-badge">
                                    <SvgIcon svgType="check" className="w-3.5 h-3.5" />
                                    Saved
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Editor area */}
                    <div className="rfm-editor-content">
                        <div className="rfm-editor-line-numbers" aria-hidden="true" ref={lineNumbersRef}>
                            {Array.from({ length: lineCount }, (_, i) => (
                                <div key={i + 1} className="rfm-editor-line-number">
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                        <textarea
                            ref={textareaRef}
                            onScroll={handleScroll}
                            className="rfm-editor-textarea"
                            value={content}
                            onChange={(e) => {
                                setContent(e.target.value);
                                updateCursorInfo();
                            }}
                            onKeyUp={updateCursorInfo}
                            onClick={updateCursorInfo}
                            onKeyDown={handleKeyDownTextarea}
                            spellCheck={false}
                            autoComplete="off"
                            autoCapitalize="off"
                            wrap="off"
                        />
                    </div>

                    {/* Status bar */}
                    <div className="rfm-editor-statusbar">
                        <div className="rfm-editor-statusbar-left">
                            {error && (
                                <span className="rfm-editor-error-inline">
                                    <SvgIcon svgType="info" className="w-3.5 h-3.5" />
                                    {error}
                                </span>
                            )}
                        </div>
                        <div className="rfm-editor-statusbar-right">
                            <button
                                className="rfm-editor-save-btn"
                                onClick={handleSave}
                                disabled={!hasChanges || saving}
                                title="Save (Ctrl+S)"
                            >
                                {saving ? (
                                    <>
                                        <div className="rfm-spinner-small" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <SvgIcon svgType="check" className="w-4 h-4" />
                                        Save
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </CommonModal>
    );
};

export default TextEditorModal;
