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
}

const FileIcon = (props: IFileIcon) => {
  const { setCurrentFolder, onRefresh, clipboardIds, isCut } = useFileManager();
  const isBeingCut = isCut && clipboardIds?.includes(props.id);

  const fileExtension = useMemo((): string => {
    if (props.isDir || !props.name.includes(".")) {
      return "";
    }

    const nameArray = props.name.split(".");
    const ext = nameArray[nameArray.length - 1].trim();

    // Valid extensions for icon overlay: 2-4 chars, alphanumeric only
    const isValidExt = /^[a-z0-9]{2,4}$/i.test(ext);

    if (!isValidExt) {
      return "";
    }

    return ext;
  }, [props.name, props.isDir]);

  return (
    <div className={`rfm-file-icon-container ${isBeingCut ? 'opacity-40' : ''}`}>
      <SvgIcon
        svgType={props.isDir ? "folder" : "file"}
        className="rfm-file-icon-svg"
      />
      {!props.isDir && fileExtension && (
        <span className="rfm-file-icon-extension">{fileExtension}</span>
      )}
      <span className="rfm-file-icon-name">{props.name}</span>
    </div>
  );
};

export default FileIcon;
