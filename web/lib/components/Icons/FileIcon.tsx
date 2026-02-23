import React, { useMemo } from "react";
// Context
import { useFileManager } from "../../context";
// Components
import SvgIcon from "./SvgIcon";
import "./FileIcon.css";

interface IFileIcon {
  id: string;
  name: string;
  isDir: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  hideName?: boolean;
  className?: string;
  isFavorite?: boolean;
}

const FileIcon = (props: IFileIcon) => {
  const { setCurrentFolder, onRefresh, clipboardIds, isCut, favorites } =
    useFileManager();
  const isBeingCut = !!(
    isCut &&
    Array.isArray(clipboardIds) &&
    clipboardIds.includes(props.id)
  );

  // Determine favorite status: either from prop or by checking against favorites in context
  const isFavorited =
    props.isFavorite !== undefined
      ? props.isFavorite
      : favorites?.some((f) => f.id === props.id) || false;

  const fileExtension = useMemo((): string => {
    if (props.isDir || !props.name.includes(".")) {
      return "";
    }

    const nameArray = props.name.split(".");
    const ext = (nameArray[nameArray.length - 1] || "").trim().toLowerCase();

    // Valid extensions for icon overlay: 2-4 chars, alphanumeric only
    const isValidExt = /^[a-z0-9]{2,4}$/i.test(ext);

    if (!isValidExt) {
      return "";
    }

    return ext;
  }, [props.name, props.isDir]);

  const colorCategory = useMemo(() => {
    if (props.isDir) return "folder";
    const ext = fileExtension.toLowerCase();

    if (
      ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico"].includes(ext)
    )
      return "image";
    if (
      [
        "mp4",
        "mkv",
        "avi",
        "mov",
        "wmv",
        "flv",
        "webm",
        "mpg",
        "mpeg",
      ].includes(ext)
    )
      return "video";
    if (["pdf"].includes(ext)) return "pdf";
    if (["doc", "docx", "rtf", "odt"].includes(ext)) return "word";
    if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "excel";
    if (["ppt", "pptx", "odp"].includes(ext)) return "powerpoint";
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext))
      return "archive";
    if (
      ["txt", "md", "log", "ini", "conf", "json", "yml", "yaml"].includes(ext)
    )
      return "text";
    if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext))
      return "audio";
    if (
      [
        "js",
        "ts",
        "tsx",
        "jsx",
        "py",
        "rb",
        "php",
        "c",
        "cpp",
        "h",
        "java",
        "go",
        "rs",
        "html",
        "css",
      ].includes(ext)
    )
      return "code";

    return "default";
  }, [fileExtension, props.isDir]);

  return (
    <div
      className={`rfm-file-icon-container ${props.className || ""} ${
        isBeingCut ? "opacity-40" : ""
      }`}
      data-color={colorCategory}
    >
      <div className="rfm-file-icon-wrapper relative flex justify-center items-center shrink-0">
        <SvgIcon
          svgType={props.isDir ? "folder" : "file"}
          className="rfm-file-icon-svg"
        />
        {!props.isDir && fileExtension && (
          <span className="rfm-file-icon-extension">{fileExtension}</span>
        )}
        {isFavorited && (
          <div className="rfm-file-icon-favorite-badge">
            <SvgIcon
              svgType="star"
              className="w-full h-full text-yellow-500 fill-current shadow-sm"
            />
          </div>
        )}
      </div>
      {!props.hideName && (
        <span className="rfm-file-icon-name">{props.name}</span>
      )}
    </div>
  );
};

export default FileIcon;
