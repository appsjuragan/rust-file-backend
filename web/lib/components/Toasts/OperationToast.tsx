import React from "react";
import { useFileManager } from "../../context";
import SvgIcon from "../Icons/SvgIcon";

const OperationToast = () => {
  const { isMoving, isZipping } = useFileManager();

  if (!isMoving && !isZipping) return null;

  return (
    <div className="rfm-operation-toast">
      <div className="rfm-operation-toast-content">
        <div className="rfm-spinner-small mr-3"></div>
        <span className="text-sm font-medium">
          {isZipping ? "Preparing ZIP archive..." : "Moving items..."}
        </span>
      </div>
    </div>
  );
};

export default OperationToast;
