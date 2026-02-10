import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Draggable from "react-draggable";
import { X } from "lucide-react";

interface IModalProps {
  title: string;
  children: React.ReactNode;
  isVisible: boolean;
  onClose: () => void;
  className?: string;
  centered?: boolean;
  autoHeight?: boolean;
  clickPosition?: { x: number; y: number } | null;
}

const CommonModal: React.FC<IModalProps> = ({
  children,
  title,
  isVisible,
  onClose,
  className,
  centered,
  autoHeight,
  clickPosition,
}: IModalProps) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isVisible && clickPosition) {
      // Calculate position to keep modal within viewport
      // Default size is 400x300, but might be different
      const width = 400;
      const height = 300;
      const padding = 20;

      let left = clickPosition.x;
      let top = clickPosition.y;

      // Adjust if going off screen
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - padding;
      }
      if (top + height > window.innerHeight) {
        top = window.innerHeight - height - padding;
      }

      // Ensure not off-screen top/left
      left = Math.max(padding, left);
      top = Math.max(padding, top);

      setPositionStyle({
        top: `${top}px`,
        left: `${left}px`,
        position: 'fixed' // Ensure fixed positioning when using coordinates
      });
    } else if (isVisible && !clickPosition) {
      // Reset to default CSS positioning if no click position
      setPositionStyle({});
    }
  }, [isVisible, clickPosition]);

  if (!isVisible) {
    return <></>;
  }

  const modalContent = (
    <Draggable
      nodeRef={nodeRef}
      bounds="body"
      handle=".rfm-modal-header"
      cancel=".rfm-modal-icon"
    >
      <div
        ref={nodeRef}
        className={`rfm-modal-container ${className || ""} ${centered ? "rfm-modal--centered" : ""}`}
        style={{
          ...(autoHeight ? { height: 'auto' } : {}),
          ...positionStyle
        }}
      >
        <div className="rfm-modal-header">
          <h3 className="rfm-modal-title">{title}</h3>
          <X
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rfm-modal-icon"
            size={20}
          />
        </div>
        <div className="rfm-modal-body">
          {children}
        </div>
      </div>
    </Draggable>
  );

  const content = centered ? (
    <div className="rfm-modal-centered-wrapper">
      {modalContent}
    </div>
  ) : modalContent;

  // Render modal to body using portal so it can be dragged anywhere
  return createPortal(content, document.body);
};

export default CommonModal;
