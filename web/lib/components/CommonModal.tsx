import React, { useRef } from "react";
import Draggable from "react-draggable";
import SvgIcon from "./SvgIcon";

interface IModalProps {
  title: string;
  children: React.ReactNode;
  isVisible: boolean;
  onClose: () => void;
}

const CommonModal: React.FC<IModalProps> = ({
  children,
  title,
  isVisible,
  onClose,
}: IModalProps) => {
  const nodeRef = useRef(null);

  if (!isVisible) {
    return <></>;
  }
  return (
    <Draggable nodeRef={nodeRef} bounds="#react-file-manager-workspace">
      <div ref={nodeRef} className="rfm-modal-container">
        <div>
          <h3 className="rfm-modal-title">{title}</h3>
          <SvgIcon
            onClick={onClose}
            svgType="close"
            className="rfm-modal-icon"
          />
        </div>
        <div className="rfm-modal-body">
          {children}
        </div>
      </div>
    </Draggable>
  );
};

export default CommonModal;
