import React from "react";
import { useFileManager } from "../context";
import SvgIcon from "./SvgIcon";

const OperationToast = () => {
    const { isMoving } = useFileManager();

    if (!isMoving) return null;

    return (
        <div className="rfm-operation-toast">
            <div className="rfm-operation-toast-content">
                <div className="rfm-spinner-small mr-3"></div>
                <span className="text-sm font-medium">Moving items...</span>
            </div>
        </div>
    );
};

export default OperationToast;
