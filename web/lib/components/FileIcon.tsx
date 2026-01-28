import React from "react";
import { useMemo } from "react";
// Context
import { useFileManager } from "../context";
// Components
import SvgIcon from "./SvgIcon";

interface IFileIcon {
  id: string;
  name: string;
  isDir: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const FileIcon = (props: IFileIcon) => {
  const { setCurrentFolder, onRefresh, clipboard, isCut } = useFileManager();
  const isBeingCut = isCut && clipboard?.id === props.id;

  const handleClick = async () => {
    if (props.onClick) {
      props.onClick();
      return;
    }
    if (props.isDir) {
      setCurrentFolder(props.id);
      if (onRefresh !== undefined) {
        try {
          await onRefresh(props.id);
        } catch (e) {
          throw new Error("Error during refresh");
        }
      }
    }
  };

  const fileExtension = useMemo((): string => {
    if (!props.name.includes(".")) {
      return "";
    }

    const nameArray = props.name.split(".");
    return `.${nameArray[nameArray.length - 1]}`;
  }, [props.id]);

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={props.onContextMenu}
        className={`rfm-file-icon-container ${isBeingCut ? "opacity-50" : ""}`}
      >
        <SvgIcon
          svgType={props.isDir ? "folder" : "file"}
          className="rfm-file-icon-svg"
        />
        <span className="rfm-file-icon-extension">{fileExtension}</span>
        <span className="rfm-file-icon-name">{props.name}</span>
      </div>
    </>
  );
};

export default FileIcon;
