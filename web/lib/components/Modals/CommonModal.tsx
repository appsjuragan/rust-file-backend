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

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isVisible && isMobile) {
      // Push state to history when modal opens on mobile
      const stateId = `modal-${Math.random().toString(36).substr(2, 9)}`;
      window.history.pushState({ modalId: stateId }, "");

      const handlePopState = (e: PopStateEvent) => {
        // Only close if the new state doesn't match our modalId
        if (e.state?.modalId !== stateId) {
          onCloseRef.current();
        }
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        window.removeEventListener("popstate", handlePopState);
        // If the modal is closed manually (not via back button), 
        // we should remove the history entry we added if it's still there
        if (window.history.state?.modalId === stateId) {
          window.history.back();
        }
      };
    }
  }, [isVisible, isMobile]);

  useEffect(() => {
    if (isVisible && clickPosition && !isMobile) {
      // Calculate position to keep modal within viewport
      const width = 400;
      const height = 300;
      const padding = 20;

      let left = clickPosition.x;
      let top = clickPosition.y;

      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - padding;
      }
      if (top + height > window.innerHeight) {
        top = window.innerHeight - height - padding;
      }

      left = Math.max(padding, left);
      top = Math.max(padding, top);

      setPositionStyle({
        top: `${top}px`,
        left: `${left}px`,
        position: 'fixed'
      });
    } else if (isVisible && (!clickPosition || isMobile)) {
      setPositionStyle({});
    }
  }, [isVisible, clickPosition, isMobile]);

  if (!isVisible) {
    return <></>;
  }

  const modalContent = (
    <Draggable
      nodeRef={nodeRef}
      bounds="body"
      handle=".rfm-modal-header"
      cancel=".rfm-modal-icon"
      disabled={isMobile}
    >
      <div
        ref={nodeRef}
        className={`rfm-modal-container ${className || ""} ${centered ? "rfm-modal--centered" : ""}`}
        style={{
          ...(autoHeight ? { height: 'auto' } : {}),
          ...positionStyle
        }}
      >
        {isMobile && <div className="rfm-modal-handle" onClick={onClose} />}
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
